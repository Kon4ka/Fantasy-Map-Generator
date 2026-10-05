// Write side of the agent API: a whitelisted catalog of edits, validated as a batch, previewed by default
import { refreshEditors } from "@/components/dialog/dialog-helpers";
import { type LayerId, Layers } from "@/components/layers";
import { ENTITY_TYPES, type EntityRef, type EntityType, MapEntities } from "@/components/map-entities";
import { Notes } from "@/components/notes";
import { ZoneLayers } from "@/components/zone-layers";
import { redrawEmblem, removeEmblem } from "@/renderers/draw-emblems";
import {
  assertTerritory,
  type CellSelector,
  changesFor,
  createCulture,
  createProvince,
  createState,
  painter,
  selectCells
} from "@/services/agent/territory";

export type Op = { op: string; type?: string; id?: number | string } & Record<string, unknown>;

interface Planned {
  summary: string;
  layers: LayerId[];
  run: () => void;
}

// fields `set` may change, per type; `note` is allowed on every entity
const SETTABLE: Partial<Record<EntityType, string[]>> = {
  state: ["name", "fullName", "formName", "form", "color", "capital"],
  province: ["name", "fullName", "formName", "color"],
  burg: ["name", "population", "group", "x", "y", "state"],
  culture: ["name", "color"],
  religion: ["name", "fullName", "form", "deity", "color"],
  marker: ["name", "icon", "size"],
  river: ["name", "type"],
  route: ["name"],
  zone: ["name", "type", "color"],
  feature: ["name"],
  addedLabel: ["text", "x", "y"],
  regiment: ["name"],
  journey: ["name"],
  market: ["name"]
};

// layers whose drawing shows a field beyond the entity's own layer
const NAME_LAYERS: Partial<Record<EntityType, LayerId[]>> = {
  state: ["labels"],
  province: ["labels"],
  river: ["labels"],
  feature: ["labels"]
};

const LORE_FIELDS = ["name", "description", "year", "era", "eraShort"];
const COLOR = /^#[0-9a-f]{6}$/i;
const MAX_TEXT = 200;
const MAX_NOTE = 20_000;

const fail = (message: string): never => {
  throw new Error(message);
};

function checkValue(field: string, value: unknown): void {
  if (field === "color") {
    if (typeof value !== "string" || !COLOR.test(value)) fail(`color must be #rrggbb, got ${JSON.stringify(value)}`);
  } else if (["population", "size", "x", "y", "year"].includes(field)) {
    if (typeof value !== "number" || !Number.isFinite(value)) fail(`${field} must be a number`);
    if (field !== "year" && (value as number) < 0) fail(`${field} must not be negative`);
  } else if (typeof value !== "string") fail(`${field} must be a string`);
  else if (value.length > (field === "note" || field === "description" ? MAX_NOTE : MAX_TEXT))
    fail(`${field} is too long`);
}

function resolve(op: Op): { type: EntityType; ref: EntityRef; entity: Record<string, unknown> } {
  const type = op.type as EntityType;
  if (!ENTITY_TYPES.includes(type)) fail(`unknown type "${op.type}"`);
  const ref = typeof op.id === "string" ? MapEntities.parseKey(op.id) : { type, id: Number(op.id) };
  const entity = ref && (MapEntities.get(ref) as Record<string, unknown> | undefined);
  if (!ref || !entity) return fail(`${type} ${op.id} not found`);
  return { type, ref, entity };
}

const layersOf = (type: EntityType, ref: EntityRef, field?: string): LayerId[] => [
  ...MapEntities.getDisplay(ref).layers,
  ...(field === "name" || field === "fullName" ? (NAME_LAYERS[type] ?? []) : [])
];

