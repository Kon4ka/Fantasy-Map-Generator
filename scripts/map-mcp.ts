// MCP server (stdio) for AI work with the open map. Talks to the launcher's agent bridge. See docs/ai-mcp-guide.md
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import readline from "node:readline";
import { pathToFileURL } from "node:url";

type Json = Record<string, unknown>;
type CallAgent = (method: string, args: Json) => Promise<unknown>;

const root = path.resolve(import.meta.dirname, "..");
const INFO_PATH = path.join(process.env.LOCALAPPDATA ?? root, "FantasyMapGenerator", "agent.json");
const LAUNCHER = path.join(root, "scripts", "map-launch.mjs");
const NOT_RUNNING =
  "No map is open. Use world_open with a .map path to open one in the background, or ask the user to start the map launcher.";

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
    description: "Full entities by id (max 50). type=lore: world name, description, calendar; type=style with path: styles.",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string" },
        ids: { type: "array", items: { type: ["number", "string"] } },
        path: { type: "string", description: "type=style only" },
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
            "set {type,id,field:value…} | assign {type:state|province|culture|religion,id,cells:{feature|of:{type,id}|circle:[x,y,r]|polygon|cells}} | merge {type:state,id,ids} | split {type:state,id,x,y,cells,name?,color?} | create {type:marker|addedLabel|burg|state,x,y,name|text,…} | remove {type:marker|addedLabel|burg,id} | layer {id,on} | style {path,value} | lore {name?,description?,year?,era?}. Fields: world_schema",
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
    name: "world_save",
    method: "save",
    description: "Save to the map's file; mode saveAs (or a map without a file) needs name.",
    inputSchema: {
      type: "object",
      properties: { mode: { type: "string", enum: ["save", "saveAs"] }, name: { type: "string" } }
    }
  },
  {
    name: "world_open",
    method: "open",
    description:
      "Open a .map from the worlds folder or Downloads. With no map open, starts a background session. Replacing an open map needs confirm:true.",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" }, confirm: { type: "boolean" } },
      required: ["path"]
    }
  },
  {
    name: "world_close",
    method: "shutdown",
    description: "Close a background session started by world_open.",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "world_view",
    method: "view",
    description: "PNG of the map, an entity (type, id) or rect [x,y,w,h]. Costly: use only when a picture is needed.",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string" },
        id: { type: ["number", "string"] },
        rect: { type: "array", items: { type: "number" } },
        size: { type: "number", description: "longest side in px, default 512, max 1024" }
      }
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
async function post(method: string, args: Json): Promise<unknown> {
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
      signal: AbortSignal.timeout(180_000)
    });
    return await response.json();
  } catch {
    return { error: NOT_RUNNING };
  }
}

const isError = (value: unknown): value is { error: string } =>
  typeof value === "object" && value !== null && "error" in value;

function downloadsFolder(): string {
  const command = "(New-Object -ComObject Shell.Application).NameSpace('shell:Downloads').Self.Path";
  const result =
    process.platform === "win32" ? spawnSync("powershell.exe", ["-NoProfile", "-Command", command], { encoding: "utf8" }) : null;
  return result?.stdout?.trim() || path.join(process.env.USERPROFILE ?? process.env.HOME ?? root, "Downloads");
}

/** Open in the running editor, or start a background one on that file */
async function openWorld(args: Json): Promise<unknown> {
  const open = await post("status", {});
  if (!isError(open) || !String(open.error).startsWith("No map is open")) {
    if (args.confirm !== true) {
      return {
        confirmNeeded: `this replaces the open map ${JSON.stringify((open as Json).map)}; unsaved changes are lost. Repeat with confirm: true`
      };
    }
    return post("open", { path: args.path });
  }

  const file = path.resolve(String(args.path ?? ""));
  const roots = [path.join(root, "worlds"), downloadsFolder()];
  const inside = roots.some(folder => !path.relative(folder, file).startsWith("..") && !path.isAbsolute(path.relative(folder, file)));
  if (!/\.(map|gz)$/i.test(file) || !inside || !fs.existsSync(file)) {
    return { error: `path must be an existing .map in: ${roots.join(", ")}` };
  }
  fs.rmSync(INFO_PATH, { force: true });
  spawn(process.execPath, [LAUNCHER, "--headless", "--map", file], { cwd: root, detached: true, stdio: "ignore", windowsHide: true }).unref();
  for (const end = Date.now() + 180_000; Date.now() < end; ) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    if (!fs.existsSync(INFO_PATH)) continue;
    const status = await post("status", {});
    if (!isError(status)) return { opened: file, background: true, ...(status as Json) };
  }
  return { error: "the background session did not start in 3 minutes; see %LOCALAPPDATA%/FantasyMapGenerator/launcher.log" };
}

export const callBridge: CallAgent = (method, args) => (method === "open" ? openWorld(args) : post(method, args));


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
          "Read and edit the open map. Start with world_status; answers are compact tables. Edits: preview with world_apply or world_generate, then apply with the returned revision; world_undo reverts; world_save writes the file."
      });
    case "ping":
      return reply({});
    case "tools/list":
      return reply({ tools: TOOLS.map(({ method: _, ...tool }) => tool) });
    case "tools/call": {
      const tool = TOOLS.find(tool => tool.name === params.name);
      if (!tool) return { jsonrpc: "2.0", id, error: { code: -32602, message: `unknown tool ${params.name}` } };
      const result = await callAgent(tool.method, (params.arguments as Json) ?? {});
      if (typeof (result as Json)?.image === "string") {
        const { image, ...rest } = result as Json;
        return reply({
          content: [
            { type: "image", data: image, mimeType: "image/png" },
            { type: "text", text: JSON.stringify(rest) }
          ]
        });
      }
      return reply({ content: [{ type: "text", text: JSON.stringify(result) }], isError: isError(result) });
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
