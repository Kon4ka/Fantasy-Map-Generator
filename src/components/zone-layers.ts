// User layers: a zone type promoted to its own toggle and look. Settings live in styles.zones.options.layers
import { Layers } from "@/components/layers";

export interface ZoneLayerStyle {
  hidden: boolean;
  opacity: number;
  blur: number; // px of edge blur, 0 for crisp
  stroke: boolean;
}

export const DEFAULT_ZONE_LAYER: ZoneLayerStyle = { hidden: false, opacity: 1, blur: 0, stroke: false }; // opacity multiplies the Zones layer one
const MAX_NAME = 60;

const listeners = new Set<() => void>();
// the layers tab renders before the styles store exists
const store = (): Record<string, ZoneLayerStyle> => globalThis.styles?.zones?.options?.layers ?? {};

/** Every view of the user layers re-renders on change */
function onChange(listener: () => void): void {
  listeners.add(listener);
}

function changed(): void {
  Layers.draw("zones");
  for (const listener of listeners) listener();
}

const list = (): string[] => Object.keys(store());
const get = (name: string): ZoneLayerStyle | undefined => store()[name];
const has = (name: string): boolean => Object.hasOwn(store(), name);

function checkName(name: unknown): string {
  const trimmed = typeof name === "string" ? name.trim() : "";
  if (!trimmed || trimmed.length > MAX_NAME) throw new Error(`layer name must be 1–${MAX_NAME} characters`);
  return trimmed;
}

function checkStyle(patch: Partial<ZoneLayerStyle>): Partial<ZoneLayerStyle> {
  const { hidden, opacity, blur, stroke } = patch;
  if (hidden !== undefined && typeof hidden !== "boolean") throw new Error("hidden must be true or false");
  if (stroke !== undefined && typeof stroke !== "boolean") throw new Error("stroke must be true or false");
  if (opacity !== undefined && !(typeof opacity === "number" && opacity >= 0 && opacity <= 1)) {
    throw new Error("opacity must be between 0 and 1");
  }
  if (blur !== undefined && !(typeof blur === "number" && blur >= 0 && blur <= 20))
    throw new Error("blur must be 0–20");
  return Object.fromEntries(Object.entries({ hidden, opacity, blur, stroke }).filter(([, v]) => v !== undefined));
}

/** A new layer; zones of that type already on the map join it */
function create(name: unknown, patch: Partial<ZoneLayerStyle> = {}): string {
  const layer = checkName(name);
  if (has(layer)) throw new Error(`layer "${layer}" already exists`);
  store()[layer] = { ...DEFAULT_ZONE_LAYER, ...checkStyle(patch) };
  if (!Layers.isOn("zones")) Layers.show("zones");
  changed();
  return layer;
}

function update(name: string, patch: Partial<ZoneLayerStyle>): void {
  const layer = get(name);
  if (!layer) throw new Error(`layer "${name}" not found`);
  Object.assign(layer, checkStyle(patch));
  if (patch.hidden === false && !Layers.isOn("zones")) Layers.show("zones");
  changed();
}

/** Rename the layer and the type of its zones */
function rename(name: string, newName: unknown): string {
  const layer = get(name);
  if (!layer) throw new Error(`layer "${name}" not found`);
  const target = checkName(newName);
  if (target === name) return name;
  if (has(target)) throw new Error(`layer "${target}" already exists`);
  const entries = Object.entries(store()).map(([key, value]) => [key === name ? target : key, value] as const);
  styles.zones.options.layers = Object.fromEntries(entries);
  for (const zone of pack.zones) if (zone.type === name) zone.type = target;
  changed();
  return target;
}

/** Drop the layer; with removeZones its zones go too, otherwise they stay as ordinary zones */
function remove(name: string, removeZones = false): void {
  if (!has(name)) throw new Error(`layer "${name}" not found`);
  delete store()[name];
  if (removeZones) pack.zones = pack.zones.filter(zone => zone.type !== name);
  changed();
}

const toggle = (name: string): void => update(name, { hidden: !get(name)?.hidden });

/** Zone count per layer, for lists */
const countZones = (name: string): number => pack.zones.filter(zone => zone.type === name).length;

export const ZoneLayers = { list, get, has, create, update, rename, remove, toggle, countZones, onChange };
