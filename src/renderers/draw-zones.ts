import type { Zone } from "@/generators/zones-generator";
import { ensureEl, getVertexPath } from "@/utils";

// not read off the editor's select: the paint editor destroys that dialog mid-redraw (#1810)
export const zonesFilter = { type: "all" };

export function drawZones(): void {
  const { type: filterBy } = zonesFilter;
  const isFiltered = filterBy !== "all";
  const layers = globalThis.styles?.zones?.options?.layers ?? {};
  const visibleZones = pack.zones.filter(
    ({ hidden, cells, type }) => !hidden && cells.length && (!isFiltered || type === filterBy) && !layers[type]?.hidden
  );

  // ordinary zones first, then each user layer in its own group with its own look
  const plain = visibleZones.filter(zone => !layers[zone.type]);
  const grouped = Object.entries(layers).map(([name, { opacity, blur, stroke }]) => {
    const zones = visibleZones.filter(zone => zone.type === name);
    if (!zones.length) return "";
    const filter = blur ? ` filter="blur(${blur}px)"` : "";
    const outline = stroke ? "" : ` stroke="none"`;
    return /* html */ `<g data-zone-layer="${escapeAttr(name)}" opacity="${opacity}"${filter}${outline}>${zones.map(drawZone).join("")}</g>`;
  });

  ensureEl("zones").innerHTML = plain.map(drawZone).join("") + grouped.join("");
}

const escapeAttr = (text: string) => text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

function drawZone({ i, cells, type, color }: Zone): string {
  const path = getVertexPath(cells, pack);
  return /* html */ `<path id="zone${i}" data-id="${i}" data-type="${escapeAttr(type)}" d="${path}" fill="${color}" />`;
}
