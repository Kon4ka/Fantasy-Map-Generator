// Local HTTP bridge from the MCP server to the map editor page. Loopback only, token protected
import { randomBytes, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import type { Page } from "playwright";

export const AGENT_METHODS = ["status", "schema", "query", "get", "apply", "undo", "generate", "save", "view"];
const MAX_BODY = 1_000_000;

export interface AgentBridge {
  port: number;
  close: () => void;
}

export interface BridgeOptions {
  roots: string[]; // folders open may read maps from
  headless?: boolean; // a background session the agent may shut down
  shutdown?: () => Promise<void>;
}

/** A .map / .gz inside one of the allowed folders, or an error message */
export function checkMapPath(file: unknown, roots: string[]): string {
  if (typeof file !== "string" || !file) throw new Error("path is required");
  const resolved = path.resolve(file);
  if (!/\.(map|gz)$/i.test(resolved)) throw new Error("only .map or .gz files can be opened");
  const inside = roots.some(root => {
    const relative = path.relative(path.resolve(root), resolved);
    return relative && !relative.startsWith("..") && !path.isAbsolute(relative);
  });
  if (!inside) throw new Error(`maps can be opened only from: ${roots.join(", ")}`);
  if (!fs.existsSync(resolved)) throw new Error(`file not found: ${resolved}`);
  return resolved;
}

/** Load a map file through the editor's own file input, as the user would */
async function openMap(page: Page, file: string): Promise<unknown> {
  const before = await page.evaluate(() => mapHistory.length);
  await page.locator("#mapToLoad").setInputFiles(file);
  await page.waitForFunction(count => mapHistory.length > count, before, { timeout: 120_000 });
  return page.evaluate(() => window.mapAgent.call("status", {}));
}

const sameToken = (expected: string, header: string | undefined) => {
  const actual = Buffer.from(header?.replace(/^Bearer /, "") ?? "");
  const wanted = Buffer.from(expected);
  return actual.length === wanted.length && timingSafeEqual(actual, wanted);
};

const readBody = (request: http.IncomingMessage) =>
  new Promise<string>((resolve, reject) => {
    let body = "";
    request.on("data", chunk => {
      body += chunk;
      if (body.length > MAX_BODY) reject(new Error("request too large"));
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });

/** Serve POST /call {method, args} and publish {port, token} in infoPath for the MCP server */
export async function startAgentBridge(
  page: Page,
  infoPath: string,
  log: (message: string) => void,
  bridgeOptions: BridgeOptions = { roots: [] }
): Promise<AgentBridge> {
  const token = randomBytes(24).toString("hex");
  const server = http.createServer(async (request, response) => {
    const reply = (status: number, data: unknown) => {
      response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(data));
    };
    try {
      if (request.method !== "POST" || request.url !== "/call") return reply(404, { error: "not found" });
      if (!sameToken(token, request.headers.authorization)) return reply(401, { error: "bad token" });
      const { method, args } = JSON.parse(await readBody(request));
      if (method === "open") return reply(200, await openMap(page, checkMapPath(args?.path, bridgeOptions.roots)));
      if (method === "shutdown") {
        if (!bridgeOptions.headless || !bridgeOptions.shutdown) return reply(400, { error: "only a background session can be shut down" });
        reply(200, { closed: true });
        return void bridgeOptions.shutdown();
      }
      if (!AGENT_METHODS.includes(method)) return reply(400, { error: `method "${method}" is not allowed` });
      const result = await page.evaluate(
        ([name, params]) => window.mapAgent?.call(name, params) ?? { error: "agent API is not loaded" },
        [method, args ?? {}] as const
      );
      reply(200, result);
    } catch (error) {
      reply(500, { error: error instanceof Error ? error.message : String(error) });
    }
  });

  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as { port: number };
  fs.mkdirSync(path.dirname(infoPath), { recursive: true });
  const info = { port, token, pid: process.pid, headless: Boolean(bridgeOptions.headless) };
  fs.writeFileSync(infoPath, JSON.stringify(info), { mode: 0o600 });
  log(`Мост ИИ-агента: 127.0.0.1:${port}`);

  return {
    port,
    close: () => {
      server.close();
      fs.rmSync(infoPath, { force: true });
    }
  };
}
