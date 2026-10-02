import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { startAgentBridge } from "./map-agent-bridge.ts";
import { handle } from "./map-mcp.ts";

const echo = async (method: string, args: Record<string, unknown>) => ({ method, args });

test("initialize answers with tools capability and the client's protocol version", async () => {
  const answer = await handle({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } });
  const result = answer?.result as { protocolVersion: string; capabilities: object };
  assert.equal(result.protocolVersion, "2025-03-26");
  assert.deepEqual(result.capabilities, { tools: {} });
});

test("notifications get no reply", async () => {
  assert.equal(await handle({ jsonrpc: "2.0", method: "notifications/initialized" }), undefined);
});

test("tools/list hides the bridge method names", async () => {
  const answer = await handle({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  const tools = (answer?.result as { tools: Record<string, unknown>[] }).tools;
  assert.deepEqual(
    tools.map(tool => tool.name),
    ["world_status", "world_schema", "world_query", "world_get", "world_apply", "world_generate", "world_save", "world_open", "world_close", "world_undo"]
  );
  assert.ok(tools.every(tool => !("method" in tool)));
});

test("tools/call forwards to the agent and flags errors", async () => {
  const answer = await handle(
    { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "world_query", arguments: { type: "state" } } },
    echo
  );
  const result = answer?.result as { content: { text: string }[]; isError: boolean };
  assert.deepEqual(JSON.parse(result.content[0].text), { method: "query", args: { type: "state" } });
  assert.equal(result.isError, false);

  const failed = await handle(
    { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "world_status" } },
    async () => ({ error: "no map" })
  );
  assert.equal((failed?.result as { isError: boolean }).isError, true);
});

test("unknown tools and methods are JSON-RPC errors", async () => {
  const tool = await handle({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "eval" } }, echo);
  assert.equal((tool?.error as { code: number }).code, -32602);
  const method = await handle({ jsonrpc: "2.0", id: 6, method: "resources/list" });
  assert.equal((method?.error as { code: number }).code, -32601);
});

test("the bridge needs the token and allows only agent methods", async () => {
  const infoPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "map-bridge-")), "agent.json");
  const page = { evaluate: async (_fn: unknown, [method, args]: [string, unknown]) => ({ method, args }) };
  const bridge = await startAgentBridge(page as never, infoPath, () => {});
  const { port, token } = JSON.parse(fs.readFileSync(infoPath, "utf8"));
  const post = (body: unknown, auth = `Bearer ${token}`) =>
    fetch(`http://127.0.0.1:${port}/call`, { method: "POST", headers: { authorization: auth }, body: JSON.stringify(body) });

  try {
    assert.equal((await post({ method: "status" }, "Bearer wrong")).status, 401);
    assert.equal((await post({ method: "evaluate" })).status, 400);
    const ok = await post({ method: "query", args: { type: "burg" } });
    assert.deepEqual(await ok.json(), { method: "query", args: { type: "burg" } });
  } finally {
    bridge.close();
  }
  assert.equal(fs.existsSync(infoPath), false);
});

test("open accepts only existing .map files inside the allowed folders", async () => {
  const { checkMapPath } = await import("./map-agent-bridge.ts");
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "map-roots-"));
  const map = path.join(folder, "world.map");
  fs.writeFileSync(map, "");
  assert.equal(checkMapPath(map, [folder]), map);
  assert.throws(() => checkMapPath(path.join(folder, "notes.txt"), [folder]), /only \.map/);
  assert.throws(() => checkMapPath(map, [path.join(folder, "other")]), /only from/);
  assert.throws(() => checkMapPath(path.join(folder, "missing.map"), [folder]), /not found/);
});
