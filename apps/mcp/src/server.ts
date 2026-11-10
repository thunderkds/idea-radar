import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { resolve } from "node:path";
import { loadIdeas } from "@idea-radar/ideas";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { bearerMatches, checkToken } from "./auth.js";
import { createStore } from "./index-store.js";
import type { IdeaStore } from "./index-store.js";
import { registerTools } from "./tools.js";

export const MAX_BODY_BYTES = 1024 * 1024;

export interface ServerOptions {
  token: string;
  ideasDir: string;
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
async function handleMcp(store: IdeaStore, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJsonBody(req);
  const mcp = new McpServer({ name: "idea-radar", version: "0.1.0" });
  registerTools(mcp, store);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on("close", () => {
    void transport.close();
    void mcp.close();
  });
  await mcp.connect(transport);
  await transport.handleRequest(req, res, body);
}

export function createHttpServer(store: IdeaStore, token: string, log: (line: string) => void): Server {
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
        return sendJson(res, 200, { ok: true, ...store.stats });
      }
      if (path === "/mcp") {
        // Auth comes first: nothing below runs, and no body is read, for a caller without the token.
        if (!bearerMatches(req.headers.authorization, token))
          return sendJson(res, 401, { error: "unauthorized" }, { "www-authenticate": "Bearer" });
        if (req.method !== "POST") return sendJson(res, 405, { error: "method not allowed" }, { allow: "POST" });
        return await handleMcp(store, req, res);
      }
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

/** Load the ideas once, then listen. Rejects on a bad token or an unreadable ideas directory; skipped idea files are only logged. */
export async function startServer(
  options: ServerOptions,
): Promise<{ server: Server; port: number; stats: IdeaStore["stats"] }> {
  const log = options.log ?? ((line: string) => console.log(line));
  const tokenProblem = checkToken(options.token);
  if (tokenProblem !== undefined) throw new Error(tokenProblem);

  const dir = resolve(options.ideasDir);
  const { ideas, skipped } = loadIdeas(dir);
  const files = new Set(ideas.flatMap((i) => i.files)).size;
  const store = createStore(ideas, files, skipped.length);
  log(`loaded ${ideas.length} ideas from ${files} files, ${skipped.length} skipped (${dir})`);
  for (const s of skipped) log(`skipped ${s.file}: ${s.reason}`);

  const server = createHttpServer(store, options.token, log);
  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(options.port, () => resolveListen());
  });
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : options.port;
  return { server, port, stats: store.stats };
}
