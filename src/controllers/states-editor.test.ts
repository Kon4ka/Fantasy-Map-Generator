// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

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

import { reconcilePaintedStates } from "./states-editor";

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
    provinces: [0],
    states: [
      { i: 0, name: "Neutrals", provinces: [] },
      { i: 1, name: "Old center", center: 1, capital: 0, provinces: [], neighbors: [2] },
      { i: 2, name: "New owner", center: 3, capital: 0, provinces: [], neighbors: [1] }
    ]
  } as unknown as typeof globalThis.pack;
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