/** Make a burg of the state its capital, as the burg editor's capital toggle does */
function planCapital(stateId: number, burgId: unknown): Planned {
  const burg = pack.burgs[Number(burgId)];
  if (!burgId || !burg || burg.removed) fail(`burg ${burgId} not found`);
  if (burg.state !== stateId) fail(`burg ${burgId} ${burg.name} is in state ${burg.state}, not ${stateId}`);
  const state = pack.states[stateId];
  return {
    summary: `state ${stateId} capital: ${pack.burgs[state.capital]?.name ?? "none"} → ${burg.name}`,
    layers: ["burgIcons", "labels"],
    run: () => {
      const old = pack.burgs[state.capital];
      state.capital = burg.i;
      state.center = burg.cell;
      burg.capital = 1;
      Burgs.changeGroup(burg);
      if (old?.i && old.i !== burg.i) {
        old.capital = 0;
        Burgs.changeGroup(old);
      }
    }
  };
}

/** Move a burg to x,y (a free land cell); a capital stays inside its state */
function planRelocate(burgId: number, x: unknown, y: unknown): Planned {
  checkValue("x", x);
  checkValue("y", y);
  const burg = pack.burgs[burgId];
  const cell = Pack.findCell(x as number, y as number, Infinity, pack) as number;
  if (pack.cells.h[cell] < 20) fail(`${x},${y} is water`);
  if (pack.cells.burg[cell] && pack.cells.burg[cell] !== burgId)
    fail(`cell ${cell} already has burg ${pack.cells.burg[cell]}`);
  const state = pack.cells.state[cell];
  if (burg.capital && state !== burg.state) fail("a capital cannot move into another state");
  const moved = state !== burg.state ? ` (state ${burg.state} → ${state})` : "";
  return {
    summary: `burg ${burgId} ${burg.name} moves to ${x},${y}${moved}`,
    layers: ["burgIcons", "labels"],
    run: () => {
      pack.cells.burg[burg.cell] = 0;
      pack.cells.burg[cell] = burgId;
      Object.assign(burg, { cell, state, x, y });
      if (burg.capital) pack.states[state].center = cell;
      if (burg.label) Object.assign(burg.label, { dx: 0, dy: 0, pathPoints: undefined });
    }
  };
}

const hasMore = (op: Op) => Object.keys(op).some(key => !["op", "type", "id"].includes(key));

function planSet(op: Op): Planned[] {
  const { type, ref, entity } = resolve(op);
  if (type === "state" && "capital" in op) {
    const { capital, ...rest } = op;
    return [planCapital(ref.id, capital), ...(hasMore(rest) ? planSet(rest) : [])];
  }
  if (type === "burg" && ("x" in op || "y" in op || "state" in op)) {
    const { x, y, state, ...rest } = op;
    const steps: Planned[] = [];
    if (x !== undefined || y !== undefined) steps.push(planRelocate(ref.id, x ?? entity.x, y ?? entity.y));
    if (state !== undefined) {
      if (entity.capital) fail("a capital cannot change state; make another burg the capital first");
      steps.push(
        ...planAssign({ op: "assign", type: "state", id: state as number, cells: { cells: [entity.cell as number] } })
      );
    }
    return [...steps, ...(hasMore(rest) ? planSet(rest) : [])];
  }
  const allowed = SETTABLE[type] ?? [];
  const changes = Object.entries(op).filter(([key]) => !["op", "type", "id"].includes(key));
  if (!changes.length) fail(`set ${type} ${op.id}: no fields given`);

  const label = `${type} ${op.id}`;
  return changes.map(([field, value]) => {
    if (field !== "note" && !allowed.includes(field))
      fail(`${type}.${field} cannot be set; allowed: ${[...allowed, "note"].join(", ")}`);
    checkValue(field, value);

    if (field === "note") {
      return { summary: `${label} note updated`, layers: [], run: () => Notes.set(ref, value as string) };
    }
    if (type === "addedLabel" && field === "text") {
      const labelData = entity.label as { text?: string };
      return {
        summary: `${label} text: ${labelData.text ?? ""} → ${value}`,
        layers: ["labels"],
        run: () => (labelData.text = value as string)
      };
    }

    const before = entity[field];
    const extra: (() => void)[] = [];
    // a full name embeds the short one; keep them in step unless the full name is set too
    if (field === "name" && typeof entity.fullName === "string" && typeof before === "string" && !("fullName" in op)) {
      const fullName = entity.fullName.replace(before, value as string);
      if (fullName !== entity.fullName) extra.push(() => (entity.fullName = fullName));
    }
    return {
      summary: `${label} ${field}: ${before ?? "—"} → ${value}`,
      layers: layersOf(type, ref, field),
      run: () => {
        entity[field] = value;
        for (const step of extra) step();
      }
    };
  });
}

