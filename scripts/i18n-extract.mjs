import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import ts from "typescript";

const ROOT = path.resolve(import.meta.dirname, "..");
const SOURCE_ROOT = path.join(ROOT, "src");
const LOCALE_PATH = path.join(SOURCE_ROOT, "data", "locales", "ru.json");
const ATTRIBUTES = ["aria-label", "data-tip", "placeholder", "title"];
const UI_CALLS = new Set(["alert", "confirm", "confirmationDialog", "prompt", "tip"]);
const UI_PROPERTIES = new Set(["confirm", "label", "message", "placeholder", "title"]);

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(absolute);
    if (!entry.isFile() || !/\.(html|ts)$/.test(entry.name) || /\.test\.ts$/.test(entry.name)) return [];
    return [absolute];
  });
}

function normalize(value) {
  return value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
}

function isCandidate(value) {
  if (value.length < 2 || value.length > 500 || !/[A-Za-z]{2}/.test(value)) return false;
  if (/^(?:https?:|mailto:|[.#/\\]|[\w-]+\.(?:css|html|js|json|map|png|svg|ts))/.test(value)) return false;
  if (/[{};]$/.test(value) || /(?:querySelector|document\.|window\.|=>|===|!==)/.test(value)) return false;
  return true;
}

function add(candidates, value) {
  const normalized = normalize(value);
  if (isCandidate(normalized)) candidates.add(normalized);
}

function extractHtml(candidates, html) {
  const attributes = ATTRIBUTES.join("|");
  for (const match of html.matchAll(new RegExp(`(?:${attributes})="([^"]+)"`, "g"))) add(candidates, match[1]);
  for (const match of html.matchAll(/>([^<>{}`]+)</g)) add(candidates, match[1]);
}

function propertyName(node) {
  if (!node) return "";
  if (ts.isIdentifier(node) || ts.isStringLiteral(node)) return node.text;
  return "";
}

function callName(node) {
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  return "";
}

function extractTypeScript(candidates, filePath, sourceText) {
  const source = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);

  function visit(node) {
    if (ts.isNoSubstitutionTemplateLiteral(node)) {
      if (node.text.includes("<")) extractHtml(candidates, node.text);
      else if (ts.isCallExpression(node.parent) && UI_CALLS.has(callName(node.parent.expression))) add(candidates, node.text);
    } else if (ts.isTemplateExpression(node)) {
      const template = [node.head.text, ...node.templateSpans.map(span => ` DYNAMIC ${span.literal.text}`)].join("");
      if (template.includes("<")) extractHtml(candidates, template);
    } else if (ts.isStringLiteral(node)) {
      const parent = node.parent;
      if (ts.isCallExpression(parent) && UI_CALLS.has(callName(parent.expression))) add(candidates, node.text);
      if (ts.isPropertyAssignment(parent) && UI_PROPERTIES.has(propertyName(parent.name))) add(candidates, node.text);
      if (/\s/.test(node.text) && !ts.isImportDeclaration(parent) && !ts.isExportDeclaration(parent)) {
        add(candidates, node.text);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(source);
}

const candidates = new Set();
for (const filePath of sourceFiles(SOURCE_ROOT)) {
  const source = fs.readFileSync(filePath, "utf8");
  if (filePath.endsWith(".html")) extractHtml(candidates, source);
  else extractTypeScript(candidates, filePath, source);
}

const locale = JSON.parse(fs.readFileSync(LOCALE_PATH, "utf8"));
const translated = new Set(Object.keys(locale.messages));
const ignored = new Set(locale.ignored ?? []);
const missing = [...candidates]
  .filter(candidate => !translated.has(candidate) && !ignored.has(candidate))
  .sort((left, right) => left.localeCompare(right));

if (process.argv.includes("--json")) {
  process.stdout.write(`${JSON.stringify(missing, null, 2)}\n`);
} else {
  process.stdout.write(
    `Russian UI catalog: ${translated.size} exact messages, ${locale.patterns.length} patterns, ${ignored.size} ignored names\n`
  );
  process.stdout.write(`Statically detected untranslated strings: ${missing.length}\n`);
  if (missing.length) process.stdout.write(`${missing.map(value => `- ${value}`).join("\n")}\n`);
}

process.exitCode = missing.length ? 1 : 0;
