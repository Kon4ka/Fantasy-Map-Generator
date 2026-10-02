// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Layers } from "@/components/layers";

vi.mock("@/components/layers", () => ({
  Layers: { draw: vi.fn(), show: vi.fn(), hide: vi.fn(), isOn: () => false }
}));
vi.mock("@/components/tooltips", () => ({ tip: vi.fn(), clearMainTip: vi.fn() }));
vi.mock("@/components/viewbox-events", () => ({ applyDefaultViewboxEvents: vi.fn() }));
vi.mock("@/components/dialog/highlighting", () => ({ applyLineHighlighting: vi.fn() }));
vi.mock("@/components/dialog/sorting", () => ({ bindColumnSorting: vi.fn(), sortDataByColumns: vi.fn() }));
vi.mock("@/components/dialog/table", () => ({
  initColumnVisibility: vi.fn(),
  renderEditorHeader: () => "",
  renderEditorPagination: vi.fn(),
  initEditorTable: vi.fn()
}));
vi.mock("@/components/annex-mode", () => ({ createAnnexMode: vi.fn() }));
vi.mock("@/components/notes", () => ({ Notes: {} }));
vi.mock("@/controllers", () => ({ Controllers: {} }));
vi.mock("@/generators/emblems-generator", () => ({ Emblems: {} }));
vi.mock("@/renderers/draw-emblems", () => ({
  redrawEmblem: vi.fn(),
  redrawEmblems: vi.fn(),
  removeEmblem: vi.fn()
}));
vi.mock("@/renderers/emblems/renderer", () => ({ EmblemRenderer: { trigger: vi.fn() } }));
vi.mock("@/renderers/overlays/fogging", () => ({ fog: vi.fn(), unfog: vi.fn() }));
vi.mock("@/renderers/overlays/highlight", () => ({ highlightElement: vi.fn(), highlightOutline: vi.fn() }));

import { reconcilePaintedStates, refitAllStateLabels } from "./states-editor";

beforeEach(() => {
  document.body.innerHTML = '<svg><g id="debug"></g></svg><div id="tooltip"></div>';
  globalThis.pack = {
    cells: {
      i: [0, 1, 2, 3],
      state: new Uint16Array([0, 2, 1, 2]),
      province: new Uint16Array(4),
      s: new Int16Array([0, 1, 8, 4]),
      burg: new Uint16Array(4)
    },
    burgs: [{}],
    addedLabels: [],
    provinces: [0],
    states: [
      { i: 0, name: "Neutrals", provinces: [] },
      { i: 1, name: "Old center", center: 1, capital: 0, provinces: [], neighbors: [2] },
      { i: 2, name: "New owner", center: 3, capital: 0, provinces: [], neighbors: [1] }
    ]
  } as unknown as typeof globalThis.pack;
  globalThis.options = {
    map: { labels: { groups: [{ name: "state", type: "state", active: false, zoom: { min: 0, max: 20 } }] } }
  } as typeof globalThis.options;
  globalThis.States = {
    collectStatistics: vi.fn(),
    getPoles: vi.fn()
  } as unknown as typeof globalThis.States;
});

describe("reconcilePaintedStates", () => {
  it("moves a captured center to the best remaining cell", () => {
    const removed = reconcilePaintedStates([1, 2]);

    expect(removed).toEqual([]);
    expect(pack.states[1].center).toBe(2);
    expect(pack.states[1].removed).not.toBe(true);
  });

  it("removes a state that has no territory left", () => {
    pack.cells.state[2] = 2;

    const removed = reconcilePaintedStates([1]);

    expect(removed).toEqual(["Old center"]);
    expect(pack.states[1]).toEqual({ i: 1, removed: true });
    expect(pack.states[2].neighbors).toEqual([]);
  });
});

describe("refitAllStateLabels", () => {
  it("preserves geographic labels even when their name matches a state", () => {
    pack.addedLabels = [{ i: 1, x: 10, y: 20, featureId: 2, label: { text: "Old center" } }];
    refitAllStateLabels();
    expect(pack.addedLabels).toHaveLength(1);
    expect(pack.addedLabels[0].featureId).toBe(2);
  });

  it("migrates legacy state-name labels and redraws active state labels", () => {
    pack.states[1].label = { text: "Old center", pathPoints: [[1, 1]] };
    pack.states[2].label = { text: "New owner", dx: 40, dy: 20 };
    pack.states[2].fullName = "The New Owner";
    pack.addedLabels = [
      { i: 1, x: 10, y: 20, label: { text: " Old|center ", group: "added" } },
      { i: 2, x: 20, y: 30, label: { text: "The New Owner", group: "added" } },
      { i: 3, x: 30, y: 40, label: { text: "Sea of Mist", group: "added" } }
    ];

    refitAllStateLabels();

    expect(pack.states[1].label).toBeUndefined();
    expect(pack.states[2].label).toBeUndefined();
    expect(pack.addedLabels.map(label => label.label.text)).toEqual(["Sea of Mist"]);
    expect(options.map.labels.groups[0].active).toBeUndefined();
    expect(States.collectStatistics).toHaveBeenCalledOnce();
    expect(States.getPoles).toHaveBeenCalledOnce();
    expect(Layers.draw).toHaveBeenCalledWith("labels");
  });
});
