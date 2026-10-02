// Tools tab: buttons dispatch the same commands as global search.
import { MAP_COMMANDS } from "@/components/map-commands";
import { CATEGORIES, type Category, iconHTML } from "@/components/options/panel-icons";
import { tip } from "@/components/tooltips";
import { ensureEl } from "@/utils";

const GROUP_KEY = "toolsGroup";

// tool id: [category, icon-font name or SVG key]
const TOOLS: Record<string, [Category, string]> = {
  editBiomesButton: ["nature", "leaf"],
  editCoastlineSettings: ["nature", "draw-polygon"],
  editHeightmapButton: ["nature", "mountain"],
  overviewFeaturesButton: ["nature", "globe"],
  overviewRiversButton: ["nature", "river"],
  regenerateIce: ["nature", "ice"],
  regenerateOceanDepths: ["nature", "depths"],
  regenerateRivers: ["nature", "river"],
  addRiver: ["nature", "river"],
  editCulturesButton: ["society", "users"],
  regenerateCultures: ["society", "users"],
  editReligions: ["society", "place-of-worship"],
  regenerateReligions: ["society", "place-of-worship"],
  editNamesBaseButton: ["society", "book"],
  regeneratePopulation: ["society", "user-friends"],
  editStatesButton: ["politics", "flag"],
  regenerateStates: ["politics", "flag"],
  editProvincesButton: ["politics", "map"],
  regenerateProvinces: ["politics", "map"],
  editDiplomacyButton: ["politics", "balance-scale"],
  overviewBurgsButton: ["politics", "fort-awesome"],
  regenerateBurgs: ["politics", "fort-awesome"],
  addBurgTool: ["politics", "fort-awesome"],
  editEmblemButton: ["politics", "shield-alt"],
  regenerateEmblems: ["politics", "shield-alt"],
  overviewMilitaryButton: ["politics", "chess-knight"],
  regenerateMilitary: ["politics", "chess-knight"],
  editZonesButton: ["politics", "object-ungroup"],
  regenerateZones: ["politics", "object-ungroup"],
  editGoods: ["economy", "box"],
  regenerateGoods: ["economy", "box"],
  overviewMarketsButton: ["economy", "store"],
  regenerateMarkets: ["economy", "store"],
  editTradeAnimationButton: ["economy", "exchange"],
  regenerateEconomy: ["economy", "chart-pie"],
  regenerateProduction: ["economy", "hammer"],
  overviewRoutesButton: ["economy", "map-signs"],
  regenerateRoutes: ["economy", "map-signs"],
  addRoute: ["economy", "map-signs"],
  overviewJourneysButton: ["economy", "compass"],
  overviewLabelsButton: ["notes", "font"],
  regenerateStateLabels: ["notes", "font"],
  addLabel: ["notes", "font"],
  overviewMarkersButton: ["notes", "map-pin"],
  regenerateMarkers: ["notes", "map-pin"],
  addMarker: ["notes", "map-pin"],
  regenerateReliefIcons: ["notes", "tree"],
  editNotesButton: ["notes", "doc"],
  editMeasurersButton: ["notes", "ruler"],
  editUnitsButton: ["notes", "drafting-compass"],
  overviewCellsButton: ["nature", "cells"],
  overviewChartsButton: ["economy", "chart-bar"],
  openMinimapButton: ["notes", "map-o"],
  openSubmapTool: ["notes", "resize-small"],
  openTransformTool: ["notes", "move"],
  openWrapTool: ["notes", "brush"]
};

/** Give each tool its icon; in big groups, sort tools into labeled categories */
function decorateTools(content: HTMLElement): void {
  for (const grid of content.querySelectorAll<HTMLElement>("[data-tools-group]")) {
    const buttons = Array.from(grid.querySelectorAll<HTMLButtonElement>(":scope > button"));
    for (const button of buttons) {
      for (const node of Array.from(button.childNodes)) {
        if (node.nodeType !== Node.TEXT_NODE || !node.textContent?.trim()) continue;
        const label = document.createElement("span");
        label.className = "tool-label"; // a bare text node in a flex row cannot ellipsize
        label.textContent = node.textContent.trim();
        node.replaceWith(label);
      }
      const meta = TOOLS[button.id];
      if (meta) button.insertAdjacentHTML("afterbegin", iconHTML(meta[1]));
    }
    if (buttons.length <= 6) continue;
    grid.replaceChildren();
    for (const [category, label] of CATEGORIES) {
      const members = buttons.filter(button => (TOOLS[button.id]?.[0] ?? "notes") === category);
      if (!members.length) continue;
      grid.insertAdjacentHTML("beforeend", `<div class="tools-category">${label}</div>`);
      grid.append(...members);
    }
  }
}

