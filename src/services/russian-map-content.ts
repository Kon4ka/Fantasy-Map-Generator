import ruLocaleJson from "@/data/locales/ru.json";
import { getLocale, translateDataTerm } from "@/services/localization";

type DataPattern = { source: string; target: string };
type DataLocale = { dataMessages?: Record<string, string>; dataPatterns?: DataPattern[] };

const dataLocale = ruLocaleJson as DataLocale;
const dataEntries = Object.entries(dataLocale.dataMessages ?? {}).sort(([left], [right]) => right.length - left.length);
const dataPatterns = (dataLocale.dataPatterns ?? []).map(({ source, target }) => ({
  expression: new RegExp(source),
  target
}));

const multiGraphs: Array<[string, string]> = [
  ["shch", "щ"],
  ["sch", "ш"],
  ["tch", "ч"],
  ["zh", "ж"],
  ["kh", "х"],
  ["ts", "ц"],
  ["ch", "ч"],
  ["sh", "ш"],
  ["ph", "ф"],
  ["th", "т"],
  ["qu", "кв"],
  ["ck", "к"],
  ["ya", "я"],
  ["yu", "ю"],
  ["yo", "ё"],
  ["ye", "е"],
  ["ai", "ай"],
  ["ei", "ей"],
  ["ey", "ей"]
];

const letters: Record<string, string> = {
  a: "а",
  b: "б",
  c: "к",
  d: "д",
  e: "е",
  f: "ф",
  g: "г",
  h: "х",
  i: "и",
  j: "дж",
  k: "к",
  l: "л",
  m: "м",
  n: "н",
  o: "о",
  p: "п",
  q: "к",
  r: "р",
  s: "с",
  t: "т",
  u: "у",
  v: "в",
  w: "в",
  x: "кс",
  y: "й",
  z: "з"
};

function preserveCase(source: string, target: string): string {
  if (source === source.toUpperCase()) return target.toUpperCase();
  if (source[0] === source[0]?.toUpperCase()) return target[0]?.toUpperCase() + target.slice(1);
  return target;
}

function transliterateWord(word: string): string {
  const normalized = word
    .replaceAll("æ", "ae")
    .replaceAll("Æ", "Ae")
    .replaceAll("œ", "oe")
    .replaceAll("Œ", "Oe")
    .replaceAll("ø", "o")
    .replaceAll("Ø", "O")
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  let result = "";

  for (let index = 0; index < normalized.length; ) {
    const rest = normalized.slice(index);
    const graph = multiGraphs.find(([source]) => rest.toLowerCase().startsWith(source));
    if (graph) {
      const source = rest.slice(0, graph[0].length);
      result += preserveCase(source, graph[1]);
      index += graph[0].length;
      continue;
    }

    const source = normalized[index];
    const lower = source.toLowerCase();
    let target = letters[lower] ?? source;
    if (lower === "c" && /[eiy]/i.test(normalized[index + 1] ?? "")) target = "с";
    result += preserveCase(source, target);
    index += 1;
  }

  return result;
}

export function transliterateToRussian(source: string): string {
  if (!/[A-Za-zÀ-ž]/.test(source)) return source;
  return source.replace(/[A-Za-zÀ-ž]+/g, transliterateWord);
}

function replaceDataPhrases(source: string): string {
  let result = source;
  for (const [term, target] of dataEntries) {
    if (!term.includes(" ")) continue;
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(new RegExp(`\\b${escaped}\\b`, "gi"), target);
  }
  return result;
}

function localizePhrase(source: string): string {
  const withPhrases = replaceDataPhrases(source);
  return withPhrases
    .replace(/[A-Za-zÀ-ž]+(?:-[A-Za-zÀ-ž]+)*/g, word => {
      const translated = translateDataTerm(word);
      return translated === word ? transliterateToRussian(word) : translated;
    })
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function localizeGeneratedName(source: string): string {
  if (!source || !/[A-Za-zÀ-ž]/.test(source)) return source;

  const exact = translateDataTerm(source);
  if (exact !== source) return exact;

  const deity = source.match(/^(.+), The (.+)$/);
  if (deity) return `${transliterateToRussian(deity[1])}, ${localizePhrase(deity[2])}`;

  for (const { expression, target } of dataPatterns) {
    const match = source.match(expression);
    if (!match) continue;
    return target.replace(/\{(\d+)\}/g, (_, index: string) => localizePhrase(match[Number(index)] ?? ""));
  }

  return localizePhrase(source);
}

function localizeField<T extends object, K extends keyof T>(record: T, key: K): boolean {
  const value = record[key];
  if (typeof value !== "string") return false;
  const localized = localizeGeneratedName(value);
  if (localized === value) return false;
  record[key] = localized as T[K];
  return true;
}

function localizeList(records: unknown, fields: string[]): boolean {
  if (!Array.isArray(records)) return false;
  let changed = false;
  for (const record of records) {
    if (!record || typeof record !== "object") continue;
    for (const field of fields) changed = localizeField(record as Record<string, unknown>, field) || changed;
  }
  return changed;
}

function localizeNameBases(): boolean {
  if (typeof Names === "undefined" || !Array.isArray(Names.nameBases)) return false;
  let changed = false;

  for (const base of Names.nameBases) {
    const name = translateDataTerm(base.name);
    const sourceNames = base.b.split(",");
    const names = sourceNames.map(transliterateToRussian);
    const duplication = transliterateToRussian(base.d).toLocaleLowerCase("ru");
    if (name === base.name && names.every((value, index) => value === sourceNames[index]) && duplication === base.d) continue;
    base.name = name;
    base.b = names.join(",");
    base.d = duplication;
    changed = true;
  }

  if (changed) Names.clearChains();
  return changed;
}

export function localizeCurrentMapToRussian(): boolean {
  if (getLocale() !== "ru" || typeof pack === "undefined") return false;

  let changed = localizeNameBases();
  changed = localizeList(pack.states, ["name", "fullName"]) || changed;
  changed = localizeList(pack.provinces, ["name", "fullName"]) || changed;
  changed = localizeList(pack.burgs, ["name"]) || changed;
  changed = localizeList(pack.cultures, ["name"]) || changed;
  changed = localizeList(pack.religions, ["name", "deity"]) || changed;
  changed = localizeList(pack.features, ["name"]) || changed;
  changed = localizeList(pack.zones, ["name"]) || changed;
  changed = localizeList(pack.markers, ["name"]) || changed;
  changed = localizeList(pack.rivers, ["name"]) || changed;
  changed = localizeList(pack.routes, ["name"]) || changed;

  return changed;
}

export function initializeRussianMapContent(): void {
  const localize = () => {
    if (!localizeCurrentMapToRussian()) return;
    if (typeof Layers !== "undefined" && typeof customization !== "undefined" && customization === 0) {
      Layers.draw("labels");
    }
  };

  window.addEventListener("map:generated", localize);
  window.addEventListener("interface:locale-changed", localize);
}
