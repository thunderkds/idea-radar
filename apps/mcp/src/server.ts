import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { createPool, migrate } from "@idea-radar/db";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { checkTokens, roleFor } from "./auth.js";
import { createDashboard } from "./dashboard.js";
import type { Role } from "./auth.js";
import { createStore } from "./index-store.js";
import type { IdeaStore } from "./index-store.js";
import { registerTools } from "./tools.js";

export const MAX_BODY_BYTES = 1024 * 1024;
export const HEALTH_TIMEOUT_MS = 2000;

export interface ServerOptions {
  databaseUrl: string;
  /** Read token: the three read tools. */
  token: string;
  /** Write token: the read tools and `submit_ideas`. */
  writeToken: string;
  /** The dashboard login token. It never grants `/mcp` access. */
  dashboardToken: string;
  port: number;
  log?: (line: string) => void;
}

/** Thrown for a body that is too large or not JSON; carries the HTTP status. */
class BodyError extends Error {
  constructor(
    readonly status: 400 | 413,
    message: string,
  ) {
    super(message);
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(JSON.stringify(body));
}

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolveBody, reject) => {
    const declared = Number(req.headers["content-length"]);
    if (declared > MAX_BODY_BYTES) return reject(new BodyError(413, "body too large"));
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) return reject(new BodyError(413, "body too large"));
      chunks.push(chunk);
    });
    req.on("error", reject);
    req.on("end", () => {
      try {
        resolveBody(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new BodyError(400, "body must be JSON"));
      }
    });
  });
}

/** Stateless Streamable HTTP: a new MCP server and transport per request, closed when the response closes. */
async function handleMcp(
  store: IdeaStore,
  role: Role,
  log: (line: string) => void,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const body = await readJsonBody(req);
  const mcp = new McpServer({ name: "idea-radar", version: "0.1.0" });
  registerTools(mcp, store, role, log);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on("close", () => {
    void transport.close();
    void mcp.close();
  });
  await mcp.connect(transport);
  await transport.handleRequest(req, res, body);
}

/** True when the database answers within the timeout. Says nothing about why it does not: the body and the log stay empty of detail. */
async function databaseAnswers(store: IdeaStore): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      store.ping(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), HEALTH_TIMEOUT_MS);
      }),
    ]);
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export function createHttpServer(
  store: IdeaStore,
  tokens: { read: string; write: string; dashboard: string },
  log: (line: string) => void,
): Server {
  const dashboard = createDashboard(store, tokens.dashboard, log);
  return createServer((req, res) => {
    const run = async () => {
      // Parse inside run(): a request target that is not a valid URL must become a 400, never an uncaught throw.
      let path: string;
      try {
        path = new URL(req.url ?? "/", "http://localhost").pathname;
      } catch {
        return sendJson(res, 400, { error: "bad request target" });
      }
      if (path === "/health") {
        if (req.method !== "GET") return sendJson(res, 405, { error: "method not allowed" }, { allow: "GET" });
        return (await databaseAnswers(store)) ? sendJson(res, 200, { ok: true }) : sendJson(res, 503, { ok: false });
      }
      if (path === "/mcp") {
        // The role is resolved once, before anything else: nothing below runs, and no body is read, for a caller without a token.
        const role = roleFor(req.headers.authorization, tokens);
        if (role === undefined) return sendJson(res, 401, { error: "unauthorized" }, { "www-authenticate": "Bearer" });
        if (req.method !== "POST") return sendJson(res, 405, { error: "method not allowed" }, { allow: "POST" });
        return await handleMcp(store, role, log, req, res);
      }
      if (await dashboard(req, res, path)) return;
      return sendJson(res, 404, { error: "not found" });
    };
    run().catch((err: unknown) => {
      if (err instanceof BodyError) {
        // Close the connection so the rest of an oversize body is not read.
        if (!res.headersSent) sendJson(res, err.status, { error: err.message }, { connection: "close" });
        return;
      }
      log(`request error: ${err instanceof Error ? err.message : String(err)}`);
      if (!res.headersSent) sendJson(res, 500, { error: "internal error" });
    });
  });
}

/** Check the config, connect, run the migrations, then listen. Rejects (and listens on nothing) on a bad config or a database error. */
export async function startServer(options: ServerOptions): Promise<{ server: Server; port: number }> {
  const log = options.log ?? ((line: string) => console.log(line));
  const problem = checkTokens({
    MCP_TOKEN: options.token,
    MCP_WRITE_TOKEN: options.writeToken,
    DASHBOARD_TOKEN: options.dashboardToken,
  });
  if (problem !== undefined) throw new Error(problem);
  if (options.databaseUrl === "") throw new Error("DATABASE_URL is not set; refusing to start");

  const pool = createPool(options.databaseUrl);
  try {
    const applied = await migrate(pool).catch((err: { message?: string; code?: string }) => {
      // An AggregateError (localhost over IPv4 and IPv6) has an empty message, hence the code.
      throw new Error(`database setup failed: ${err.message || err.code || "no detail"}`);
    });
    log(`migrations applied: ${applied.length}`);
    const server = createHttpServer(
      createStore(pool),
      { read: options.token, write: options.writeToken, dashboard: options.dashboardToken },
      log,
    );
    server.on("close", () => void pool.end());
    await new Promise<void>((resolveListen, reject) => {
      server.once("error", reject);
      server.listen(options.port, () => resolveListen());
    });
    const address = server.address();
    return { server, port: typeof address === "object" && address !== null ? address.port : options.port };
  } catch (err) {
    await pool.end().catch(() => {});
    throw err;
  }
}