const TEMPLATE = /* html */ `
  <div class="tools-tabs" role="tablist">
    <button data-tools-tab="edit" data-tip="Open editors of map elements"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 3l3 3-9 9-3-3z M9 12c-3 0-5 2-5 5 0 1.5-1 2.5-2 3 4 1 9 0 9-5"/></svg><span>Edit</span></button>
    <button data-tools-tab="regenerate" data-tip="Generate map elements anew"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a9 9 0 0 1-15.5 6.2 M3 12a9 9 0 0 1 15.5-6.2 M18.5 2v4h-4 M5.5 22v-4h4"/></svg><span>Regenerate</span></button>
    <button data-tools-tab="add" data-tip="Place new elements on the map"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14 M5 12h14"/></svg><span>Add</span></button>
    <button data-tools-tab="show" data-tip="Overviews of map data"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg><span>Show</span></button>
    <button data-tools-tab="create" data-tip="Make a new map out of this one"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z M19 16l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/></svg><span>Create</span></button>
  </div>
  <div class="grid" data-tools-group="edit">
    <button id="editBiomesButton" data-tip="Click to open Biomes Editor" data-shortcut="Shift + B">
      Biomes
    </button>
    <button id="overviewBurgsButton" data-tip="Click to open Burgs Overview" data-shortcut="Shift + T">
      Burgs
    </button>
    <button
      id="editCoastlineSettings"
      data-tip="Click to open Coastline Editor"
    >
      Coastlines
    </button>
    <button id="editCulturesButton" data-tip="Click to open Cultures Editor" data-shortcut="Shift + C">
      Cultures
    </button>
    <button
      id="editDiplomacyButton"
      data-tip="Click to open Diplomatical relationships Editor"
      data-shortcut="Shift + D"
    >
      Diplomacy
    </button>
    <button id="editEmblemButton" data-tip="Click to open Emblem Editor" data-shortcut="Shift + Y">
      Emblems
    </button>
    <button id="overviewFeaturesButton" data-tip="Click to open Geographical Features Overview" data-shortcut="Shift + F">
      Features
    </button>
    <button id="editGoods" data-tip="Click to open Goods Editor" data-shortcut="Shift + G">Goods</button>
    <button
      id="editHeightmapButton"
      data-tip="Click to open Heightmap customization menu"
      data-shortcut="Shift + H"
    >
      Heightmap
    </button>
    <button id="overviewMarkersButton" data-tip="Click to open Markers Overview" data-shortcut="Shift + K">
      Markers
    </button>
    <button id="overviewMarketsButton" data-tip="Click to open Markets Overview">
      Markets
    </button>
    <button id="editMeasurersButton" data-tip="Click to open Measurers Editor" data-shortcut="Shift + =">
      Measurers
    </button>
    <button id="overviewLabelsButton" data-tip="Click to open Labels Overview" data-shortcut="Shift + L">
      Labels
    </button>
    <button
      id="overviewMilitaryButton"
      data-tip="Click to open Military Forces Overview"
      data-shortcut="Shift + M"
    >
      Military
    </button>
    <button id="editNamesBaseButton" data-tip="Click to open Namesbase Editor" data-shortcut="Shift + N">
      Namesbase
    </button>
    <button id="editNotesButton" data-tip="Click to open Notes Editor" data-shortcut="Shift + O">Notes</button>
    <button id="editProvincesButton" data-tip="Click to open Provinces Editor" data-shortcut="Shift + P">
      Provinces
    </button>
    <button id="editReligions" data-tip="Click to open Religions Editor" data-shortcut="Shift + R">
      Religions
    </button>
    <button id="overviewRiversButton" data-tip="Click to open Rivers Overview" data-shortcut="Shift + V">
      Rivers
    </button>
    <button id="overviewRoutesButton" data-tip="Click to open Routes Overview" data-shortcut="Shift + U">
      Routes
    </button>
    <button id="overviewJourneysButton" data-tip="Click to open Journeys Overview" data-shortcut="Shift + J">
      Journeys
    </button>
    <button id="editStatesButton" data-tip="Click to open States Editor" data-shortcut="Shift + S">
      States
    </button>
    <button id="editTradeAnimationButton" data-tip="Click to open Trade Animation Editor">
      Trade
    </button>
    <button id="editUnitsButton" data-tip="Click to open Units Editor" data-shortcut="Shift + Q">Units</button>
    <button id="editZonesButton" data-tip="Click to open Zones Editor" data-shortcut="Shift + Z">Zones</button>
  </div>
  <div id="regenerateFeature" class="grid" data-tools-group="regenerate">
    <button
      id="regenerateBurgs"
      data-tip="Click to regenerate all unlocked burgs and routes. States will remain as they are. Note: burgs are only generated in populated areas with culture assigned"
    >
      Burgs
    </button>
    <button id="regenerateCultures" data-tip="Click to regenerate non-locked cultures">Cultures</button>
    <button
      id="regenerateEconomy"
      data-tip="Rebuild market territories, production, trade deals, and taxes from the current goods and markets"
    >
      Economy
    </button>
    <button id="regenerateEmblems" data-tip="Click to regenerate all emblems">Emblems</button>
    <button id="regenerateGoods" data-tip="Click to regenerate bonus goods placement">Goods</button>
    <button id="regenerateIce" data-tip="Click to regenerate icebergs and glaciers">Ice</button>
    <button id="regenerateOceanDepths" data-tip="Rebuild sea-floor depths without changing land, coastlines or lakes">
      Ocean depths
    </button>
    <button
      id="regenerateStateLabels"
      data-tip="Click to update state labels placement based on current borders"
    >
      State Labels
    </button>
    <button id="regenerateMarkers" data-tip="Click to regenerate unlocked markers">
      Markers <i id="configRegenerateMarkers" class="icon-cog" data-tip="Click to set number multiplier"></i>
    </button>
    <button id="regenerateMarkets" data-tip="Click to regenerate markets and their territories">
      Markets
    </button>
    <button
      id="regenerateMilitary"
      data-tip="Click to recalculate military forces based on current military options"
    >
      Military
    </button>
    <button id="regeneratePopulation" data-tip="Click to recalculate rural and urban population">
      Population
    </button>
    <button
      id="regenerateProduction"
      data-tip="Click to regenerate production and trade deals"
    >
      Production
    </button>
    <button
      id="regenerateProvinces"
      data-tip="Click to regenerate non-locked provinces. States will remain as they are"
    >
      Provinces
    </button>
    <button
      id="regenerateReliefIcons"
      data-tip="Click to regenerate all relief icons based on current cell biome and elevation"
    >
      Relief
    </button>
    <button id="regenerateReligions" data-tip="Click to regenerate non-locked religions">Religions</button>
    <button id="regenerateRivers" data-tip="Click to regenerate all rivers (restore default state)">
      Rivers
    </button>
    <button id="regenerateRoutes" data-tip="Click to regenerate all unlocked routes">Routes</button>
    <button
      id="regenerateStates"
      data-tip="Click to regenerate non-locked states. Emblems and military forces will be regenerated as well, burgs will remain as they are, but capitals will be different"
    >
      States
    </button>
    <button
      id="regenerateZones"
      data-tip="Click to regenerate zones. Hold Ctrl and click to set zones number multiplier"
    >
      Zones
    </button>
  </div>
  <div id="addFeature" class="grid" data-tools-group="add">
    <button
      id="addBurgTool"
      data-tip="Click on map to place a burg. Hold Shift to add multiple"
      data-shortcut="Shift + 1"
    >
      Burg
    </button>
    <button
      id="addLabel"
      data-tip="Click on map to place label. Hold Shift to add multiple"
      data-shortcut="Shift + 2"
    >
      Label
    </button>
    <button
      id="addMarker"
      data-tip="Click on map to place a marker. Hold Shift to add multiple"
      data-shortcut="Shift + 3"
    >
      Marker
    </button>
    <input type="hidden" id="addedMarkerType" name="addedMarkerType" value="" />
    <button
      id="addRiver"
      data-tip="Click on map to place a river. Hold Shift to add multiple"
      data-shortcut="Shift + 4"
    >
      River
    </button>
    <button id="addRoute" data-tip="Open route creation dialog" data-shortcut="Shift + 5">Route</button>
  </div>
  <div class="grid" data-tools-group="show">
    <button id="overviewCellsButton" data-tip="Click to open Cell details view" data-shortcut="Shift + E">
      Cells
    </button>
    <button
      id="overviewChartsButton"
      data-tip="Click to open Charts to overview cells data"
      data-shortcut="Shift + A"
    >
      Charts
    </button>
    <button id="openMinimapButton" data-tip="Click to open minimap overview. Click minimap to center view">
      Minimap
    </button>
  </div>
  <div class="grid" data-tools-group="create">
    <button id="openSubmapTool" data-tip="Click to generate a submap from the current viewport">Submap</button>
    <button id="openTransformTool" data-tip="Click to transform the map">Transform</button>
    <button id="openWrapTool" data-tip="Adjust cell shapes with a brush">Wrap</button>
  </div>
`;

