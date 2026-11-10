import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { Server } from "node:http";
import { connect as rawConnect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { startServer } from "./server.js";

const TOKEN = "a-test-token-that-is-long-enough-1234";

function ideaFile(date: string, ids: string[], tags: string[] = ["ai"]) {
  return JSON.stringify({
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
  });
}

const dirs: string[] = [];
const servers: Server[] = [];
after(() => {
  for (const s of servers) s.close();
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

async function boot(files: Record<string, string>, token = TOKEN) {
  const dir = mkdtempSync(join(tmpdir(), "mcp-ideas-"));
  dirs.push(dir);
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
  const lines: string[] = [];
  const { server, port } = await startServer({ token, ideasDir: dir, port: 0, log: (l) => lines.push(l) });
  servers.push(server);
  return { url: `http://127.0.0.1:${port}`, lines };
}

const MCP_HEADERS = { "content-type": "application/json", accept: "application/json, text/event-stream" };
const INIT = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "t", version: "0" } },
};

async function connect(url: string) {
  const client = new Client({ name: "t", version: "0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${url}/mcp`), {
      requestInit: { headers: { authorization: `Bearer ${TOKEN}` } },
    }),
  );
  return client;
}

const text = (r: unknown) => (r as { content: { text: string }[] }).content[0]!.text;

describe("with fixture ideas", () => {
  let url: string;
  let lines: string[];
  before(async () => {
    ({ url, lines } = await boot({
      "2026-11-01.json": ideaFile("2026-11-01", ["old-one", "old-two"], ["ai"]),
      "2026-11-10.json": ideaFile("2026-11-10", ["new-one"], ["cli"]),
      "broken.json": "{ not json",
    }));
  });

  test("lists exactly the three tools, all read-only", async () => {
    const client = await connect(url);
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((t) => t.name).sort(), ["get_idea", "list_ideas", "search_ideas"]);
    assert.ok(tools.every((t) => t.annotations?.readOnlyHint === true));
    await client.close();
  });

  test("list_ideas { tag, limit: 500 } is clamped, tagged and newest first", async () => {
    const client = await connect(url);
    const body = JSON.parse(text(await client.callTool({ name: "list_ideas", arguments: { tag: "ai", limit: 500 } })));
    assert.deepEqual(
      body.ideas.map((i: { id: string }) => i.id),
      ["old-one", "old-two"],
    );
    assert.ok(body.ideas.length <= 100 && body.ideas.every((i: { tags: string[] }) => i.tags.includes("ai")));
    await client.close();
  });

  test("search_ideas and get_idea work, and a bad input is a tool error", async () => {
    const client = await connect(url);
    assert.equal(
      JSON.parse(text(await client.callTool({ name: "search_ideas", arguments: { query: "new-one" } }))).count,
      1,
    );
    const full = JSON.parse(text(await client.callTool({ name: "get_idea", arguments: { id: "new-one" } })));
    assert.equal(full.signals.length, 1);
    const missing = await client.callTool({ name: "get_idea", arguments: { id: "nope" } });
    assert.equal(missing.isError, true);
    const badDate = await client.callTool({ name: "list_ideas", arguments: { since: "tomorrow" } });
    assert.equal(badDate.isError, true);
    await client.close();
  });

  test("boot logs counts and the skipped file; /health reports skipped: 1 and nothing else", async () => {
    const res = await fetch(`${url}/health`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true, ideas: 3, files: 2, skipped: 1 });
    assert.ok(
      lines.some((l) => /3 ideas/.test(l) && /2 files/.test(l) && /1 skipped/.test(l)),
      lines.join("\n"),
    );
    assert.ok(
      lines.some((l) => l.includes("broken.json")),
      lines.join("\n"),
    );
    assert.ok(lines.every((l) => !l.includes(TOKEN)));
  });

  test("no / wrong token on /mcp is 401 with no idea data, for every method", async () => {
    const attempts: Record<string, string>[] = [{}, { authorization: "Bearer wrong" }, { authorization: TOKEN }];
    for (const headers of attempts) {
      for (const method of ["POST", "GET", "DELETE"]) {
        const res = await fetch(`${url}/mcp`, {
          method,
          headers: { ...MCP_HEADERS, ...headers },
          body: method === "POST" ? JSON.stringify(INIT) : undefined,
        });
        assert.equal(res.status, 401, `${method} ${JSON.stringify(headers)}`);
        const body = await res.text();
        assert.doesNotMatch(body, /Title|new-one|old-one/);
      }
    }
  });

  test("GET and DELETE /mcp with a valid token are 405; unknown paths are 404", async () => {
    for (const method of ["GET", "DELETE"]) {
      const res = await fetch(`${url}/mcp`, { method, headers: { authorization: `Bearer ${TOKEN}` } });
      assert.equal(res.status, 405);
      assert.equal(res.headers.get("allow"), "POST");
    }
    assert.equal((await fetch(`${url}/nope`)).status, 404);
    assert.equal((await fetch(`${url}/health`, { method: "POST" })).status, 405);
  });

  test("a body over 1 MB is 413; invalid JSON is 400", async () => {
    const headers = { ...MCP_HEADERS, authorization: `Bearer ${TOKEN}` };
    const big = await fetch(`${url}/mcp`, {
      method: "POST",
      headers,
      body: JSON.stringify({ pad: "x".repeat(1024 * 1024 + 10) }),
    });
    assert.equal(big.status, 413);
    const bad = await fetch(`${url}/mcp`, { method: "POST", headers, body: "{nope" });
    assert.equal(bad.status, 400);
  });

  test("an unauthenticated oversize body is rejected as 401 first", async () => {
    const res = await fetch(`${url}/mcp`, { method: "POST", headers: MCP_HEADERS, body: "x".repeat(1024 * 1024 + 10) });
    assert.equal(res.status, 401);
  });
});

test("a non-existent ideas directory loads nothing and /health is still ok", async () => {
  const { server, port } = await startServer({
    token: TOKEN,
    ideasDir: join(tmpdir(), "mcp-no-such-dir-xyz"),
    port: 0,
    log: () => {},
  });
  servers.push(server);
  assert.deepEqual(await (await fetch(`http://127.0.0.1:${port}/health`)).json(), {
    ok: true,
    ideas: 0,
    files: 0,
    skipped: 0,
  });
  const client = await connect(`http://127.0.0.1:${port}`);
  assert.equal(JSON.parse(text(await client.callTool({ name: "list_ideas", arguments: {} }))).count, 0);
  await client.close();
});

test("startServer refuses a bad token and a directory error", async () => {
  await assert.rejects(startServer({ token: "short", ideasDir: ".", port: 0, log: () => {} }), /MCP_TOKEN/);
  const dir = mkdtempSync(join(tmpdir(), "mcp-file-"));
  dirs.push(dir);
  const notADir = join(dir, "file.txt");
  writeFileSync(notADir, "x");
  await assert.rejects(startServer({ token: TOKEN, ideasDir: notADir, port: 0, log: () => {} }));
});

test("a request target that is not a valid URL gets 400 and the server keeps serving", async () => {
  const { url } = await boot({});
  const port = Number(new URL(url).port);
  const reply = await new Promise<string>((resolveReply, reject) => {
    const socket = rawConnect(port, "127.0.0.1", () => socket.write("GET //[ HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n"));
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