/** A province (inside the state at x,y) or a culture centred at x,y, optionally taking the selected cells */
function planNewTerritory(op: Op, x: number, y: number): Planned[] {
  const type = op.type as "province" | "culture";
  if (op.name !== undefined) checkValue("name", op.name);
  if (op.color !== undefined) checkValue("color", op.color);
  const center = Pack.findCell(x, y, Infinity, pack) as number;
  if (pack.cells.h[center] < 20) fail(`${x},${y} is water`);
  if (type === "province") {
    if (!pack.cells.state[center]) fail(`${x},${y} is neutral land; a province needs a state`);
    if (pack.provinces.some(p => p && !p.removed && p.center === center))
      fail(`${x},${y} is already a province center`);
  } else if (pack.cultures.some(c => c && !c.removed && c.center === center)) {
    fail(`${x},${y} is already a culture center`);
  }
  const selected = op.cells ? selectCells(op.cells as CellSelector) : [];
  const id = type === "province" ? pack.provinces.length : pack.cultures.length;
  const extent = selected.length ? ` with up to ${selected.length} cells` : "";
  return [
    {
      summary: `create ${type} ${id} "${op.name ?? "auto-named"}" at ${x},${y}${extent}`,
      layers: type === "province" ? ["provinces", "labels"] : ["cultures"],
      run: () => {
        const name = op.name as string | undefined;
        const created = type === "province" ? createProvince([x, y], name) : createCulture(center);
        const entity = (type === "province" ? pack.provinces : pack.cultures)[created] as {
          name: string;
          fullName?: string;
          color?: string;
        };
        if (name) {
          entity.name = name;
          if (type === "province") entity.fullName = name;
        }
        if (op.color) entity.color = op.color as string;
        const changes = changesFor(type, created, type === "culture" ? [center, ...selected] : selected);
        if (changes.size) painter(type)(changes);
      }
    }
  ];
}

/** A route endpoint: {burg: id} or [x, y] */
function endpointCell(point: unknown): number {
  if (Array.isArray(point)) {
    const [x, y] = point as number[];
    if (![x, y].every(Number.isFinite)) fail("a route point is [x, y] or {burg: id}");
    return Pack.findCell(x, y, Infinity, pack) as number;
  }
  const burg = pack.burgs[Number((point as { burg?: number })?.burg)];
  if (!burg || burg.removed) fail("a route point is [x, y] or {burg: id}");
  return burg.cell;
}

/** A route along the cheapest path: {from, to, group: roads|trails|searoutes, name?} */
function planRoute(op: Op): Planned[] {
  const group = (op.group as string) ?? "roads";
  if (!["roads", "trails", "searoutes"].includes(group)) fail("group must be roads, trails or searoutes");
  if (op.name !== undefined) checkValue("name", op.name);
  const cells = Routes.findCells(endpointCell(op.from), endpointCell(op.to), group);
  if (!cells) return fail(`no ${group === "searoutes" ? "sea" : "land"} path between the points`);
  return [
    {
      summary: `create ${group} route "${op.name ?? "unnamed"}" through ${cells.length} cells`,
      layers: ["routes"],
      run: () => Routes.build(cells, group, op.name as string | undefined)
    }
  ];
}

