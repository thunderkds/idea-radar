import assert from "node:assert/strict";
import type { Server } from "node:http";
import { connect as rawConnect, createServer as createNetServer } from "node:net";
import { after, before, describe, test } from "node:test";
import { createPool } from "@idea-radar/db";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createStore } from "./index-store.js";
import type { IdeaStore } from "./index-store.js";
import { HEALTH_TIMEOUT_MS, createHttpServer, startServer } from "./server.js";

const READ = "r-test-token-that-is-long-enough-1234";
const WRITE = "w-test-token-that-is-long-enough-1234";
const DASH = "d-test-token-that-is-long-enough-1234";
const CONFIG = { token: READ, writeToken: WRITE, dashboardToken: DASH, port: 0, log: () => {} };

const servers: Server[] = [];
after(() => {
  for (const s of servers) s.close();
});

const MCP_HEADERS = { "content-type": "application/json", accept: "application/json, text/event-stream" };
const INIT = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "t", version: "0" } },
};

async function listen(server: Server): Promise<string> {
  servers.push(server);
  await new Promise<void>((resolveListen) => server.listen(0, () => resolveListen()));
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}

async function connect(url: string, token: string) {
  const client = new Client({ name: "t", version: "0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${url}/mcp`), {
      requestInit: { headers: { authorization: `Bearer ${token}` } },
    }),
  );
  return client;
}

/** A database URL whose port was just freed, so a connection is refused at once (port 1 may drop packets instead). */
async function closedPortUrl(): Promise<string> {
  const probe = createNetServer();
  await new Promise<void>((resolveListen) => probe.listen(0, "127.0.0.1", () => resolveListen()));
  const { port } = probe.address() as { port: number };
  await new Promise<void>((resolveClose) => probe.close(() => resolveClose()));
  return `postgres://nobody:hunter2-secret@127.0.0.1:${port}/none`;
}

const text = (r: unknown) => (r as { content: { text: string }[] }).content[0]!.text;

function ideaFile(date: string, ids: string[], tags: string[] = ["ai"]) {
  return {
    schema_version: 1,
    date,
    routine: "test",
    ideas: ids.map((id) => ({
      id,
      title: `Title ${id}`,
      summary: `Summary ${id}`,
      tags,
      signals: [{ kind: "repo", url: "https://github.com/o/r", note: "n" }],
      related_repos: ["o/r"],
    })),
  };
}

/** A store that never touches a database: it counts submit calls and returns canned rows. */
function stubStore(over: Partial<IdeaStore> = {}) {
  const submitted: unknown[] = [];
  const store: IdeaStore = {
    list: () => Promise.resolve([]),
    search: () => Promise.resolve([]),
    get: () => Promise.resolve(undefined),
    submit: (p) => {
      submitted.push(p);
      return Promise.resolve({ ok: true as const, saved: 1, date: "2026-11-10" });
    },
    ping: () => Promise.resolve(),
    ...over,
  };
  return { store, submitted };
}

