import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const text = fs.readFileSync(new URL("./map-launch.mjs", import.meta.url), "utf8");
const source = ts.createSourceFile("map-launch.mjs", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const launches: ts.ObjectLiteralExpression[] = [];
function visit(node: ts.Node): void {
  if (ts.isCallExpression(node) && node.expression.getText(source) === "chromium.launchPersistentContext") {
    const options = node.arguments[1];
    assert.ok(options && ts.isObjectLiteralExpression(options));
    launches.push(options);
  }
  ts.forEachChild(node, visit);
}
visit(source);

test("normal and self-test launches use the same sandbox-enabled configuration", () => {
  assert.equal(launches.length, 1);
  const sandbox = launches[0].properties.find(
    property => ts.isPropertyAssignment(property) && property.name.getText(source) === "chromiumSandbox"
  );
  assert.ok(sandbox && ts.isPropertyAssignment(sandbox));
  assert.equal(sandbox.initializer.kind, ts.SyntaxKind.TrueKeyword);
  assert.ok(launches[0].properties.every(property => !ts.isSpreadAssignment(property)));
});

test("launcher does not explicitly disable sandboxing or hide the warning", () => {
  assert.doesNotMatch(text, /--(?:no-sandbox|disable-setuid-sandbox|disable-infobars)/);
});
