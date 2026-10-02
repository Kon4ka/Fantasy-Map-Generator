import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createMapFileStore } from "./map-file-store.ts";

const original = "1.153.1|test\r\n<svg id=\"map\"></svg>\r\noriginal";
const edited = original.replace("original", "edited");
const digest = (data: string) => createHash("sha256").update(data).digest("hex");

test("launcher saves overwrite only the verified file, and Save as changes the target", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "map-file-test-"));
  assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
  try {
    const file = path.join(directory, "world.map");
    await fs.writeFile(file, original);
    const store = createMapFileStore(directory, [directory]);
    assert.equal(await store.associate("world.map", digest("different file")), null);
    const target = await store.associate("world.map", digest(original));
    assert.ok(target);
    await store.save(target.id, edited);
    assert.equal(await fs.readFile(file, "utf8"), edited);
    assert.equal(await fs.readFile(`${file}.bak`, "utf8"), original);
    await store.save(target.id, original);
    assert.deepEqual((await fs.readdir(directory)).sort(), ["world.map", "world.map.bak"]);

    const copy = await store.saveAs("renamed.map", edited);
    await store.save(copy.id, original);
    assert.equal(await fs.readFile(file, "utf8"), original);
    assert.equal(await fs.readFile(path.join(directory, "renamed.map"), "utf8"), original);
    await assert.rejects(store.saveAs("world.map", edited), { code: "EEXIST" });
    await assert.rejects(store.saveAs("../outside.map", edited));
    await assert.rejects(store.saveAs("NUL.map", edited));
    await assert.rejects(store.save("unknown", edited));
    await fs.writeFile(file, "external edit");
    await assert.rejects(store.save(target.id, edited), /changed outside/);
    assert.equal(await fs.readFile(file, "utf8"), "external edit");
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
