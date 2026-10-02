import assert from "node:assert/strict";
import { test } from "node:test";
import { gunzipSync, gzipSync } from "node:zlib";
import { removeReligions } from "./map-remove-religions.ts";

function fixture(svg = '<svg xmlns="http://www.w3.org/2000/svg"><g id="relig"/></svg>'): Buffer {
  const sections = Array.from({ length: 53 }, (_, index) => `preserved-${index}`);
  sections[0] = "1.153.1|test";
  sections[5] = svg;
  sections[25] = "1,1,0";
  sections[26] = "1,2,0";
  sections[29] = JSON.stringify([{ i: 0, name: "Нет религии" }, { i: 1, name: "A" }, { i: 2, name: "B" }]);
  return Buffer.from(sections.join("\r\n"));
}

test("removes definitions and assignments while preserving every other section", () => {
  const result = removeReligions(fixture());
  const sections = result.data.toString().split("\r\n");
  assert.equal(result.removed, 2);
  assert.equal(sections[26], "0,0,0");
  assert.deepEqual(JSON.parse(sections[29]), [{ i: 0, name: "Нет религии", origins: null }]);
  assert.deepEqual(result.changedSections, [26, 29]);
});

test("clears nested religion geometry without reserializing other SVG or embedded newlines", () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"><g id="states"><path d="M0 0"/></g>\n' +
    '<g opacity="0.5" id="relig"><g><path id="religion1"/></g></g><g id="labels"><text>A</text></g></svg>';
  const result = removeReligions(fixture(svg));
  assert.equal(result.data.toString().split("\r\n")[5], svg.replace('<g><path id="religion1"/></g>', ""));
  assert.deepEqual(result.changedSections, [5, 26, 29]);
});

test("preserves gzip format", () => {
  const result = removeReligions(gzipSync(fixture()));
  assert.equal(result.data[0], 31);
  assert.equal(gunzipSync(result.data).toString().split("\r\n")[26], "0,0,0");
});

test("rejects malformed assignments and unsupported formats before writing", () => {
  assert.throws(() => removeReligions(Buffer.from(fixture().toString().replace("1,2,0", "1,NaN,0"))));
  assert.throws(() => removeReligions(Buffer.from("invalid map")));
});
