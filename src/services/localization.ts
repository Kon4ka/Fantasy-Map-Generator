import ruLocaleJson from "@/data/locales/ru.json";

export type InterfaceLocale = "en" | "ru";

interface LocalePattern {
  source: string;
  target: string;
}

interface LocaleCatalog {
  locale: InterfaceLocale;
  name: string;
  messages: Record<string, string>;
  patterns: LocalePattern[];
  ignored?: string[];
}

const ruLocale = ruLocaleJson as LocaleCatalog;
const ignored = new Set(ruLocale.ignored ?? []);
const STORAGE_KEY = "kontar.interfaceLocale";
const TRANSLATABLE_ATTRIBUTES = ["aria-label", "data-tip", "placeholder", "title"] as const;
const EXCLUDED_SELECTOR = [
  "#map",
  "#speakerVoice",
  "canvas",
  "script",
  "style",
  "template",
  "textarea",
  "[contenteditable]:not([contenteditable='false'])",
  "[translate='no']",
  ".notranslate",
  ".ql-editor"
].join(",");

const compiledPatterns = ruLocale.patterns.map(({ source, target }) => ({ expression: new RegExp(source), target }));
const sourceText = new WeakMap<Text, string>();
const appliedText = new WeakMap<Text, string>();
const sourceAttributes = new WeakMap<Element, Map<string, string>>();
const appliedAttributes = new WeakMap<Element, Map<string, string>>();
const sourceCompoundText = new WeakMap<Element, string>();
const appliedCompoundText = new WeakMap<Element, string>();
const missingTranslations = new Set<string>();

let locale = resolveInitialLocale();
let observer: MutationObserver | undefined;

function resolveInitialLocale(): InterfaceLocale {
  const requested = new URLSearchParams(location.search).get("lang") || localStorage.getItem(STORAGE_KEY);
  return requested === "en" ? "en" : "ru";
}

function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function isExcluded(node: Node): boolean {
  const element = node instanceof Element ? node : node.parentElement;
  return Boolean(element?.closest(EXCLUDED_SELECTOR));
}

function isTranslationCandidate(value: string): boolean {
  return /[A-Za-z]{2}/.test(value) && !/^(?:https?:|[\w.-]+@[\w.-]+\.|\d+(?:[.,]\d+)?\s+[A-Za-z]{1,5}$)/.test(value);
}

function recordMissing(value: string): void {
  missingTranslations.add(value);
  if (import.meta.env.DEV) {
    const serialized = JSON.stringify([...missingTranslations]);
    sessionStorage.setItem("kontar.i18nMissing", serialized);
    document.documentElement.dataset.i18nMissing = serialized;
  }
}

function interpolate(target: string, match: RegExpMatchArray): string {
  return target.replace(/\{(\d+)\}/g, (_, index: string) => translate(match[Number(index)] ?? ""));
}

export function translate(source: string): string {
  if (locale === "en") return source;

  const leadingWhitespace = source.match(/^\s*/)?.[0] ?? "";
  const trailingWhitespace = source.match(/\s*$/)?.[0] ?? "";
  const normalized = normalize(source);
  if (!normalized) return source;
  if (ignored.has(normalized)) return source;

  const exact = ruLocale.messages[normalized];
  if (exact !== undefined) return `${leadingWhitespace}${exact}${trailingWhitespace}`;

  for (const { expression, target } of compiledPatterns) {
    const match = normalized.match(expression);
    if (match) return `${leadingWhitespace}${interpolate(target, match)}${trailingWhitespace}`;
  }

  if (isTranslationCandidate(normalized)) recordMissing(normalized);
  return source;
}

function translateTextNode(node: Text): void {
  if (isExcluded(node)) return;

  const current = node.data;
  const lastApplied = appliedText.get(node);
  if (!sourceText.has(node) || current !== lastApplied) sourceText.set(node, current);

  const translated = translate(sourceText.get(node) ?? current);
  appliedText.set(node, translated);
  if (translated !== current) node.data = translated;
}

