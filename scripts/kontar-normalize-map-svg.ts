import fs from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";
import { normalizeMapSvg } from "../src/services/io/map-format.ts";

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error("Usage: input.map output.map");
const source = fs.readFileSync(input);
const compressed = source[0] === 31 && source[1] === 139;
const original = (compressed ? gunzipSync(source) : source).toString("utf8");
const repaired = normalizeMapSvg(original);
const before = original.split("\r\n");
const after = repaired.split("\r\n");
const changedSections = after.flatMap((line, index) => line === before[index] ? [] : [index]);
if (before.length !== after.length || changedSections.some(index => index !== 5)) {
  throw new Error("Repair must only change the SVG section");
}
const data = Buffer.from(repaired, "utf8");
fs.writeFileSync(output, compressed ? gzipSync(data) : data, { flag: "wx" });
console.log(JSON.stringify({ output, changedSections, preservedSections: after.length - changedSections.length }));
