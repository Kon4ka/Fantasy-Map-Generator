// Layers tab: a projection of the Layers registry. Renders the layer buttons and wires them up.
import type { LayerId } from "@/components/layers";
import { Layers } from "@/components/layers";
import { CATEGORIES, type Category, iconHTML } from "@/components/options/panel-icons";
import { ViewportLayers } from "@/renderers/viewport/viewport-renderer";
import { isCtrlClick } from "@/utils";
import { ensureEl, findEl } from "@/utils/nodeUtils";

export interface LayerButton {
  label: string; // button text, may contain markup marking the shortcut letter
  shortcut?: string; // KeyboardEvent.code
  hint?: string; // shortcut as shown in the tip, defaults to the code without the "Key" prefix
}

// only layers listed here get a button, in registry order
export const LAYER_TOGGLES = new Map<LayerId, LayerButton>([
  ["texture", { label: "Te<u>x</u>ture", shortcut: "KeyX" }],
  ["heightmap", { label: "<u>H</u>eightmap", shortcut: "KeyH" }],
  ["oceanDepths", { label: "Ocean depths" }],
  ["lakes", { label: "Lakes", shortcut: "KeyQ" }],
  ["biomes", { label: "<u>B</u>iomes", shortcut: "KeyB" }],
  ["cells", { label: "C<u>e</u>lls", shortcut: "KeyE" }],
  ["grid", { label: "Grid", shortcut: "Semicolon", hint: "; (semicolon)" }],
  ["coordinates", { label: "C<u>o</u>ordinates", shortcut: "KeyO" }],
  ["compass", { label: "<u>W</u>ind Rose", shortcut: "KeyW" }],
  ["rivers", { label: "Ri<u>v</u>ers", shortcut: "KeyV" }],
  ["relief", { label: "Relie<u>f</u>", shortcut: "KeyF" }],
  ["religions", { label: "<u>R</u>eligions", shortcut: "KeyR" }],
  ["cultures", { label: "<u>C</u>ultures", shortcut: "KeyC" }],
  ["states", { label: "<u>S</u>tates", shortcut: "KeyS" }],
  ["provinces", { label: "<u>P</u>rovinces", shortcut: "KeyP" }],
  ["zones", { label: "<u>Z</u>ones", shortcut: "KeyZ" }],
  ["borders", { label: "Bor<u>d</u>ers", shortcut: "KeyD" }],
  ["routes", { label: "Ro<u>u</u>tes", shortcut: "KeyU" }],
  ["temperature", { label: "<u>T</u>emperature", shortcut: "KeyT" }],
  ["ice", { label: "Ice", shortcut: "KeyJ" }],
  ["goods", { label: "<u>G</u>oods", shortcut: "KeyG" }],
  ["markets", { label: "Markets" }],
  ["trade", { label: "Trade", shortcut: "Backquote", hint: "` (backtick)" }],
  ["precipitation", { label: "Precipit<u>a</u>tion", shortcut: "KeyA" }],
  ["population", { label: "Populatio<u>n</u>", shortcut: "KeyN" }],
  ["emblems", { label: "Emblems", shortcut: "KeyY" }],
  ["burgIcons", { label: "<u>I</u>cons", shortcut: "KeyI" }],
  ["labels", { label: "<u>L</u>abels", shortcut: "KeyL" }],
  ["military", { label: "<u>M</u>ilitary", shortcut: "KeyM" }],
  ["markers", { label: "Mar<u>k</u>ers", shortcut: "KeyK" }],
  ["journeys", { label: "Journeys" }],
  ["rulers", { label: "Rulers", shortcut: "Equal", hint: "= (equal sign)" }],
  ["scaleBar", { label: "Scale Bar", shortcut: "Slash", hint: "/ (slash sign)" }],
  ["vignette", { label: "Vignette", shortcut: "BracketLeft", hint: "[ (left square bracket)" }]
]);

// built-in layer presets, in the order the select shows them; the layer sets live in layers-presets
export const LAYER_PRESETS: Record<string, string> = {
  political: "Political map",
  cultural: "Cultural map",
  religions: "Religions map",
  provinces: "Provinces map",
  biomes: "Biomes map",
  heightmap: "Heightmap",
  physical: "Physical map",
  poi: "Places of interest",
  goods: "Goods map",
  trade: "Trade animation",
  military: "Military map",
  emblems: "Emblems",
  landmass: "Pure landmass"
};

// layer id: [category, icon-font name or SVG key]
const LAYER_META: Partial<Record<LayerId, [Category, string]>> = {
  texture: ["nature", "paint-roller"],
  heightmap: ["nature", "mountain"],
  oceanDepths: ["nature", "depths"],
  lakes: ["nature", "lake"],
  biomes: ["nature", "leaf"],
  rivers: ["nature", "river"],
  relief: ["nature", "tree"],
  temperature: ["nature", "temperature-high"],
  ice: ["nature", "ice"],
  precipitation: ["nature", "umbrella"],
  religions: ["society", "place-of-worship"],
  cultures: ["society", "users"],
  population: ["society", "user-friends"],
  states: ["politics", "flag"],
  provinces: ["politics", "map"],
  zones: ["politics", "object-ungroup"],
  borders: ["politics", "borders"],
  emblems: ["politics", "shield-alt"],
  burgIcons: ["politics", "fort-awesome"],
  military: ["politics", "chess-knight"],
  routes: ["economy", "map-signs"],
  goods: ["economy", "box"],
  markets: ["economy", "store"],
  trade: ["economy", "exchange"],
  journeys: ["economy", "compass"],
  cells: ["notes", "cells"],
  grid: ["notes", "grid"],
  coordinates: ["notes", "globe"],
  compass: ["notes", "windRose"],
  labels: ["notes", "font"],
  markers: ["notes", "map-pin"],
  rulers: ["notes", "ruler"],
  scaleBar: ["notes", "scaleBar"],
  vignette: ["notes", "adjust"]
};