function isButtonValue(element: Element, attribute: string): boolean {
  if (attribute !== "value" || !(element instanceof HTMLInputElement)) return false;
  return ["button", "reset", "submit"].includes(element.type);
}

function translateAttribute(element: Element, attribute: string): void {
  if (isExcluded(element)) return;
  const current = element.getAttribute(attribute);
  if (current === null) return;

  const sources = sourceAttributes.get(element) ?? new Map<string, string>();
  const applied = appliedAttributes.get(element) ?? new Map<string, string>();
  if (!sources.has(attribute) || current !== applied.get(attribute)) sources.set(attribute, current);

  const translated = translate(sources.get(attribute) ?? current);
  applied.set(attribute, translated);
  sourceAttributes.set(element, sources);
  appliedAttributes.set(element, applied);
  if (translated !== current) element.setAttribute(attribute, translated);
}

function translateElement(element: Element): void {
  if (isExcluded(element)) return;

  const hotkey = element.querySelector(":scope > u");
  if (hotkey || sourceCompoundText.has(element)) {
    const current = normalize(element.textContent ?? "");
    if (!sourceCompoundText.has(element) || current !== appliedCompoundText.get(element)) {
      sourceCompoundText.set(element, current);
    }
    const source = sourceCompoundText.get(element) ?? current;
    const translated = translate(source);
    appliedCompoundText.set(element, translated);
    if (translated !== current) element.textContent = translated;
  }

  for (const attribute of TRANSLATABLE_ATTRIBUTES) translateAttribute(element, attribute);
  if (isButtonValue(element, "value")) translateAttribute(element, "value");
}

function translateTree(root: Node): void {
  if (root instanceof Text) {
    translateTextNode(root);
    return;
  }
  if (!(root instanceof Element || root instanceof Document)) return;
  if (root instanceof Element) translateElement(root);

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node instanceof Text) translateTextNode(node);
    else if (node instanceof Element) translateElement(node);
  }
}

function handleMutations(mutations: MutationRecord[]): void {
  for (const mutation of mutations) {
    if (mutation.type === "attributes") {
      if (mutation.target instanceof Element && mutation.attributeName) {
        translateAttribute(mutation.target, mutation.attributeName);
      }
      continue;
    }

    if (mutation.type === "characterData") {
      if (mutation.target instanceof Text) translateTextNode(mutation.target);
      continue;
    }

    for (const node of mutation.addedNodes) translateTree(node);
  }
}

export function setLocale(nextLocale: InterfaceLocale): void {
  locale = nextLocale;
  localStorage.setItem(STORAGE_KEY, locale);
  document.documentElement.lang = locale;
  translateTree(document.body);
  window.dispatchEvent(new CustomEvent("interface:locale-changed", { detail: { locale } }));
}

export function getLocale(): InterfaceLocale {
  return locale;
}

export function getMissingTranslations(): string[] {
  return [...missingTranslations].sort((left, right) => left.localeCompare(right));
}

export function initializeLocalization(): void {
  missingTranslations.clear();
  if (import.meta.env.DEV) {
    sessionStorage.setItem("kontar.i18nMissing", "[]");
    document.documentElement.dataset.i18nMissing = "[]";
  }
  document.documentElement.lang = locale;
  translateTree(document.body);

  observer?.disconnect();
  observer = new MutationObserver(handleMutations);
  observer.observe(document.body, {
    attributeFilter: [...TRANSLATABLE_ATTRIBUTES, "value"],
    attributes: true,
    characterData: true,
    childList: true,
    subtree: true
  });
}

declare global {
  interface Window {
    KontarI18n: {
      getLocale: typeof getLocale;
      getMissingTranslations: typeof getMissingTranslations;
      setLocale: typeof setLocale;
      translate: typeof translate;
    };
  }
}

window.KontarI18n = { getLocale, getMissingTranslations, setLocale, translate };