ensureEl("toolsContent").innerHTML = TEMPLATE;
decorateTools(ensureEl("toolsContent"));
selectToolsGroup(readGroup());

/** Show one group of tools; the choice survives reloads */
export function selectToolsGroup(group: string): void {
  const content = ensureEl("toolsContent");
  if (!content.querySelector(`[data-tools-group="${group}"]`)) group = "edit";
  for (const grid of content.querySelectorAll<HTMLElement>("[data-tools-group]")) {
    grid.hidden = grid.dataset.toolsGroup !== group;
  }
  for (const tab of content.querySelectorAll<HTMLElement>("[data-tools-tab]")) {
    tab.classList.toggle("active", tab.dataset.toolsTab === group);
  }
  try {
    localStorage.setItem(GROUP_KEY, group);
  } catch {}
}

function readGroup(): string {
  try {
    return localStorage.getItem(GROUP_KEY) ?? "edit";
  } catch {
    return "edit";
  }
}

ensureEl("toolsContent").addEventListener("click", event => {
  const tab = (event.target as HTMLElement).closest<HTMLElement>("[data-tools-tab]");
  if (tab) return selectToolsGroup(tab.dataset.toolsTab!);
  if (customization) return tip("Please exit the customization mode first", false, "error");
  if (!(event instanceof MouseEvent) || !(event.target instanceof Element)) return;
  const target = event.target.closest("i[id], button"); // the tool icon belongs to its button
  const command = target && MAP_COMMANDS.find(command => command.id === target.id);
  if (command) void command.run(event);
});
