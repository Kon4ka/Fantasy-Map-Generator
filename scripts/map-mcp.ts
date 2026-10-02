// MCP server (stdio) for AI work with the open map. Talks to the launcher's agent bridge. See docs/ai-mcp-guide.md
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import readline from "node:readline";
import { pathToFileURL } from "node:url";

type Json = Record<string, unknown>;
type CallAgent = (method: string, args: Json) => Promise<unknown>;

const root = path.resolve(import.meta.dirname, "..");
const INFO_PATH = path.join(process.env.LOCALAPPDATA ?? root, "FantasyMapGenerator", "agent.json");
const NOT_RUNNING = "The map editor bridge is not running. Ask the user to start the map launcher, then retry.";

const where = { type: "object", description: "{field: value | {like, gt, lt, in, ne}}; refs compare by id" };
const fields = { type: "array", items: { type: "string" } };

const TOOLS = [
  {
    name: "world_status",
    method: "status",
    description: "Open map: name, file, seed, entity counts, revision. Call first.",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "world_schema",
    method: "schema",
    description: "Without type: entity types. With type: its fields, refs and default columns.",
    inputSchema: { type: "object", properties: { type: { type: "string" } } }
  },
  {
    name: "world_query",
    method: "query",
    description: "List entities as a compact table {cols, rows, total, next}. Refs are [id, name].",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string" },
        where,
        fields,
        sort: { type: "string", description: "field or -field" },
        limit: { type: "number", description: "default 20, max 200" },
        cursor: { type: "number" }
      },
      required: ["type"]
    }
  },
  {
    name: "world_get",
    method: "get",
    description: "Full entities by id (max 50). type=lore gives world name, description, calendar.",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string" },
        ids: { type: "array", items: { type: ["number", "string"] } },
        fields,
        include: { ...fields, description: "position, context, cellCount, note (default: note)" }
      },
      required: ["type"]
    }
  },
  {
    name: "world_apply",
    method: "apply",
    description:
      "Edit the map with a batch of ops. dryRun (default) previews; then repeat with dryRun:false and the revision it returned.",
    inputSchema: {
      type: "object",
      properties: {
        ops: {
          type: "array",
          description:
            "set {type,id,field:value…} | assign {type:state|province|culture|religion,id,cells:{feature|of:{type,id}|circle:[x,y,r]|polygon|cells}} | merge {type:state,id,ids} | create {type:marker|addedLabel,x,y,name|text,markerType?,icon?,note?} | remove {type:marker|addedLabel,id} | layer {id,on} | lore {name?,description?,year?,era?}. Fields per type: world_schema",
          items: { type: "object" }
        },
        dryRun: { type: "boolean" },
        expectRevision: { type: "string" }
      },
      required: ["ops"]
    }
  },
  {
    name: "world_generate",
    method: "generate",
    description:
      "Regenerate a part (rivers, burgs, states, cultures…; wrong scope lists them) or scope:map for a new map. Preview first, like world_apply.",
    inputSchema: {
      type: "object",
      properties: {
        scope: { type: "string" },
        seed: { type: "string" },
        width: { type: "number" },
        height: { type: "number" },
        dryRun: { type: "boolean" },
        expectRevision: { type: "string" }
      },
      required: ["scope"]
    }
  },
  {
    name: "world_undo",
    method: "undo",
    description: "Revert the last applied batches (up to 5). Refuses if the map changed since, unless force.",
    inputSchema: { type: "object", properties: { steps: { type: "number" }, force: { type: "boolean" } } }
  }
];

/** Read the bridge address on every call: the launcher may have restarted with a new port and token */
export const callBridge: CallAgent = async (method, args) => {
  let info: { port: number; token: string };
  try {
    info = JSON.parse(fs.readFileSync(INFO_PATH, "utf8"));
  } catch {
    return { error: NOT_RUNNING };
  }
  try {
    const response = await fetch(`http://127.0.0.1:${info.port}/call`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${info.token}` },
      body: JSON.stringify({ method, args }),
      signal: AbortSignal.timeout(60_000)
    });
    return await response.json();
  } catch {
    return { error: NOT_RUNNING };
  }
};

const hasError = (value: unknown) => typeof value === "object" && value !== null && "error" in value;

/** One JSON-RPC message in, one reply out (undefined for notifications) */
export async function handle(message: Json, callAgent: CallAgent = callBridge): Promise<Json | undefined> {
  const { id, method, params = {} } = message as { id?: number | string; method: string; params?: Json };
  const reply = (result: unknown) => ({ jsonrpc: "2.0", id, result });
  if (id === undefined) return undefined; // notifications need no answer

  switch (method) {
    case "initialize":
      return reply({
        protocolVersion: (params.protocolVersion as string) ?? "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "fantasy-map", version: "0.1.0" },
        instructions:
          "Read and edit the open map. Start with world_status; answers are compact tables. Edits: preview with world_apply, then apply with the returned revision; world_undo reverts."
      });
    case "ping":
      return reply({});
    case "tools/list":
      return reply({ tools: TOOLS.map(({ method: _, ...tool }) => tool) });
    case "tools/call": {
      const tool = TOOLS.find(tool => tool.name === params.name);
      if (!tool) return { jsonrpc: "2.0", id, error: { code: -32602, message: `unknown tool ${params.name}` } };
      const result = await callAgent(tool.method, (params.arguments as Json) ?? {});
      return reply({ content: [{ type: "text", text: JSON.stringify(result) }], isError: hasError(result) });
    }
    default:
      return { jsonrpc: "2.0", id, error: { code: -32601, message: `method ${method} not found` } };
  }
}

function serve(): void {
  const input = readline.createInterface({ input: process.stdin });
  input.on("line", async line => {
    if (!line.trim()) return;
    let message: Json;
    try {
      message = JSON.parse(line);
    } catch {
      return void process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } })}\n`);
    }
    const answer = await handle(message);
    if (answer) process.stdout.write(`${JSON.stringify(answer)}\n`);
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) serve();