describe("HTTP surface (no database needed)", () => {
  let url: string;
  const { store, submitted } = stubStore();
  before(async () => {
    url = await listen(createHttpServer(store, { read: READ, write: WRITE }, () => {}));
  });

  test("a read token lists exactly the three read tools, all read-only", async () => {
    const client = await connect(url, READ);
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((t) => t.name).sort(), ["get_idea", "list_ideas", "search_ideas"]);
    assert.ok(tools.every((t) => t.annotations?.readOnlyHint === true));
    await client.close();
  });

  test("a write token lists the three read tools and submit_ideas, which is not read-only and says routine only", async () => {
    const client = await connect(url, WRITE);
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((t) => t.name).sort(), ["get_idea", "list_ideas", "search_ideas", "submit_ideas"]);
    const submit = tools.find((t) => t.name === "submit_ideas")!;
    assert.equal(submit.annotations?.readOnlyHint, false);
    assert.match(submit.description ?? "", /routine only/i);
    await client.close();
  });

  test("a read token calling submit_ideas is refused and the store is never asked to save", async () => {
    const client = await connect(url, READ);
    const outcome = await client
      .callTool({ name: "submit_ideas", arguments: ideaFile("2026-11-10", ["x"]) })
      .then((r) => ({ failed: r.isError === true }))
      .catch(() => ({ failed: true }));
    assert.equal(outcome.failed, true);
    assert.equal(submitted.length, 0);
    await client.close();
  });

  test("no / wrong token on /mcp is 401 with no data, for every method; the dashboard token is not an MCP token", async () => {
    const attempts: Record<string, string>[] = [
      {},
      { authorization: "Bearer wrong" },
      { authorization: READ },
      { authorization: `Bearer ${DASH}` },
    ];
    for (const headers of attempts) {
      for (const method of ["POST", "GET", "DELETE"]) {
        const res = await fetch(`${url}/mcp`, {
          method,
          headers: { ...MCP_HEADERS, ...headers },
          body: method === "POST" ? JSON.stringify(INIT) : undefined,
        });
        assert.equal(res.status, 401, `${method} ${JSON.stringify(headers)}`);
        assert.deepEqual(await res.json(), { error: "unauthorized" });
      }
    }
  });

  test("GET and DELETE /mcp with a valid token are 405; unknown paths are 404", async () => {
    for (const token of [READ, WRITE]) {
      for (const method of ["GET", "DELETE"]) {
        const res = await fetch(`${url}/mcp`, { method, headers: { authorization: `Bearer ${token}` } });
        assert.equal(res.status, 405);
        assert.equal(res.headers.get("allow"), "POST");
      }
    }
    assert.equal((await fetch(`${url}/nope`)).status, 404);
    assert.equal((await fetch(`${url}/health`, { method: "POST" })).status, 405);
  });

  test("a body over 1 MB is 413 (read and write token); invalid JSON is 400", async () => {
    for (const token of [READ, WRITE]) {
      const headers = { ...MCP_HEADERS, authorization: `Bearer ${token}` };
      const big = await fetch(`${url}/mcp`, {
        method: "POST",
        headers,
        body: JSON.stringify({ pad: "x".repeat(1024 * 1024 + 10) }),
      });
      assert.equal(big.status, 413);
      const bad = await fetch(`${url}/mcp`, { method: "POST", headers, body: "{nope" });
      assert.equal(bad.status, 400);
    }
    assert.equal(submitted.length, 0);
  });

  test("an unauthenticated oversize body is rejected as 401 first", async () => {
    const res = await fetch(`${url}/mcp`, { method: "POST", headers: MCP_HEADERS, body: "x".repeat(1024 * 1024 + 10) });
    assert.equal(res.status, 401);
  });

  test("/health answers exactly { ok: true } without a token when the probe succeeds", async () => {
    const res = await fetch(`${url}/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(Object.keys(body), ["ok"]);
    assert.deepEqual(body, { ok: true });
  });

  test("a request target that is not a valid URL gets 400 and the server keeps serving", async () => {
    const port = Number(new URL(url).port);
    const reply = await new Promise<string>((resolveReply, reject) => {
      const socket = rawConnect(port, "127.0.0.1", () =>
        socket.write("GET //[ HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n"),
      );
      let data = "";
      socket.on("data", (chunk) => (data += chunk.toString()));
      socket.on("end", () => resolveReply(data));
      socket.on("error", reject);
      socket.setTimeout(3000, () => {
        socket.destroy();
        resolveReply(data);
      });
    });
    assert.match(reply, /^HTTP\/1\.1 400/);
    assert.equal((await fetch(`${url}/health`)).status, 200);
  });
});

describe("/health when the database does not answer", () => {
  test("an unreachable database is 503 with exactly { ok: false } and nothing logged", async () => {
    const lines: string[] = [];
    const pool = createPool(await closedPortUrl());
    const url = await listen(createHttpServer(createStore(pool), { read: READ, write: WRITE }, (l) => lines.push(l)));
    const res = await fetch(`${url}/health`);
    assert.equal(res.status, 503);
    const raw = await res.text();
    assert.equal(raw, '{"ok":false}');
    assert.deepEqual(lines, []);
    await pool.end();
  });

  test("a probe that hangs times out instead of hanging", async () => {
    const { store } = stubStore({ ping: () => new Promise<void>(() => {}) });
    const url = await listen(createHttpServer(store, { read: READ, write: WRITE }, () => {}));
    const started = Date.now();
    const res = await fetch(`${url}/health`);
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { ok: false });
    const ms = Date.now() - started;
    assert.ok(ms >= HEALTH_TIMEOUT_MS - 100 && ms < HEALTH_TIMEOUT_MS + 1500, `took ${ms} ms`);
  });
});

test("startServer refuses a bad config before it touches a database, and never echoes a token", async () => {
  const bad = [
    { ...CONFIG, databaseUrl: "postgres://x", token: "short-secret" },
    { ...CONFIG, databaseUrl: "postgres://x", writeToken: "" },
    { ...CONFIG, databaseUrl: "postgres://x", dashboardToken: READ },
    { ...CONFIG, databaseUrl: "postgres://x", writeToken: READ },
    { ...CONFIG, databaseUrl: "" },
  ];
  for (const options of bad) {
    await assert.rejects(startServer(options), (err: Error) => {
      assert.doesNotMatch(err.message, /short-secret|test-token-that-is-long/);
      return /MCP_TOKEN|MCP_WRITE_TOKEN|DASHBOARD_TOKEN|DATABASE_URL/.test(err.message);
    });
  }
});

test("startServer fails with a message and no secret when the database is unreachable (migrate cannot run)", async () => {
  await assert.rejects(
    startServer({ ...CONFIG, databaseUrl: await closedPortUrl() }),
    (err: Error) => /database setup failed/.test(err.message) && !/hunter2-secret/.test(err.message),
  );
});

// ---- Needs a Postgres. The test database is only ever a local one: tables are emptied (DELETE), never the real data. ----

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl) {
  const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);
  const parsed = new URL(databaseUrl);
  if (!LOOPBACK.has(parsed.hostname) || parsed.searchParams.has("host") || parsed.searchParams.has("hostaddr"))
    throw new Error(
      `TEST_DATABASE_URL host "${parsed.hostname}" is not loopback (localhost, 127.0.0.1, [::1]); refusing to run`,
    );
}
const skip = databaseUrl
  ? false
  : "TEST_DATABASE_URL is not set: run `pnpm --filter @idea-radar/db test:server` and set TEST_DATABASE_URL=postgres://postgres:pg@localhost:55432/postgres";

describe("with a Postgres (needs TEST_DATABASE_URL)", { skip }, () => {
  let url: string;
  let lines: string[];
  let pool: ReturnType<typeof createPool>;

  const count = async (table: "ideas" | "runs", where = "true") =>
    Number((await pool.query(`SELECT count(*) AS n FROM ${table} WHERE ${where}`)).rows[0].n);
  const submit = async (client: Client, args: unknown) =>
    client.callTool({ name: "submit_ideas", arguments: args as Record<string, unknown> });

  before(async () => {
    lines = [];
    const started = await startServer({ ...CONFIG, databaseUrl: databaseUrl!, log: (l) => lines.push(l) });
    servers.push(started.server);
    url = `http://127.0.0.1:${started.port}`;
    pool = createPool(databaseUrl!);
  });
  after(async () => {
    await pool.end();
  });

  const reset = async () => {
    await pool.query("DELETE FROM ideas");
    await pool.query("DELETE FROM runs");
  };

  test("boot ran the migrations and never logged a token; /health is { ok: true }", async () => {
    assert.ok(
      lines.some((l) => /migrations applied: \d+/.test(l)),
      lines.join("\n"),
    );
    assert.ok(lines.every((l) => ![READ, WRITE, DASH, databaseUrl!].some((s) => l.includes(s))));
    const res = await fetch(`${url}/health`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
  });

  test("write token + valid file: { saved: 1 }, and get_idea returns it at once (also to a read token)", async () => {
    await reset();
    const writer = await connect(url, WRITE);
    const r = await submit(writer, ideaFile("2026-11-10", ["fresh-idea"]));
    assert.equal(r.isError, undefined);
    assert.deepEqual(JSON.parse(text(r)), { saved: 1, date: "2026-11-10" });
    assert.equal(await count("runs", "status = 'ok'"), 1);
    const reader = await connect(url, READ);
    const full = JSON.parse(text(await reader.callTool({ name: "get_idea", arguments: { id: "fresh-idea" } })));
    assert.equal(full.title, "Title fresh-idea");
    assert.equal(full.signals.length, 1);
    assert.equal(full.first_seen, "2026-11-10");
    await writer.close();
    await reader.close();
  });

  test("read token calling submit_ideas is refused and the idea count does not change", async () => {
    await reset();
    const reader = await connect(url, READ);
    const outcome = await submit(reader, ideaFile("2026-11-10", ["sneaky"]))
      .then((r) => ({ failed: r.isError === true }))
      .catch(() => ({ failed: true }));
    assert.equal(outcome.failed, true);
    assert.equal(await count("ideas"), 0);
    assert.equal(await count("runs"), 0);
    await reader.close();
  });

  test("a bad url is a tool error naming the field; a rejected run is logged and no idea rows are written", async () => {
    await reset();
    const file = ideaFile("2026-11-10", ["a", "b"]);
    file.ideas[0]!.signals[0]!.url = "not a url";
    const writer = await connect(url, WRITE);
    const r = await submit(writer, file);
    assert.equal(r.isError, true);
    assert.match(text(r), /\/ideas\/0\/signals\/0\/url/);
    assert.equal(await count("ideas"), 0);
    const runs = (await pool.query("SELECT status, idea_count, error FROM runs")).rows;
    assert.equal(runs.length, 1);
    assert.equal(runs[0].status, "rejected");
    assert.equal(runs[0].idea_count, 0);
    assert.match(runs[0].error, /\/ideas\/0\/signals\/0\/url/);
    assert.doesNotMatch(runs[0].error, /Summary a/);
    await writer.close();
  });

  test("a file with an unknown key, a wrong schema_version or a duplicate id is rejected with every error listed", async () => {
    await reset();
    const writer = await connect(url, WRITE);
    const dup = ideaFile("2026-11-10", ["same", "same"]);
    const r1 = await submit(writer, { ...dup, extra: 1, schema_version: 2 });
    assert.equal(r1.isError, true);
    assert.match(text(r1), /extra/);
    assert.match(text(r1), /schema_version/);
    const r2 = await submit(writer, dup);
    assert.equal(r2.isError, true);
    assert.match(text(r2), /duplicates/);
    const r3 = await submit(writer, {});
    assert.equal(r3.isError, true);
    assert.equal(await count("ideas"), 0);
    assert.equal(await count("runs", "status = 'rejected'"), 3);
    await writer.close();
  });

  test("a NUL in any string is a tool error, nothing is written, and a rejected run is logged without the payload", async () => {
    await reset();
    const writer = await connect(url, WRITE);
    const file = ideaFile("2026-11-10", ["nul-idea"]);
    file.ideas[0]!.summary = "has a \u0000 inside";
    const r = await submit(writer, file);
    assert.equal(r.isError, true);
    assert.equal(await count("ideas"), 0);
    const runs = (await pool.query("SELECT status, error FROM runs")).rows;
    assert.equal(runs.length, 1);
    assert.equal(runs[0].status, "rejected");
    assert.ok(runs[0].error.length <= 400, `error was ${runs[0].error.length} chars`);
    assert.doesNotMatch(runs[0].error, /has a/);
    await writer.close();
  });

  test("a huge error list is capped in the answer and in the run log", async () => {
    await reset();
    const writer = await connect(url, WRITE);
    const file = ideaFile("2026-11-10", ["a"]);
    const ideas = Array.from({ length: 300 }, () => ({ nope: true }));
    const r = await submit(writer, { ...file, ideas });
    assert.equal(r.isError, true);
    assert.ok(text(r).split("\n").length <= 53, `${text(r).split("\n").length} lines`);
    assert.ok(text(r).includes("more errors"));
    const run = (await pool.query("SELECT error FROM runs")).rows[0];
    assert.ok(run.error.length <= 2000);
    await writer.close();
  });

  test("the same submission twice saves once per id; a newer date updates the idea", async () => {
    await reset();
    const writer = await connect(url, WRITE);
    await submit(writer, ideaFile("2026-11-09", ["a"], ["old"]));
    await submit(writer, ideaFile("2026-11-09", ["a"], ["old"]));
    const newer = ideaFile("2026-11-10", ["a"], ["new"]);
    newer.ideas[0]!.title = "Renamed";
    await submit(writer, newer);
    assert.equal(await count("ideas"), 1);
    const got = JSON.parse(text(await writer.callTool({ name: "get_idea", arguments: { id: "a" } })));
    assert.equal(got.title, "Renamed");
    assert.equal(got.first_seen, "2026-11-09");
    assert.equal(got.last_seen, "2026-11-10");
    await writer.close();
  });

  test("list_ideas and search_ideas read from Postgres: newest first, tag, dates, limit, ranking, plain-text query", async () => {
    await reset();
    const writer = await connect(url, WRITE);
    await submit(writer, ideaFile("2026-11-01", ["old-one", "old-two"], ["ai"]));
    await submit(writer, ideaFile("2026-11-10", ["new-one"], ["cli"]));
    const call = async (name: string, args: Record<string, unknown>) => {
      const r = await writer.callTool({ name, arguments: args });
      return { isError: r.isError, body: r.isError ? text(r) : JSON.parse(text(r)) };
    };
    const ids = (b: { ideas: { id: string }[] }) => b.ideas.map((i) => i.id);

    const all = await call("list_ideas", {});
    assert.deepEqual(ids(all.body), ["new-one", "old-one", "old-two"]);
    assert.deepEqual(Object.keys(all.body.ideas[0]).sort(), [
      "first_seen",
      "id",
      "last_seen",
      "summary",
      "tags",
      "title",
    ]);
    assert.deepEqual(ids((await call("list_ideas", { tag: "AI", limit: 500 })).body), ["old-one", "old-two"]);
    assert.deepEqual(ids((await call("list_ideas", { since: "2026-11-05" })).body), ["new-one"]);
    assert.deepEqual(ids((await call("list_ideas", { until: "2026-11-05", limit: 1 })).body), ["old-one"]);

    assert.equal((await call("list_ideas", { since: "tomorrow" })).isError, true);
    assert.equal((await call("list_ideas", { until: "2026-02-30" })).isError, true);

    assert.equal((await call("search_ideas", { query: "NEW-one" })).body.count, 1);
    assert.equal((await call("search_ideas", { query: "%" })).body.count, 0);
    assert.equal((await call("search_ideas", { query: "ne\u0000w-one" })).body.count, 1);
    assert.equal((await call("search_ideas", { query: "\u0000" })).isError, true);
    assert.equal((await call("get_idea", { id: "nope" })).isError, true);
    assert.equal((await call("get_idea", { id: "ne\u0000w-one" })).isError, undefined);
    assert.equal((await call("list_ideas", { tag: "a\u0000i" })).body.count, 2);
    await writer.close();
  });
});
