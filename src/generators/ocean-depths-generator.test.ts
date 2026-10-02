import { describe, expect, it } from "vitest";
import { type OceanDepthGrid, regenerateOceanDepths } from "./ocean-depths-generator";

const createGraph = (): OceanDepthGrid => ({
  spacing: 10,
  points: Array.from({ length: 7 }, (_, cell) => [cell * 10, 0]),
  cells: {
    h: Uint8Array.from([60, 0, 0, 0, 0, 5, 40]),
    c: [[1], [0, 2], [1, 3], [2, 4], [3], [6], [5]],
    f: Uint16Array.from([3, 1, 1, 1, 1, 2, 3])
  },
  features: [undefined, { type: "ocean" }, { type: "lake" }, { type: "island" }]
});

const createPack = () => ({
  cells: {
    h: Uint8Array.from([55, 0, 0, 4, 60]),
    g: [0, 1, 3, 5, 6],
    f: Uint16Array.from([3, 1, 1, 2, 3]),
    state: Uint16Array.from([1, 0, 0, 0, 2])
  },
  features: [undefined, { type: "ocean" }, { type: "lake" }, { type: "island" }]
});

describe("sea-floor regeneration", () => {
  it("creates a shallow shelf and deeper offshore water without moving the shore", () => {
    const graph = createGraph();
    expect(regenerateOceanDepths(graph, createPack(), "test")).toBe(4);
    expect(graph.cells.h[1]).toBe(19);
    expect(graph.cells.h[4]).toBeLessThan(graph.cells.h[1]);
    for (let cell = 1; cell <= 4; cell++) {
      expect(graph.cells.h[cell]).toBeGreaterThan(0);
      expect(graph.cells.h[cell]).toBeLessThan(20);
    }
    expect(Array.from(graph.cells.h, height => height >= 20)).toEqual([true, false, false, false, false, false, true]);
  });

  it("preserves lake heights, all land heights and feature identities in both graphs", () => {
    const graph = createGraph();
    const packed = createPack();
    const heights = graph.cells.h;
    const features = structuredClone(graph.features);
    const state = packed.cells.state.slice();
    regenerateOceanDepths(graph, packed, "test");
    expect(graph.cells.h).toBe(heights);
    expect([graph.cells.h[0], graph.cells.h[5], graph.cells.h[6]]).toEqual([60, 5, 40]);
    expect([packed.cells.h[0], packed.cells.h[3], packed.cells.h[4]]).toEqual([55, 4, 60]);
    expect(packed.cells.h[1]).toBe(graph.cells.h[1]);
    expect(packed.cells.h[2]).toBe(graph.cells.h[3]);
    expect(graph.features).toEqual(features);
    expect(packed.cells.state).toEqual(state);
  });

  it("varies an all-ocean map even when there is no coast and never changes the global PRNG", () => {
    const graph = createGraph();
    graph.cells.h = new Uint8Array(64);
    graph.cells.f = new Uint16Array(64).fill(1);
    graph.cells.c = Array.from({ length: 64 }, () => []);
    graph.points = Array.from({ length: 64 }, (_, cell) => [(cell % 8) * 100, Math.floor(cell / 8) * 100]);
    const random = Math.random;
    regenerateOceanDepths(
      graph,
      { cells: { h: new Uint8Array(), g: [], f: new Uint16Array() }, features: [] },
      "ocean"
    );
    expect(new Set(graph.cells.h).size).toBeGreaterThan(3);
    expect(Math.random).toBe(random);
  });

  it("is repeatable with the same seed and changes with another seed", () => {
    const first = createGraph();
    const second = createGraph();
    regenerateOceanDepths(first, createPack(), "first");
    regenerateOceanDepths(second, createPack(), "first");
    expect(first.cells.h).toEqual(second.cells.h);
    regenerateOceanDepths(second, createPack(), "other");
    expect(first.cells.h).not.toEqual(second.cells.h);
  });

  it("does nothing to a world with only lakes and land", () => {
    const graph = createGraph();
    graph.features = graph.features.map((feature, id) => (id === 1 ? { type: "lake" } : feature));
    const original = graph.cells.h.slice();
    expect(regenerateOceanDepths(graph, createPack(), "test")).toBe(0);
    expect(graph.cells.h).toEqual(original);
  });
});
