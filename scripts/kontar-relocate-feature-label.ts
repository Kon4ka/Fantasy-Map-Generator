import fs from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";
import { JSDOM } from "jsdom";
import { normalizeMapSvg } from "../src/services/io/map-format.ts";
import type { AddedLabel } from "../src/generators/added-labels.ts";
import type { Feature } from "../src/generators/features-generator.ts";

const [input, output, featureArg, labelArg, xArg, yArg] = process.argv.slice(2);
const [featureId, labelId, x, y] = [featureArg, labelArg, xArg, yArg].map(Number);
if (!input || !output || [featureId, labelId, x, y].some(value => !Number.isFinite(value))) {
  throw new Error("Usage: input.map output.map featureId labelId x y");
}
const source = fs.readFileSync(input);
const compressed = source[0] === 31 && source[1] === 139;
const lines = (compressed ? gunzipSync(source) : source).toString("utf8").split("\r\n");
const original = [...lines];
const features: Feature[] = JSON.parse(lines[12]);
const labels: AddedLabel[] = JSON.parse(lines[47]);
const feature = features.find(feature => feature.i === featureId);
const added = labels.find(label => label.i === labelId);
if (feature?.type !== "island" || !added?.label.text) throw new Error("Expected an island and a named label");

feature.name = added.label.text;
added.featureId = featureId;
added.x = x;
added.y = y;
added.label.fontSize = 100;
for (const key of ["dx", "dy", "pathPoints", "startOffset"] as const) delete added.label[key];

const document = new JSDOM(lines[5], { contentType: "image/svg+xml" }).window.document;
const text = document.getElementById(`addedLabel${labelId}`);
if (!text) throw new Error("The label is missing from the saved SVG");
text.setAttribute("x", String(x));
text.setAttribute("y", String(y));
text.setAttribute("font-size", "100%");
text.removeAttribute("transform");
text.textContent = added.label.text;
document.getElementById(`textPath_addedLabel${labelId}`)?.remove();
lines[5] = normalizeMapSvg(document.documentElement.outerHTML);
lines[12] = JSON.stringify(features);
lines[47] = JSON.stringify(labels);
const data = Buffer.from(lines.join("\r\n"), "utf8");
fs.writeFileSync(output, compressed ? gzipSync(data) : data, { flag: "wx" });

const changedSections = lines.flatMap((line, index) => line === original[index] ? [] : [index]);
if (changedSections.some(index => ![5, 12, 47].includes(index))) throw new Error("Unexpected map changes");
console.log(JSON.stringify({ output, feature: { i: featureId, name: feature.name }, label: added, changedSections }, null, 2));
