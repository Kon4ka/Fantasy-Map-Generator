// Quality traded for speed: independent settings, and the presets that name common combinations
import { Layers } from "@/components/layers";
import { OceanBake } from "@/components/ocean-bake";
import type { OptionsData } from "@/components/options-schema";
import { findEl } from "@/utils/nodeUtils";

export type PerformanceSettings = OptionsData["app"]["performance"];
export type PerformancePreset = keyof typeof PERFORMANCE_PRESETS;

export const PERFORMANCE_PRESETS = {
  quality: {
    shapeRendering: "geometricPrecision",
    stateHalos: true,
    viewportRedraw: "continuous",
    motionFilters: true,
    oceanBake: false
  },
  balance: {
    shapeRendering: "optimizeSpeed",
    stateHalos: false,
    viewportRedraw: "continuous",
    motionFilters: true,
    oceanBake: false
  },
  speed: {
    shapeRendering: "optimizeSpeed",
    stateHalos: false,
    viewportRedraw: "settled",
    motionFilters: false,
    oceanBake: true
  }
} as const satisfies Record<string, PerformanceSettings>;

/** The preset the settings amount to. Derived, never stored: a preset is a name for its values */
export function resolvePerformancePreset(settings: PerformanceSettings): PerformancePreset | "custom" {
  const keys = Object.keys(settings) as (keyof PerformanceSettings)[];
  for (const [name, preset] of Object.entries(PERFORMANCE_PRESETS)) {
    if (keys.every(key => preset[key] === settings[key])) return name as PerformancePreset;
  }
  return "custom";
}

const listeners = new Set<() => void>();

/** Every view of the settings syncs itself on change, so no view needs to know another exists */
export function onPerformanceChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function applyPerformancePreset(name: string): void {
  if (!Object.hasOwn(PERFORMANCE_PRESETS, name)) return;
  change(o => (o.app.performance = { ...PERFORMANCE_PRESETS[name as PerformancePreset] }));
}

export function setPerformanceSetting<K extends keyof PerformanceSettings>(
  key: K,
  value: PerformanceSettings[K]
): void {
  change(o => (o.app.performance[key] = value));
}

function change(write: (o: OptionsData) => void): void {
  Options.set(write);
  applyPerformanceSettings();
  for (const listener of listeners) listener();
}

/** Put the settings onto the map on screen. `viewportRedraw` and `motionFilters` need nothing: the zoom reads them live */
export function applyPerformanceSettings(): void {
  const { shapeRendering, stateHalos, oceanBake } = options.app.performance;
  findEl("viewbox")?.setAttribute("shape-rendering", shapeRendering);
  OceanBake.setEnabled(oceanBake);

  const halo = findEl("statesHalo");
  if (!halo) return;
  halo.style.display = stateHalos ? "" : "none";
  if (stateHalos && pack.cells && !halo.childElementCount) Layers.draw("states");
}