function planCreate(op: Op): Planned[] {
  if (op.type === "route") return planRoute(op);
  if (op.type === "zone") return planZone(op);
  const { x, y } = op;
  checkValue("x", x);
  checkValue("y", y);
  const { width, height } = options.map.graph;
  if ((x as number) > width || (y as number) > height) fail(`x, y must be inside the map ${width}×${height}`);
  if (op.note !== undefined) checkValue("note", op.note);

  if (op.type === "marker") {
    if (op.name !== undefined) checkValue("name", op.name);
    const type = typeof op.markerType === "string" ? op.markerType : "custom";
    const icon = typeof op.icon === "string" ? op.icon : "📍";
    return [
      {
        summary: `create marker "${op.name ?? type}" at ${x},${y}`,
        layers: ["markers"],
        run: () => {
          const cell = Pack.findCell(x as number, y as number, Infinity, pack) as number;
          const marker = Markers.add({ type, icon, x, y, cell } as never);
          if (op.name) marker.name = op.name as string;
          if (op.note) marker.note = op.note as string;
        }
      }
    ];
  }
  if (op.type === "addedLabel") {
    checkValue("text", op.text);
    const featureId = op.featureId === undefined ? undefined : Number(op.featureId);
    return [
      {
        summary: `create label "${op.text}" at ${x},${y}`,
        layers: ["labels"],
        run: () => {
          const added = AddedLabels.add({
            x: x as number,
            y: y as number,
            label: { text: op.text as string },
            featureId
          });
          if (op.note) added.note = op.note as string;
        }
      }
    ];
  }
  if (op.type === "burg") {
    if (op.name !== undefined) checkValue("name", op.name);
    const cell = Pack.findCell(x as number, y as number, Infinity, pack) as number;
    if (pack.cells.h[cell] < 20) fail(`${x},${y} is water`);
    if (pack.cells.burg[cell]) fail(`cell ${cell} already has burg ${pack.cells.burg[cell]}`);
    return [
      {
        summary: `create burg "${op.name ?? "auto-named"}" at ${x},${y} in state ${pack.cells.state[cell]}`,
        layers: ["burgIcons", "labels"],
        run: () => {
          const id = Burgs.add([x as number, y as number]);
          if (op.name) pack.burgs[id].name = op.name as string;
          if (op.note) pack.burgs[id].note = op.note as string;
          redrawEmblem("burg", id);
        }
      }
    ];
  }
  if (op.type === "state") return planNewState(op, x as number, y as number);
  if (op.type === "province" || op.type === "culture") return planNewTerritory(op, x as number, y as number);
  return fail(`create supports marker, addedLabel, burg, state, province, culture and route, not "${op.type}"`);
}

/** A state founded at x,y (its capital), optionally taking the selected cells at once */
function planNewState(op: Op, x: number, y: number, within?: number): Planned[] {
  if (op.name !== undefined) checkValue("name", op.name);
  if (op.color !== undefined) checkValue("color", op.color);
  const cell = Pack.findCell(x, y, Infinity, pack) as number;
  if (pack.cells.h[cell] < 20) fail(`${x},${y} is water`);
  const burg = pack.cells.burg[cell];
  if (burg && pack.burgs[burg].capital) fail(`burg ${burg} at ${x},${y} is already a capital`);
  if (within !== undefined && pack.cells.state[cell] !== within) fail(`${x},${y} is outside state ${within}`);

  const selector = op.cells as CellSelector | undefined;
  let selected = selector ? selectCells(selector) : [];
  if (within !== undefined) selected = selected.filter(c => pack.cells.state[c] === within);
  const id = pack.states.length;
  return [
    {
      summary: `create state ${id} "${op.name ?? "auto-named"}" at ${x},${y}${selected.length ? ` with ${selected.length} cells` : ""}`,
      layers: ["labels"],
      run: () => {
        const created = createState([x, y], op.name as string | undefined);
        if (op.name) pack.states[created].fullName = op.name as string; // the generated form prefix is not localized
        if (op.color) pack.states[created].color = op.color as string;
        const changes = changesFor("state", created, selected);
        if (changes.size) painter("state")(changes);
      }
    }
  ];
}

