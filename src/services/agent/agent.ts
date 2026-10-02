// Agent API for AI tools (MCP), reached by the launcher through page.evaluate. See docs/ai-mcp-guide.md

import { refreshEditors } from "@/components/dialog/dialog-helpers";
import { Layers } from "@/components/layers";
import { ENTITY_TYPES, type EntityRef, type EntityType, MapEntities } from "@/components/map-entities";
import { execute, OPERATIONS, plan } from "@/services/agent/apply";
import { compact, type Row, type TableQuery, toTable } from "@/services/agent/table";
import { loadPainters } from "@/services/agent/territory";
import { MapFiles } from "@/services/io/map-file";

type QueryType = EntityType | "layer";

// what a query shows when no fields are asked for
const DEFAULT_FIELDS: Record<QueryType, string[]> = {
  state: ["id", "name", "form", "capital", "culture", "cells", "area", "burgs"],
  province: ["id", "name", "state", "burg", "cells", "area"],
  burg: ["id", "name", "state", "culture", "population", "capital", "port"],
  marker: ["id", "name", "type", "x", "y"],
  river: ["id", "name", "type", "length", "discharge", "basin"],
  route: ["id", "name", "group", "feature"],
  feature: ["id", "name", "type", "group", "cells", "area"],
  zone: ["id", "name", "type"],
  journey: ["id", "name"],
  market: ["id", "name"],
  regiment: ["id", "name", "state"],
  addedLabel: ["id", "name", "featureId", "x", "y"],
  culture: ["id", "name", "type", "cells", "area"],
  religion: ["id", "name", "type", "form", "culture", "cells", "area"],
  biome: ["id", "name"],
  good: ["id", "name"],
  layer: ["id", "on"]
};

// numeric fields that point at another entity; shown as [id, name]
const REFS: Partial<Record<EntityType, Record<string, EntityType>>> = {
  state: { capital: "burg", culture: "culture" },
  province: { state: "state", burg: "burg" },
  burg: { state: "state", culture: "culture", feature: "feature", market: "market" },
  religion: { culture: "culture" },
  river: { basin: "river", parent: "river" },
  addedLabel: { featureId: "feature" },
  regiment: { state: "state" }
};

const TERRITORY_CELLS: Partial<Record<EntityType, () => ArrayLike<number>>> = {
  state: () => pack.cells.state,
  province: () => pack.cells.province,
  culture: () => pack.cells.culture,
  religion: () => pack.cells.religion,
  feature: () => pack.cells.f,
  biome: () => pack.cells.biome
};

const NOTE_LIMIT = 2000;
const stripHtml = (html: string) =>
  html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const isPrimitive = (value: unknown) => ["number", "string", "boolean"].includes(typeof value);

function assertType(type: unknown): asserts type is QueryType {
  if (type === "layer" || ENTITY_TYPES.includes(type as EntityType)) return;
  throw new Error(`unknown type "${type}"; types: ${[...ENTITY_TYPES, "layer"].join(", ")}`);
}

function toRow(type: EntityType, ref: EntityRef, entity: object, noteLimit = 0): Row {
  const row: Row = { id: ref.sub === undefined ? ref.id : MapEntities.key(ref), name: MapEntities.getName(ref) };
  const refs = REFS[type] ?? {};
  for (const [key, value] of Object.entries(entity)) {
    if (key === "i" || key === "name" || !isPrimitive(value)) continue;
    if (key === "note") {
      if (noteLimit) row.note = stripHtml(String(value)).slice(0, noteLimit);
      else row.hasNote = true;
      continue;
    }
    const target = refs[key];
    if (!target || typeof value !== "number") {
      row[key] = value;
      continue;
    }
    const name = MapEntities.getName({ type: target, id: value });
    row[key] = name ? [value, name] : null; // 0 or a removed entity means none
  }
  return row;
}

function rowsOf(type: QueryType): Row[] {
  if (type === "layer") return Layers.all.map(layer => ({ id: layer.id, on: Layers.isOn(layer.id) }));
  return MapEntities.collect(type).map(({ ref, entity }) => toRow(type, ref, entity));
}

function status() {
  const counts = Object.fromEntries(ENTITY_TYPES.map(type => [type, MapEntities.collect(type).length]));
  return {
    map: options.map.lore.name,
    file: MapFiles.name || null,
    seed: options.map.seed ?? null,
    size: [options.map.graph.width, options.map.graph.height],
    cells: pack.cells?.i?.length ?? 0,
    counts,
    revision: revision(),
    undo: snapshots.length
  };
}

