import { describe, expect, it } from "vitest";
import type { Point } from "@/generators/voronoi";
import { getRiverBrushCells, orientRiverBrushCells } from "./river-brush";

describe("river brush sampling", () => {
  it("includes every cell between sparse mouse events, including cell zero", () => {
    expect(getRiverBrushCells([1, 0], [49, 0], x => Math.floor(x / 10))).toEqual([0, 1, 2, 3, 4]);
  });

  it("keeps source-to-mouth order in either direction", () => {
    expect(getRiverBrushCells([49, 0], [1, 0], x => Math.floor(x / 10))).toEqual([4, 3, 2, 1, 0]);
  });

  it("ignores points outside the map and collapses duplicate samples", () => {
    expect(getRiverBrushCells([-5, 0], [5, 0], x => (x < 0 ? undefined : 0))).toEqual([0]);
    expect(getRiverBrushCells([5, 5], [5, 5], () => 2)).toEqual([2]);
  });
});

const terrain = (h: number[]) => ({
  h: new Uint8Array(h),
  c: h.map((_, i) => [i - 1, i + 1].filter(cell => cell >= 0 && cell < h.length)),
  p: h.map((_, i): Point => [i * 10, 0])
});

describe("river brush water direction", () => {
  it.each([
    [4, 3, 2, 1, 0],
    [0, 1, 2, 3, 4]
  ])("ends at the first water cell, regardless of drawing direction: %j", (...path) => {
    expect(orientRiverBrushCells(path, terrain([10, 10, 30, 40, 50]))).toEqual([4, 3, 2, 1]);
  });

  it.each([
    [2, 3, 4],
    [4, 3, 2]
  ])("recognizes a shore endpoint and reaches its neighboring water: %j", (...path) => {
    expect(orientRiverBrushCells(path, terrain([10, 10, 30, 40, 50]))).toEqual([4, 3, 2, 1]);
  });

  it("prioritizes an actual water endpoint over a coastal land endpoint", () => {
    expect(orientRiverBrushCells([0, 1, 2], terrain([10, 30, 40, 10]))).toEqual([2, 1, 0]);
  });

  it("keeps drawing order when neither end reaches water", () => {
    expect(orientRiverBrushCells([3, 4], terrain([10, 10, 30, 40, 50]))).toEqual([3, 4]);
    expect(orientRiverBrushCells([4, 3], terrain([10, 10, 30, 40, 50]))).toEqual([4, 3]);
  });

  it("keeps ambiguous shore-to-shore and water-to-water directions", () => {
    const coast = terrain([10, 30, 40, 30, 10]);
    expect(orientRiverBrushCells([1, 2, 3], coast)).toEqual([1, 2, 3]);
    expect(orientRiverBrushCells([0, 1, 2, 3, 4], coast)).toEqual([0, 1, 2, 3, 4]);
  });

  it("chooses the nearest adjacent water cell for a shore endpoint", () => {
    const coast = terrain([10, 10, 30, 40]);
    coast.c[2] = [0, 1, 3];
    coast.p[0] = [100, 0];
    expect(orientRiverBrushCells([3, 2], coast)).toEqual([3, 2, 1]);
  });

  it("does not extend a land confluence into nearby water", () => {
    const coast = { ...terrain([10, 30, 40, 50]), r: [0, 7, 0, 0] };
    expect(orientRiverBrushCells([3, 2, 1], coast)).toEqual([3, 2, 1]);
  });

  it("uses the canonical water threshold and does not mutate the drawn path", () => {
    const drawn = Object.freeze([0, 1, 2]);
    expect(orientRiverBrushCells(drawn, terrain([19, 20, 30]))).toEqual([2, 1, 0]);
    expect(drawn).toEqual([0, 1, 2]);
  });

  it("handles short and water-only paths without inventing a land source", () => {
    const water = terrain([10, 10]);
    expect(orientRiverBrushCells([], water)).toEqual([]);
    expect(orientRiverBrushCells([0], water)).toEqual([0]);
    expect(orientRiverBrushCells([0, 1], water)).toEqual([0, 1]);
  });
});