/** Cut part of a state into a new one: {type: "state", id, x, y, cells, name?, color?} */
function planSplit(op: Op): Planned[] {
  if (op.type !== "state") fail("split supports states");
  assertTerritory("state", op.id, false);
  if (typeof op.cells !== "object" || op.cells === null) fail("split needs cells: the part that leaves");
  checkValue("x", op.x);
  checkValue("y", op.y);
  return planNewState(op, op.x as number, op.y as number, op.id as number);
}

/** One style value at a path inside the styles store: {path: "states.statesBody.attrs.opacity", value} */
function planStyle(op: Op): Planned[] {
  if (typeof op.path !== "string") fail("style needs path, e.g. states.statesBody.attrs.opacity");
  const keys = (op.path as string).split(".");
  if (!keys.includes("attrs") && !keys.includes("options")) fail("style path must end in attrs or options values");
  let node: Record<string, unknown> = styles as unknown as Record<string, unknown>;
  for (const key of keys.slice(0, -1)) {
    const next = node[key];
    if (typeof next !== "object" || next === null)
      fail(`style path "${op.path}" not found; read it with world_get type=style`);
    node = next as Record<string, unknown>;
  }
  const field = keys.at(-1)!;
  const before = node[field];
  const sameType = before === null || before === undefined || typeof before === typeof op.value;
  if (!(field in node) || !sameType || !["string", "number", "boolean"].includes(typeof op.value)) {
    fail(`style ${op.path} takes a ${typeof before}, got ${JSON.stringify(op.value)}`);
  }
  const layer = keys[0] as never;
  return [
    {
      summary: `style ${op.path}: ${before} → ${op.value}`,
      layers: [],
      run: () => {
        node[field] = op.value;
        Styles.apply(layer);
      }
    }
  ];
}

function planRemove(op: Op): Planned[] {
  const { type, ref } = resolve(op);
  const name = MapEntities.getName(ref);
  if (type === "burg") {
    const capital = pack.burgs[ref.id].capital ? "; its state loses the capital" : "";
    return [
      {
        summary: `remove burg ${op.id} ${name}${capital}`,
        layers: ["burgIcons", "labels"],
        run: () => {
          Burgs.remove(ref.id);
          removeEmblem("burg", ref.id);
        }
      }
    ];
  }
  if (type === "marker") {
    return [
      { summary: `remove marker ${op.id} ${name}`, layers: ["markers"], run: () => Markers.deleteMarker(ref.id) }
    ];
  }
  if (type === "zone") {
    return [
      {
        summary: `remove zone ${op.id} ${name}`,
        layers: ["zones"],
        run: () => (pack.zones = pack.zones.filter(zone => zone.i !== ref.id))
      }
    ];
  }
  if (type === "addedLabel") {
    return [{ summary: `remove label ${op.id} ${name}`, layers: ["labels"], run: () => AddedLabels.remove(ref.id) }];
  }
  return fail(`remove supports marker, addedLabel, burg and zone, not "${type}"`);
}

function planLayer(op: Op): Planned[] {
  const id = op.id as LayerId;
  if (!Layers.has(String(op.id))) fail(`unknown layer "${op.id}"`);
  if (typeof op.on !== "boolean") fail("layer needs on: true | false");
  if (Layers.isOn(id) === op.on) return [];
  return [
    {
      summary: `layer ${id} ${op.on ? "on" : "off"}`,
      layers: [],
      run: () => (op.on ? Layers.show(id) : Layers.hide(id))
    }
  ];
}

