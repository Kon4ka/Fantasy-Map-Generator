// Compact tabular answers for the AI agent: filter, sort, project, page. Pure, so it is testable
export type Row = Record<string, unknown>;
export type Condition = unknown | { like?: string; gt?: number; lt?: number; in?: unknown[]; ne?: unknown };
export type Where = Record<string, Condition>;

export interface TableQuery {
  where?: Where;
  fields?: string[];
  sort?: string; // "field" or "-field"
  limit?: number;
  cursor?: number;
}

export interface Table {
  cols: string[];
  rows: unknown[][];
  total: number;
  next?: number;
}

const MAX_LIMIT = 200;
const MAX_TEXT = 200;

const isOperator = (value: unknown): value is Exclude<Condition, unknown[]> & object =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const plain = (value: unknown): unknown => (Array.isArray(value) ? value[0] : value); // a [id, name] ref compares by id

function matches(value: unknown, condition: Condition): boolean {
  if (!isOperator(condition)) return plain(value) === condition;
  const { like, gt, lt, in: oneOf, ne } = condition as Record<string, unknown>;
  const raw = plain(value);
  const text = Array.isArray(value) ? String(value[1] ?? "") : String(raw ?? "");
  if (like !== undefined && !text.toLowerCase().includes(String(like).toLowerCase())) return false;
  if (gt !== undefined && !(Number(raw) > Number(gt))) return false;
  if (lt !== undefined && !(Number(raw) < Number(lt))) return false;
  if (Array.isArray(oneOf) && !oneOf.includes(raw)) return false;
  if (ne !== undefined && raw === ne) return false;
  return true;
}

/** Round numbers and shorten text, so a row costs few tokens */
export function compact(value: unknown): unknown {
  if (typeof value === "number") return Number.isInteger(value) ? value : Math.round(value * 100) / 100;
  if (typeof value === "string") return value.length > MAX_TEXT ? `${value.slice(0, MAX_TEXT)}…` : value;
  if (Array.isArray(value)) return value.map(compact);
  if (isOperator(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, compact(item)]));
  return value;
}

export function toTable(rows: Row[], query: TableQuery, defaultFields: string[]): Table {
  const { where = {}, sort, cursor = 0 } = query;
  const limit = Math.min(Math.max(1, query.limit ?? 20), MAX_LIMIT);
  let selected = rows.filter(row =>
    Object.entries(where).every(([field, condition]) => matches(row[field], condition))
  );

  if (sort) {
    const descending = sort.startsWith("-");
    const field = descending ? sort.slice(1) : sort;
    const key = (row: Row) => plain(row[field]) as number | string;
    selected = [...selected].sort((a, b) => {
      const [x, y] = [key(a), key(b)];
      const order = x === y ? 0 : x === undefined ? 1 : y === undefined ? -1 : x < y ? -1 : 1;
      return descending ? -order : order;
    });
  }

  const cols = query.fields?.length ? query.fields : defaultFields;
  const page = selected.slice(cursor, cursor + limit);
  const next = cursor + limit < selected.length ? cursor + limit : undefined;
  return {
    cols,
    rows: page.map(row => cols.map(col => compact(row[col]) ?? null)),
    total: selected.length,
    ...(next === undefined ? {} : { next })
  };
}
