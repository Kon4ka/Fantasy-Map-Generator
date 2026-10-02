// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/dialog/table", () => ({ initEditorTable: vi.fn() }));
vi.mock("@/components/layers", () => ({ Layers: {} }));
vi.mock("@/controllers", () => ({ Controllers: {} }));
vi.mock("@/generators/emblems-generator", () => ({ Emblems: {} }));
vi.mock("@/renderers/emblems/renderer", () => ({ EmblemRenderer: {} }));

import { clearCultureAssignments } from "./cultures-editor";

beforeEach(() => {
  globalThis.pack = {
    cells: {
      culture: new Uint16Array([0, 1, 2, 1]),
      state: new Uint16Array([0, 1, 1, 2]),
      pop: new Float32Array([0, 20, 30, 40])
    },
    cultures: [
      { i: 0, name: "Wildlands" },
      { i: 1, name: "One", lock: true },
      { i: 2, name: "Two" }
    ],
    states: [{ i: 0 }, { i: 1, culture: 1 }, { i: 2, culture: 2 }],
    burgs: [{ i: 0 }, { i: 1, culture: 1, population: 5 }, { i: 2, culture: 2, population: 10, lock: true }]
  } as unknown as typeof pack;
});

describe("clearCultureAssignments", () => {
  it("clears every cell and settlement, including locked assignments", () => {
    clearCultureAssignments();
    expect(Array.from(pack.cells.culture)).toEqual([0, 0, 0, 0]);
    expect(pack.burgs.slice(1).map(burg => burg.culture)).toEqual([0, 0]);
  });

  it("preserves cultures, countries, settlements and population", () => {
    const cultures = structuredClone(pack.cultures);
    const states = structuredClone(pack.states);
    const population = Array.from(pack.cells.pop);
    clearCultureAssignments();
    expect(pack.cultures).toEqual(cultures);
    expect(pack.states).toEqual(states);
    expect(Array.from(pack.cells.state)).toEqual([0, 1, 1, 2]);
    expect(Array.from(pack.cells.pop)).toEqual(population);
    expect(pack.burgs.map(burg => burg.population)).toEqual([undefined, 5, 10]);
    expect(pack.burgs).toHaveLength(3);
  });

  it("is safe to repeat and supports a map without settlements", () => {
    pack.burgs = [{ i: 0 }] as typeof pack.burgs;
    clearCultureAssignments();
    clearCultureAssignments();
    expect(Array.from(pack.cells.culture)).toEqual([0, 0, 0, 0]);
    expect(pack.cultures).toHaveLength(3);
  });
});