function planLore(op: Op): Planned[] {
  const lore = options.map.lore;
  return Object.entries(op)
    .filter(([key]) => key !== "op")
    .map(([field, value]) => {
      if (!LORE_FIELDS.includes(field)) fail(`lore.${field} is unknown; fields: ${LORE_FIELDS.join(", ")}`);
      checkValue(field, value);
      const isCalendar = ["year", "era", "eraShort"].includes(field);
      const before = isCalendar ? lore.calendar[field as "year"] : lore[field as "name"];
      return {
        summary: `lore ${field}: ${String(before).slice(0, 40)} → ${String(value).slice(0, 40)}`,
        layers: [],
        run: () =>
          Options.set(o => {
            if (isCalendar) Object.assign(o.map.lore.calendar, { [field]: value });
            else Object.assign(o.map.lore, { [field]: value });
          })
      };
    });
}

/** Give the selected land cells to a territory: {type, id, cells: selector} */
function planAssign(op: Op): Planned[] {
  assertTerritory(op.type, op.id);
  const type = op.type;
  const id = op.id as number;
  if (typeof op.cells !== "object" || op.cells === null)
    fail("assign needs cells: {feature | of | circle | polygon | cells}");
  if ((op.cells as CellSelector).water) fail("water cells are for zones only");
  const changes = changesFor(type, id, selectCells(op.cells as CellSelector));
  if (!changes.size) return [];
  const name = MapEntities.getName({ type, id }) || "none";
  return [
    {
      summary: `assign ${changes.size} cells to ${type} ${id} ${name}`,
      layers: [],
      run: () => painter(type)(changes)
    }
  ];
}

/** Fold states into one: {type: "state", id: keep, ids: [absorbed…]}; the absorbed ones are removed */
function planMerge(op: Op): Planned[] {
  if (op.type !== "state") fail("merge supports states");
  assertTerritory("state", op.id, false);
  if (!Array.isArray(op.ids) || !op.ids.length) fail("merge needs ids of the states to absorb");
  const id = op.id as number;
  return (op.ids as number[]).map(absorbed => {
    assertTerritory("state", absorbed, false);
    if (absorbed === id) fail("a state cannot absorb itself");
    const changes = changesFor("state", id, selectCells({ of: { type: "state", id: absorbed } }));
    return {
      summary: `merge state ${absorbed} ${MapEntities.getName({ type: "state", id: absorbed })} into ${id} (${changes.size} cells); ${absorbed} is removed`,
      layers: [],
      run: () => painter("state")(changes)
    };
  });
}

/** Create, restyle, rename or remove a user layer: {name, opacity?, blur?, stroke?, hidden?, rename?, remove?} */
function planZoneLayer(op: Op): Planned[] {
  const name = typeof op.name === "string" ? op.name.trim() : "";
  if (!name) fail("zoneLayer needs name");
  const style = Object.fromEntries(
    ["opacity", "blur", "stroke", "hidden"].filter(key => op[key] !== undefined).map(key => [key, op[key]])
  );
  if (op.remove !== undefined) {
    if (!ZoneLayers.has(name)) fail(`layer "${name}" not found`);
    const withZones = op.remove === "withZones";
    const zones = ZoneLayers.countZones(name);
    return [
      {
        summary: `remove layer "${name}"; its ${zones} zones ${withZones ? "are deleted" : "stay as ordinary zones"}`,
        layers: [],
        run: () => ZoneLayers.remove(name, withZones)
      }
    ];
  }
  if (!ZoneLayers.has(name)) {
    return [{ summary: `create layer "${name}"`, layers: [], run: () => void ZoneLayers.create(name, style) }];
  }
  const steps: Planned[] = [];
  if (Object.keys(style).length) {
    steps.push({
      summary: `layer "${name}": ${JSON.stringify(style)}`,
      layers: [],
      run: () => ZoneLayers.update(name, style)
    });
  }
  if (op.rename !== undefined) {
    if (typeof op.rename !== "string" || !op.rename.trim()) fail("rename must be a name");
    if (ZoneLayers.has((op.rename as string).trim())) fail(`layer "${op.rename}" already exists`);
    steps.push({
      summary: `rename layer "${name}" → "${op.rename}"`,
      layers: [],
      run: () => void ZoneLayers.rename(name, op.rename)
    });
  }
  if (!steps.length) fail(`layer "${name}" exists; pass opacity, blur, stroke, hidden, rename or remove`);
  return steps;
}

