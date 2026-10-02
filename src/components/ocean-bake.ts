// Rasterized stand-in for the ocean layers: pan and zoom move images instead of re-running masks and filters
import { viewport } from "@/components/viewport";
import { getBase64 } from "@/utils/commonUtils";
import { findEl } from "@/utils/nodeUtils";

const NS = "http://www.w3.org/2000/svg";
const GROUP_ID = "oceanBaked";
const BAKED_CLASS = "ocean-baked";
const SOURCES = ["ocean", "oceanHeights", "water"]; // what the images are drawn from
const BASE_SCALE = 2; // full-map image resolution, in pixels per map unit
const MAX_SIDE = 8192;
const MAX_PIXELS = 32e6;
const DEBOUNCE = 300;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Bake extends Rect {
  scale: number;
  url: string;
}

let enabled = false;
let observer: MutationObserver | null = null;
let timer = 0;
let version = 0; // a bake finishing after a change is discarded
let base: Bake | null = null;
let detail: Bake | null = null;
let patternData: string | null = null;

/** Restart from scratch: the map may have been replaced since the last call */
function setEnabled(on: boolean): void {
  stop();
  enabled = on;
  if (!on) return;
  observer = new MutationObserver(records => {
    if (records.some(isSourceChange)) invalidate();
  });
  for (const id of SOURCES) {
    const el = findEl(id);
    if (el) observer.observe(el, { subtree: true, childList: true, attributes: true, characterData: true });
  }
  schedule(0);
}

function isSourceChange({ target, addedNodes, removedNodes }: MutationRecord): boolean {
  if (findEl(GROUP_ID)?.contains(target)) return false;
  const nodes = [...addedNodes, ...removedNodes];
  return !nodes.length || nodes.some(node => (node as Element).id !== GROUP_ID);
}

function stop(): void {
  observer?.disconnect();
  observer = null;
  window.clearTimeout(timer);
  version++;
  findEl("viewbox")?.classList.remove(BAKED_CLASS);
  const group = findEl(GROUP_ID);
  for (const image of group?.querySelectorAll("image") ?? []) URL.revokeObjectURL(image.getAttribute("href") ?? "");
  group?.remove();
  base = detail = null;
}

function invalidate(): void {
  version++;
  base = detail = null; // stale images stay on screen until replaced
  schedule(DEBOUNCE);
}

function schedule(delay: number): void {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => void bake(), delay);
}

/** Called once a zoom or pan settles: sharpen the visible part if the base image is too coarse for it */
function onViewSettled(): void {
  if (enabled && base && needsDetail()) schedule(0);
}

function visibleRect(): Rect {
  const k = viewport.scale;
  return { x: -viewport.x / k, y: -viewport.y / k, w: viewport.width / k, h: viewport.height / k };
}

const wantedScale = () => viewport.scale * (window.devicePixelRatio || 1);

function needsDetail(): boolean {
  const wanted = wantedScale();
  if (!base || wanted <= base.scale * 1.15) return false;
  if (!detail) return true;
  const view = visibleRect();
  const covers =
    view.x >= detail.x &&
    view.y >= detail.y &&
    view.x + view.w <= detail.x + detail.w &&
    view.y + view.h <= detail.y + detail.h;
  return !covers || wanted > detail.scale * 1.3;
}

const fitScale = ({ w, h }: Rect, wanted: number) =>
  Math.min(wanted, MAX_SIDE / w, MAX_SIDE / h, Math.sqrt(MAX_PIXELS / (w * h)));

async function bake(): Promise<void> {
  const ocean = findEl<SVGGElement>("ocean");
  if (!enabled || !ocean) return;
  const id = version;

  try {
    if (!base) {
      const box = ocean.getBBox();
      const rect = { x: box.x, y: box.y, w: box.width, h: box.height };
      if (!rect.w || !rect.h) return;
      const result = await render(rect, fitScale(rect, BASE_SCALE * (window.devicePixelRatio || 1)));
      if (id !== version) return URL.revokeObjectURL(result.url);
      base = result;
      detail = null;
      show();
    }

    if (needsDetail()) {
      const view = visibleRect();
      const x = Math.max(base.x, view.x - view.w / 2);
      const y = Math.max(base.y, view.y - view.h / 2);
      const rect = {
        x,
        y,
        w: Math.min(base.x + base.w, view.x + view.w * 1.5) - x,
        h: Math.min(base.y + base.h, view.y + view.h * 1.5) - y
      };
      const result = await render(rect, fitScale(rect, wantedScale()));
      if (id !== version) return URL.revokeObjectURL(result.url);
      detail = result;
      show();
    }
  } catch (error) {
    ERROR && console.error("Ocean bake failed", error);
  }
}

function show(): void {
  const ocean = findEl("ocean");
  if (!ocean || !base) return;
  let group = findEl<SVGGElement>(GROUP_ID);
  if (!group) {
    group = document.createElementNS(NS, "g");
    group.id = GROUP_ID;
    group.setAttribute("pointer-events", "none");
    ocean.prepend(group);
  }
  const previous = Array.from(group.querySelectorAll("image"), image => image.getAttribute("href"));
  group.innerHTML = [base, detail]
    .filter(bake => bake !== null)
    .map(
      ({ x, y, w, h, url }) =>
        `<image x="${x}" y="${y}" width="${w}" height="${h}" href="${url}" preserveAspectRatio="none" />`
    )
    .join("");
  for (const url of previous) if (url && url !== base.url && url !== detail?.url) URL.revokeObjectURL(url);
  findEl("viewbox")?.classList.add(BAKED_CLASS);
}

async function render(rect: Rect, scale: number): Promise<Bake> {
  const width = Math.max(1, Math.round(rect.w * scale));
  const height = Math.max(1, Math.round(rect.h * scale));
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("xmlns", NS);
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  svg.setAttribute("viewBox", `${rect.x} ${rect.y} ${rect.w} ${rect.h}`);

  const defs = findEl("map")?.querySelector("defs")?.cloneNode(true) as SVGDefsElement | undefined;
  if (defs) {
    const pattern = defs.querySelector("#oceanicPattern");
    const href = pattern?.getAttribute("href");
    if (pattern && href && !href.startsWith("data:")) {
      patternData ??= await loadBase64(href); // an image drawn into a canvas cannot fetch app files
      if (patternData) pattern.setAttribute("href", patternData);
      else pattern.remove();
    }
    svg.append(defs);
  }
  const ocean = findEl("ocean")!.cloneNode(true) as SVGGElement;
  ocean.querySelector(`#${GROUP_ID}`)?.remove();
  svg.append(ocean);
  const depths = findEl("oceanHeights")?.cloneNode(true);
  if (depths) svg.append(depths);

  const source = URL.createObjectURL(
    new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml;charset=utf-8" })
  );
  try {
    const image = new Image();
    image.src = source;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")!.drawImage(image, 0, 0, width, height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("Cannot encode ocean image");
    return { ...rect, scale, url: URL.createObjectURL(blob) };
  } finally {
    URL.revokeObjectURL(source);
  }
}

const loadBase64 = (url: string) =>
  new Promise<string | null>(resolve => getBase64(url, data => resolve(typeof data === "string" ? data : null)));

/** Saved and exported copies of the map get the live ocean back */
function strip(clone: Element): void {
  clone.querySelector(`#${GROUP_ID}`)?.remove();
  clone.querySelector("#viewbox")?.classList.remove(BAKED_CLASS);
}

export const OceanBake = { setEnabled, onViewSettled, strip };