export const getLayerByShortcut = (code: string): LayerId | undefined =>
  [...LAYER_TOGGLES].find(([, button]) => button.shortcut === code)?.[0];

const TEMPLATE = /* html */ `
  <p data-tip="Select a map layers preset" style="display: inline-block">Layers preset:</p>
  <select data-tip="Select a map layers preset" id="layersPreset" style="width: 45%">
    ${Object.entries(LAYER_PRESETS)
      .map(([id, label]) => `<option value="${id}">${label}</option>`)
      .join("")}
    <option hidden value="custom">Custom (not saved)</option>
  </select>
  <button
    id="savePresetButton"
    data-tip="Click to save displayed layers as a new preset"
    class="icon-plus sideButton"
    style="display: none"
  ></button>
  <button
    id="removePresetButton"
    data-tip="Click to remove current custom preset"
    class="icon-minus sideButton"
    style="display: none"
  ></button>
  <p>Displayed layers and layer order:</p>
  <div
    data-tip="Click to toggle a layer, drag to raise or lower a layer. Ctrl + click to edit layer style"
    id="mapLayers"
  ></div>
  <div class="tip">Click to toggle, drag to raise or lower the layer</div>
  <div class="tip">Ctrl + click to edit layer style</div>
  <div id="viewMode" data-tip="Set view mode">
    <p>View mode:</p>
    <button data-tip="Standard view mode for editing the map" id="viewStandard" class="pressed">
      Standard
    </button>
    <button
      data-tip="Map presentation in 3D scene. Works best for heightmap. Cannot be used for editing"
      id="viewMesh"
    >
      3D scene
    </button>
    <button data-tip="Project map on globe. Cannot be used for editing" id="viewGlobe">Globe</button>
  </div>
`;

ensureEl("layersContent").innerHTML = TEMPLATE;

/** Layers grouped by category, each group in z-order. Dragging reorders within a group */
function render(): void {
  const lists = new Map(CATEGORIES.map(([category]) => [category, [] as HTMLLIElement[]]));
  for (const layer of Layers.all) {
    const button = LAYER_TOGGLES.get(layer.id);
    if (!button) continue;
    const [category, icon] = LAYER_META[layer.id] ?? ["notes", "circle-empty"];

    const item = document.createElement("li");
    item.dataset.layer = layer.id;
    item.dataset.tip = `${button.label.replace(/<\/?u>/g, "")}: click to toggle, drag to raise or lower the layer. Ctrl + click to edit layer style`;
    if (button.shortcut) item.dataset.shortcut = button.hint ?? button.shortcut.replace("Key", "");
    item.innerHTML = `${iconHTML(icon)}<span class="layer-label">${button.label}</span>`;
    item.classList.toggle("buttonoff", !Layers.isOn(layer.id));
    item.classList.toggle("solid", layer.params.parent !== "viewbox"); // layers outside the viewbox cannot be reordered
    lists.get(category)?.push(item);
  }

  const container = ensureEl("mapLayers");
  container.replaceChildren();
  for (const [category, label] of CATEGORIES) {
    const items = lists.get(category) ?? [];
    if (!items.length) continue;
    const list = document.createElement("ul");
    list.className = "layer-list";
    list.append(...items);
    container.insertAdjacentHTML("beforeend", `<div class="panel-category">${label}</div>`);
    container.append(list);
  }
  makeSortable();
}

ensureEl("mapLayers").addEventListener("click", event => {
  const id = (event.target as HTMLElement).closest("li")?.dataset.layer;
  if (!id || !Layers.has(id)) return;

  if (isCtrlClick(event)) return void editStyle(Layers.get(id).elementId);
  Layers.toggle(id);
});

// move layers on dragging within a category. TODO: deprecate jQuery
function makeSortable(): void {
  $("#mapLayers .layer-list").sortable({
    items: "li:not(.solid)",
    containment: "parent",
    cancel: ".solid",
    update: (_event: Event, ui: { item: any }) => {
      const id = ui.item.data("layer");
      if (!Layers.has(id)) return;
      Layers.move(id, nextLayer(ui.item.next().data("layer"), ui.item.prev().data("layer"), id));
    }
  });
}

/** The layer to move before: the next one in the group, or else whatever follows the previous one */
function nextLayer(next: string | undefined, previous: string | undefined, moved: string): LayerId | undefined {
  if (next && Layers.has(next)) return next;
  if (!previous) return undefined;
  const others = Layers.all.filter(layer => layer.id !== moved);
  return others[others.findIndex(layer => layer.id === previous) + 1]?.id;
}

Layers.subscribe(render);
Layers.subscribe(() => ViewportLayers.renderNow());

// the 3d view renders the map as a texture: refresh it on any layer change, once the batch has settled
let view3dRefresh: number | undefined;
Layers.subscribe(() => {
  if (!findEl("canvas3d")) return;
  clearTimeout(view3dRefresh);
  view3dRefresh = window.setTimeout(() => void Controllers.View3d.update(), 400);
});

render();