/** Fingerprint of what agent and editors change: entity names, colors, notes, positions; layers; lore */
function revision(): string {
  let hash = 2166136261;
  const add = (text: string) => {
    for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  };
  for (const type of ENTITY_TYPES) {
    for (const { ref, entity } of MapEntities.collect(type)) {
      const { name, color, note, x, y, label } = entity as unknown as Record<string, unknown>;
      add(
        `${type}${MapEntities.key(ref)}${name}${color}${(note as string)?.length}${x},${y}${(label as { text?: string })?.text}`
      );
    }
  }
  add(Layers.all.map(layer => +Layers.isOn(layer.id)).join("") + JSON.stringify(options.map.lore));
  return (hash >>> 0).toString(36);
}

// map serializations taken before each change, newest last; with the revision it produced and, for a
// new map, the way back to the file the old map came from
const snapshots: { data: string; after: string; file?: () => void }[] = [];
const MAX_SNAPSHOTS = 5;

async function apply(args: { ops?: unknown; dryRun?: boolean; expectRevision?: string }) {
  await loadPainters();
  const planned = plan(args.ops);
  const current = revision();
  const changes = planned.map(step => step.summary);
  if (args.dryRun !== false) return { dryRun: true, changes, revision: current };
  if (args.expectRevision !== current) {
    return { error: `revision is ${current}, expected ${args.expectRevision}: the map changed; re-read, then retry` };
  }

  const data = await serialize();
  try {
    execute(planned);
  } catch (error) {
    await restore(data);
    return { error: `edit failed and was rolled back: ${(error as Error).message}` };
  }
  const after = remember(data);
  return { applied: changes.length, changes, revision: after };
}

const serialize = async () => (await import("@/services/io/save")).Save.prepareMapData();

function remember(data: string, file?: () => void): string {
  const after = revision();
  snapshots.push({ data, after, file });
  if (snapshots.length > MAX_SNAPSHOTS) snapshots.shift();
  return after;
}

const waitFor = async (done: () => boolean, timeout: number) => {
  for (const end = Date.now() + timeout; !done(); ) {
    if (Date.now() > end) throw new Error("timed out");
    await new Promise(resolve => setTimeout(resolve, 200));
  }
};