/** A zone of a user layer (or any zone type): {layer | zoneType, name, color?, cells: selector incl. water} */
function planZone(op: Op): Planned[] {
  const zoneType = (op.layer ?? op.zoneType) as string | undefined;
  if (typeof zoneType !== "string" || !zoneType.trim()) fail("a zone needs layer (a user layer) or zoneType");
  if (op.layer !== undefined && !ZoneLayers.has(zoneType!))
    fail(`layer "${zoneType}" not found; create it with zoneLayer`);
  if (op.name !== undefined) checkValue("name", op.name);
  if (
    op.color !== undefined &&
    !(typeof op.color === "string" && /^(#[0-9a-f]{6}|url\(#hatch\d+\))$/i.test(op.color))
  ) {
    fail("color must be #rrggbb or url(#hatchN)");
  }
  if (op.note !== undefined) checkValue("note", op.note);
  const cells = selectCells((op.cells ?? {}) as CellSelector);
  if (!cells.length) fail("the selector picks no cells");
  const id = pack.zones.length ? Math.max(...pack.zones.map(zone => zone.i)) + 1 : 0;
  return [
    {
      summary: `create zone ${id} "${op.name ?? zoneType}" in "${zoneType}" with ${cells.length} cells`,
      layers: ["zones"],
      run: () => {
        const zone = {
          i: id,
          name: (op.name as string) ?? zoneType!,
          type: zoneType!,
          cells,
          color: (op.color as string) ?? `url(#hatch${id % 42})`
        };
        pack.zones.push(op.note ? { ...zone, note: op.note as string } : zone);
        if (!Layers.isOn("zones")) Layers.show("zones");
      }
    }
  ];
}

/** Grow or trim a zone: {id, add?: selector, remove?: selector} */
function planZoneCells(op: Op): Planned[] {
  const zone = pack.zones.find(z => z.i === Number(op.id));
  if (!zone) return fail(`zone ${op.id} not found`);
  const add = op.add ? selectCells(op.add as CellSelector) : [];
  const drop = new Set(op.remove ? selectCells(op.remove as CellSelector) : []);
  const next = new Set(zone.cells.filter(cell => !drop.has(cell)));
  for (const cell of add) next.add(cell);
  if (!op.add && !op.remove) fail("zoneCells needs add or remove");
  return [
    {
      summary: `zone ${zone.i} "${zone.name}": ${zone.cells.length} → ${next.size} cells`,
      layers: ["zones"],
      run: () => (zone.cells = [...next])
    }
  ];
}

const PLANNERS: Record<string, (op: Op) => Planned[]> = {
  zoneLayer: planZoneLayer,
  zoneCells: planZoneCells,
  assign: planAssign,
  merge: planMerge,
  split: planSplit,
  style: planStyle,
  set: planSet,
  create: planCreate,
  remove: planRemove,
  layer: planLayer,
  lore: planLore
};

export const OPERATIONS = Object.keys(PLANNERS);

/** Validate the whole batch first: one bad op rejects all, nothing is touched */
export function plan(ops: unknown): Planned[] {
  if (!Array.isArray(ops) || !ops.length) fail("ops must be a non-empty array");
  if ((ops as unknown[]).length > 100) fail("at most 100 ops per batch");
  return (ops as Op[]).flatMap((op, index) => {
    const planner = PLANNERS[op?.op];
    if (!planner) fail(`ops[${index}]: unknown op "${op?.op}"; ops: ${OPERATIONS.join(", ")}`);
    try {
      return planner(op);
    } catch (error) {
      return fail(`ops[${index}]: ${(error as Error).message}`);
    }
  });
}

/** Run planned edits, then redraw each touched layer once */
export function execute(planned: Planned[]): void {
  for (const step of planned) step.run();
  const layers = [...new Set(planned.flatMap(step => step.layers))];
  if (layers.length) Layers.draw(...layers);
  refreshEditors();
}
