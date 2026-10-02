import type { Point } from "@/generators/voronoi";

interface RiverBrushTerrain {
  h: ArrayLike<number>;
  c: readonly (readonly number[])[];
  p: readonly Point[];
  r?: ArrayLike<number>;
}

/** Water wins over a coastal land cell; equally connected ends keep the drawing order. */
export function orientRiverBrushCells(drawnCells: readonly number[], terrain: RiverBrushTerrain): number[] {
  const path = [...drawnCells];
  if (path.length < 2) return path;
  const isWater = (cell: number) => terrain.h[cell] < 20;
  if (path.every(isWater)) return path;
  const waterNeighbors = (cell: number) => terrain.c[cell].filter(isWater);
  const connection = (cell: number) => (isWater(cell) ? 2 : waterNeighbors(cell).length ? 1 : 0);
  const firstConnection = connection(path[0]);
  const lastConnection = connection(path[path.length - 1]);
  if (firstConnection > lastConnection) path.reverse();

  // Keep the shore crossing, not the extra cells drawn out into a water body.
  while (path.length > 1 && isWater(path[path.length - 1]) && isWater(path[path.length - 2])) path.pop();
  const end = path[path.length - 1];
  if (!isWater(end) && firstConnection !== lastConnection && !terrain.r?.[end]) {
    const [x, y] = terrain.p[end];
    const distance = (cell: number) => (terrain.p[cell][0] - x) ** 2 + (terrain.p[cell][1] - y) ** 2;
    const water = waterNeighbors(end).sort((a, b) => distance(a) - distance(b))[0];
    if (water !== undefined) path.push(water);
  }
  return path;
}

/** Sample between mouse events so fast strokes don't skip river cells. */
export function getRiverBrushCells(
  from: Point,
  to: Point,
  findCell: (x: number, y: number) => number | undefined
): number[] {
  const steps = Math.max(1, Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1]) / 2));
  const cells: number[] = [];
  for (let step = 0; step <= steps; step++) {
    const ratio = step / steps;
    const cell = findCell(from[0] + (to[0] - from[0]) * ratio, from[1] + (to[1] - from[1]) * ratio);
    if (cell !== undefined && cell !== cells.at(-1)) cells.push(cell);
  }
  return cells;
}
