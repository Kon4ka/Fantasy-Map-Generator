import Alea from "alea";
import type { GridGraph } from "@/types/GridGraph";
import type { PackedGraph } from "@/types/PackedGraph";
import { SEA_LEVEL } from "@/utils";

export type OceanDepthGrid = Pick<GridGraph, "spacing" | "points"> & {
  cells: Pick<GridGraph["cells"], "h" | "c" | "f">;
  features: ReadonlyArray<{ type: string } | undefined>;
};

type OceanDepthPack = {
  cells: Pick<PackedGraph["cells"], "h" | "g" | "f">;
  features: ReadonlyArray<{ type: string } | undefined>;
};

/** Rebuild the sea floor only; feature identity and all land/lake elevations stay intact. */
export function regenerateOceanDepths(graph: OceanDepthGrid, packed: OceanDepthPack, seed: string): number {
  const { cells, features, points, spacing } = graph;
  const count = cells.h.length;
  const ocean = Uint8Array.from(cells.h, (height, cell) =>
    Number(height < SEA_LEVEL && features[cells.f[cell]]?.type === "ocean")
  );
  const distances = new Int32Array(count).fill(-1);
  const queue = new Uint32Array(count);
  let end = 0;
  for (let cell = 0; cell < count; cell++) {
    if (!ocean[cell] || !cells.c[cell].some(next => cells.h[next] >= SEA_LEVEL)) continue;
    distances[cell] = 1;
    queue[end++] = cell;
  }
  for (let head = 0; head < end; head++) {
    const cell = queue[head];
    for (const next of cells.c[cell]) {
      if (!ocean[next] || distances[next] !== -1) continue;
      distances[next] = distances[cell] + 1;
      queue[end++] = next;
    }
  }

  const noise = createSeaFloorNoise(seed);
  let changed = 0;
  for (let cell = 0; cell < count; cell++) {
    if (!ocean[cell]) continue;
    const distance = distances[cell] === -1 ? Infinity : distances[cell];
    const shelf = Math.exp(-(distance - 1) / 4);
    const [x, y] = points[cell];
    const variation = noise(x / spacing, y / spacing) * (1 - shelf);
    const height = Math.max(1, Math.min(19, Math.round(5 + 14 * shelf + variation)));
    if (cells.h[cell] !== height) changed++;
    cells.h[cell] = height;
  }

  for (let cell = 0; cell < packed.cells.h.length; cell++) {
    const source = packed.cells.g[cell];
    if (packed.cells.h[cell] >= SEA_LEVEL || !ocean[source]) continue;
    if (packed.features[packed.cells.f[cell]]?.type !== "ocean") continue;
    packed.cells.h[cell] = cells.h[source];
  }
  return changed;
}

function createSeaFloorNoise(seed: string): (x: number, y: number) => number {
  const salt = Math.floor(Alea(seed)() * 0x100000000);
  const hash = (x: number, y: number): number => {
    let value = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ salt;
    value = Math.imul(value ^ (value >>> 13), 1274126177);
    return ((value ^ (value >>> 16)) >>> 0) / 0xffffffff;
  };
  const interpolate = (a: number, b: number, t: number) => a + (b - a) * t;
  const sample = (x: number, y: number): number => {
    const left = Math.floor(x);
    const top = Math.floor(y);
    const dx = x - left;
    const dy = y - top;
    const sx = dx * dx * (3 - 2 * dx);
    const sy = dy * dy * (3 - 2 * dy);
    return (
      interpolate(
        interpolate(hash(left, top), hash(left + 1, top), sx),
        interpolate(hash(left, top + 1), hash(left + 1, top + 1), sx),
        sy
      ) *
        2 -
      1
    );
  };
  return (x, y) => sample(x / 16, y / 16) * 5 + sample(x / 7, y / 7) * 2 + sample(x / 3, y / 3);
}
