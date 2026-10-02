import { builtInHeightmapSchemes, getColorScheme, heightColorPosition, parseColorRamp } from "@/utils/heightmap-colors";
import { ensureEl } from "@/utils/nodeUtils";

const STORAGE_KEY = "heightmapColorSchemes";
const schemes: Record<string, (position: number) => string> = { ...builtInHeightmapSchemes };

export function syncHeightmapSchemeSelect(selected: string): void {
  if (!(selected in schemes) && parseColorRamp(selected)) schemes[selected] = getColorScheme(selected);
  const select = ensureEl<HTMLSelectElement>("styleHeightmapScheme");
  select.replaceChildren(
    ...Object.keys(schemes).map((key, index) => {
      const ramp = parseColorRamp(key);
      const option = new Option(ramp?.name || (ramp ? `Custom palette ${index - 6}` : key), key);
      if (ramp?.name) option.className = "notranslate";
      return option;
    })
  );
  select.value = selected;
  const custom = !!parseColorRamp(selected);
  ensureEl<HTMLButtonElement>("editHeightmapSchemeButton").disabled = !custom;
  ensureEl<HTMLButtonElement>("deleteHeightmapSchemeButton").disabled = !custom;
}

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.keys(schemes).filter(key => parseColorRamp(key))));
  } catch {
    /* Palette remains embedded in the map if browser storage is unavailable. */
  }
}

export function addHeightmapScheme(value: string): void {
  if (!parseColorRamp(value)) return;
  schemes[value] = getColorScheme(value);
  persist();
  syncHeightmapSchemeSelect(value);
}

export function removeHeightmapScheme(value: string): void {
  if (!parseColorRamp(value)) return;
  delete schemes[value];
  persist();
}

export function initializeHeightmapSchemes(): void {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (Array.isArray(saved))
      for (const value of saved.slice(0, 100)) {
        if (typeof value === "string" && parseColorRamp(value)) schemes[value] = getColorScheme(value);
      }
  } catch {
    /* Ignore malformed browser preferences. */
  }
  window.heightmapColorSchemes = schemes;
  window.addCustomColorScheme = addHeightmapScheme;
  window.getColorScheme = value => schemes[value || "bright"] || getColorScheme(value);
  window.getColor = (height, scheme = getColorScheme("bright")) => scheme(heightColorPosition(height));
  window.syncHeightmapSchemeSelect = syncHeightmapSchemeSelect;
  syncHeightmapSchemeSelect("bright");
}

declare global {
  interface Window {
    syncHeightmapSchemeSelect: typeof syncHeightmapSchemeSelect;
  }
}
