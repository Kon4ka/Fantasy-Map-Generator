import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { gunzipSync, gzipSync } from "node:zlib";
import { JSDOM } from "jsdom";

export function removeReligions(source: Buffer): { data: Buffer; removed: number; changedSections: number[] } {
  const compressed = source[0] === 31 && source[1] === 139;
  const original = (compressed ? gunzipSync(source) : source).toString("utf8").split("\r\n");
  if (original.length !== 53 || !original[0].startsWith("1.153.")) throw new Error("Unsupported map format");
  const sections = [...original];
  const religions: { i: number; name: string; removed?: boolean }[] = JSON.parse(sections[29]);
  if (!Array.isArray(religions) || religions[0]?.i !== 0) throw new Error("Missing no-religion entry");
  const cells = sections[26].split(",");
  if (cells.length !== sections[25].split(",").length || cells.some(id => !/^\d+$/.test(id))) {
    throw new Error("Invalid religion cell assignments");
  }
  sections[26] = cells.map(() => "0").join(",");
  sections[29] = JSON.stringify([{ i: 0, name: religions[0].name, origins: null }]);

  const dom = new JSDOM(sections[5], { includeNodeLocations: true });
  try {
    const layer = dom.window.document.getElementById("relig");
    if (!layer) throw new Error("Missing religion SVG layer");
    if (layer.childNodes.length) {
      const location = dom.nodeLocation(layer);
      if (!location?.startTag || !location.endTag) throw new Error("Invalid religion SVG boundaries");
      sections[5] = sections[5].slice(0, location.startTag.endOffset) + sections[5].slice(location.endTag.startOffset);
    }
  } finally {
    dom.window.close();
  }
  const verification = new JSDOM(sections[5], { contentType: "image/svg+xml" });
  try {
    if (verification.window.document.getElementById("relig")?.childNodes.length) {
      throw new Error("Religion geometry remains");
    }
  } finally {
    verification.window.close();
  }
  const changedSections = sections.flatMap((section, index) => section === original[index] ? [] : [index]);
  if (changedSections.some(index => ![5, 26, 29].includes(index))) throw new Error("Unrelated map data changed");
  const data = Buffer.from(sections.join("\r\n"), "utf8");
  return {
    data: compressed ? gzipSync(data) : data,
    removed: religions.filter(religion => religion.i && !religion.removed).length,
    changedSections
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const input = path.resolve(process.argv[2] || "");
  if (!process.argv[2] || !input.endsWith(".map")) throw new Error("Usage: node script.ts save.map [--check]");
  const source = fs.readFileSync(input);
  const result = removeReligions(source);
  const backup = `${input}.before-religions-removal.bak`;
  if (process.argv[3] !== "--check") {
    if (!fs.readFileSync(input).equals(source)) throw new Error("Source map changed during verification");
    fs.writeFileSync(backup, source, { flag: "wx" });
    if (!fs.readFileSync(backup).equals(source)) throw new Error("Backup verification failed");
    const temporary = `${input}.religions-${Date.now()}.tmp`;
    fs.writeFileSync(temporary, result.data, { flag: "wx" });
    try {
      if (!fs.readFileSync(input).equals(source)) throw new Error("Source map changed before replacement");
      fs.renameSync(temporary, input);
    } finally {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
    if (!fs.readFileSync(input).equals(result.data)) throw new Error("Saved map verification failed");
  }
  console.log(JSON.stringify({ input, backup, removed: result.removed, changedSections: result.changedSections }));
}