/** Write the map to its file, or to a new file named by the agent (saveAs) */
async function save(args: { mode?: string; name?: string }) {
  if (customization) return { error: "the map is in an edit mode; finish it in the editor first" };
  const saveAs = args.mode === "saveAs";
  if (args.name !== undefined && (typeof args.name !== "string" || !/^[^<>:"/\\|?*]{1,120}$/.test(args.name))) {
    return { error: "name must be a plain file name" };
  }
  if ((saveAs || !MapFiles.name) && !args.name)
    return { error: "pass name: the map has no file yet or saveAs needs one" };
  const name = args.name && !/\.(map|gz)$/i.test(args.name) ? `${args.name}.map` : args.name;
  const result = await MapFiles.save(await serialize(), `${options.map.lore.name}.map`, saveAs, name);
  if (!result) return { error: "save was cancelled" };
  window.dispatchEvent(new Event("map:file-saved"));
  return { saved: result.name, downloaded: result.downloaded };
}

/** Regenerate one part of the world, or the whole map (scope "map") */
async function generate(args: {
  scope?: string;
  seed?: string;
  width?: number;
  height?: number;
  dryRun?: boolean;
  expectRevision?: string;
}) {
  const { REGENERATORS } = await import("@/components/map-commands");
  const scope = args.scope ?? "";
  const isMap = scope === "map";
  if (!isMap && !REGENERATORS[scope]) {
    return { error: `scope must be "map" or one of: ${Object.keys(REGENERATORS).join(", ")}` };
  }
  const change = isMap
    ? `replace the whole map with a new one${args.seed ? ` (seed ${args.seed})` : ""}; Save will ask for a new file`
    : `regenerate ${scope}; manual changes to it are lost`;
  const current = revision();
  if (args.dryRun !== false) return { dryRun: true, changes: [change], revision: current };
  if (args.expectRevision !== current) {
    return { error: `revision is ${current}, expected ${args.expectRevision}: the map changed; re-read, then retry` };
  }

  const data = await serialize();
  let file: (() => void) | undefined;
  if (isMap) {
    const { regenerateMap } = await import("@/components/lifecycle");
    file = MapFiles.preserve();
    const count = mapHistory.length;
    regenerateMap({ seed: args.seed, width: args.width, height: args.height });
    await waitFor(() => mapHistory.length > count, 180_000);
    MapFiles.clear(); // Save must not overwrite the old world's file with the new one
    window.dispatchEvent(new Event("map:file-saved"));
  } else {
    REGENERATORS[scope]();
    refreshEditors();
  }
  return { done: change, revision: remember(data, file), undo: snapshots.length };
}

async function undo(args: { steps?: number; force?: boolean }) {
  const steps = Math.min(Math.max(1, args.steps ?? 1), snapshots.length);
  if (!snapshots.length) return { error: "nothing to undo" };
  if (!args.force && snapshots.at(-1)!.after !== revision()) {
    return {
      error: "the map changed after the last agent edit; undo would drop those changes. Pass force: true to undo anyway"
    };
  }
  const target = snapshots.splice(snapshots.length - steps, steps)[0];
  await restore(target.data);
  if (target.file) {
    target.file();
    window.dispatchEvent(new Event("map:file-saved"));
  }
  return { undone: steps, revision: revision(), undo: snapshots.length };
}

async function restore(data: string): Promise<void> {
  const { Load } = await import("@/services/io/load");
  await Load.restoreSnapshot(data);
}

function schema(args: { type?: string } = {}) {
  if (!args.type) {
    return {
      types: [...ENTITY_TYPES, "layer"],
      pseudo: { lore: "world_get type=lore: name, description, calendar" },
      where: '{field: value | {like, gt, lt, in, ne}}; refs compare by id, "like" by name',
      methods: ["status", "schema", "query", "get", "apply", "undo", "generate", "save"],
      ops: OPERATIONS
    };
  }
  assertType(args.type);
  const sample = rowsOf(args.type)[0] ?? {};
  return {
    type: args.type,
    defaults: DEFAULT_FIELDS[args.type],
    fields: Object.fromEntries(
      Object.entries(sample).map(([key, value]) => [key, Array.isArray(value) ? "ref" : typeof value])
    ),
    refs: REFS[args.type as EntityType] ?? {},
    include: ["position", "context", "cellCount", "note"]
  };
}

function query(args: { type?: string } & TableQuery) {
  assertType(args.type);
  return toTable(rowsOf(args.type), args, DEFAULT_FIELDS[args.type]);
}

function get(args: { type?: string; ids?: (number | string)[]; fields?: string[]; include?: string[] }) {
  if (args.type === "lore") return compact(structuredClone(options.map.lore));
  assertType(args.type);
  const type = args.type;
  if (type === "layer") return rowsOf(type).filter(row => args.ids?.includes(row.id as string));

  const include = new Set(args.include ?? ["note"]);
  return (args.ids ?? []).slice(0, 50).map(id => {
    const ref = typeof id === "string" ? MapEntities.parseKey(id) : { type, id };
    const entity = ref && MapEntities.get(ref);
    if (!ref || !entity) return { id, error: "not found" };

    const row = toRow(type, ref, entity, include.has("note") ? NOTE_LIMIT : 0);
    if (include.has("position")) row.position = compact(MapEntities.getPosition(ref) ?? null);
    if (include.has("context")) row.context = MapEntities.getContext(ref);
    const cells = include.has("cellCount") ? TERRITORY_CELLS[type]?.() : undefined;
    if (cells) row.cellCount = Array.prototype.filter.call(cells, value => value === ref.id).length;
    if (!args.fields?.length) return compact(row);
    return Object.fromEntries(["id", ...args.fields].map(field => [field, compact(row[field]) ?? null]));
  });
}

const METHODS: Record<string, (args: never) => unknown> = { status, schema, query, get, apply, undo, generate, save };

/** Single entry point: never throws, so the bridge always gets JSON back */
async function call(method: string, args: Record<string, unknown> = {}): Promise<unknown> {
  try {
    if (!pack?.cells?.i) return { error: "no map is loaded yet" };
    const handler = METHODS[method];
    if (!handler) return { error: `unknown method "${method}"; methods: ${Object.keys(METHODS).join(", ")}` };
    return await handler(args as never);
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export const MapAgent = { call };

declare global {
  interface Window {
    mapAgent: typeof MapAgent;
  }
}
window.mapAgent = MapAgent;
