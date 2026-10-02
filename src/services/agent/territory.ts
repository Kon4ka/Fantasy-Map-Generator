// Territory edits for the agent: pick cells by a selector, then paint them the way the editors' brushes do
import type { Point } from "@/types/global";

export type TerritoryType = "state" | "province" | "culture" | "religion";
type Paint = (changes: ReadonlyMap<number, number>) => void;

export interface CellSelector {
  feature?: number; // a landmass or lake id
  of?: { type: TerritoryType; id: number }; // the current territory of an entity
  circle?: [number, number, number]; // x, y, radius in map units
  polygon?: Point[];
  cells?: number[];
}

const ASSIGNMENT: Record<TerritoryType, () => ArrayLike<number>> = {
  state: () => pack.cells.state,
  province: () => pack.cells.province,
  culture: () => pack.cells.culture,
  religion: () => pack.cells.religion
};

const COLLECTION: Record<TerritoryType, () => { removed?: boolean }[]> = {
  state: () => pack.states,
  province: () => pack.provinces,
  culture: () => pack.cultures,
  religion: () => pack.religions
};

export const TERRITORY_TYPES = Object.keys(ASSIGNMENT) as TerritoryType[];

let painters: Record<TerritoryType, Paint> | undefined;
let stateFactory: ((point: [number, number], name?: string) => number) | undefined;

/** The brushes live in lazily loaded editors; load them once before planning territory ops */
export async function loadPainters(): Promise<void> {
  if (painters) return;
  const [states, provinces, cultures, religions] = await Promise.all([
    import("@/controllers/states-editor"),
    import("@/controllers/provinces-editor"),
    import("@/controllers/cultures-editor"),
    import("@/controllers/religions-editor")
  ]);
  stateFactory = states.createState;
  painters = {
    state: changes => {
      states.applyStatesPaint(changes, true, false); // the agent reports removed states itself
      States.collectStatistics();
    },
    province: provinces.applyProvincePaint,
    culture: cultures.applyCulturePaint,
    religion: religions.applyReligionPaint
  };
}

/** Found a state with its capital at the point; returns the new id */
export function createState(point: [number, number], name?: string): number {
  if (!stateFactory) throw new Error("territory painters are not loaded");
  return stateFactory(point, name);
}

export function painter(type: TerritoryType): Paint {
  if (!painters) throw new Error("territory painters are not loaded");
  return painters[type];
}

export function assertTerritory(type: unknown, id: unknown, allowZero = true): asserts type is TerritoryType {
  if (!TERRITORY_TYPES.includes(type as TerritoryType)) {
    throw new Error(`territory type must be one of ${TERRITORY_TYPES.join(", ")}`);
  }
  const entity = COLLECTION[type as TerritoryType]()[Number(id)];
  if (!Number.isInteger(id) || (id === 0 && !allowZero) || !entity || entity.removed) {
    throw new Error(`${type} ${id} not found`);
  }
}

const inPolygon = ([x, y]: Point, polygon: Point[]) => {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

/** Land cells matching every given selector */
export function selectCells(selector: CellSelector): number[] {
  const { cells } = pack;
  const tests: ((cell: number) => boolean)[] = [cell => cells.h[cell] >= 20];

  if (selector.feature !== undefined) tests.push(cell => cells.f[cell] === selector.feature);
  if (selector.of) {
    const { type, id } = selector.of;
    assertTerritory(type, id);
    const assigned = ASSIGNMENT[type]();
    tests.push(cell => assigned[cell] === id);
  }
  if (selector.circle) {
    const [x, y, r] = selector.circle;
    if (![x, y, r].every(Number.isFinite) || r <= 0) throw new Error("circle must be [x, y, radius]");
    tests.push(cell => (cells.p[cell][0] - x) ** 2 + (cells.p[cell][1] - y) ** 2 <= r * r);
  }
  if (selector.polygon) {
    if (!Array.isArray(selector.polygon) || selector.polygon.length < 3)
      throw new Error("polygon needs 3+ [x, y] points");
    tests.push(cell => inPolygon(cells.p[cell], selector.polygon!));
  }
  const listed = selector.cells ? new Set(selector.cells) : undefined;
  if (listed) tests.push(cell => listed.has(cell));
  if (tests.length === 1) throw new Error("cells needs a selector: feature, of, circle, polygon or cells");

  return Array.from(cells.i).filter(cell => tests.every(test => test(cell)));
}

/** Cells that would change owner, as the brush expects them */
export function changesFor(type: TerritoryType, id: number, selected: number[]): Map<number, number> {
  const assigned = ASSIGNMENT[type]();
  const provinceState = type === "province" && id ? pack.provinces[id].state : undefined;
  const changes = new Map<number, number>();
  for (const cell of selected) {
    if (assigned[cell] === id) continue;
    if (provinceState !== undefined && pack.cells.state[cell] !== provinceState) continue; // a province stays inside its state
    changes.set(cell, id);
  }
  return changes;
}
