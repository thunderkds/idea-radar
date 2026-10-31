import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, it } from "node:test";
import { adminToken, apiBase, getRepo, getTier, postRescrape } from "./api";

const original = process.env.API_URL;
let server: Server | undefined;

afterEach(async () => {
  if (original === undefined) delete process.env.API_URL;
  else process.env.API_URL = original;
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  server = undefined;
});

async function serve(handler: (url: string) => [number, unknown]): Promise<string[]> {
  const seen: string[] = [];
  server = createServer((req, res) => {
    seen.push(req.url ?? "");
    const [status, body] = handler(req.url ?? "");
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  });
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  process.env.API_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return seen;
}

describe("apiBase", () => {
  it("defaults to localhost:4000 and strips a trailing slash from API_URL", () => {
    delete process.env.API_URL;
    assert.equal(apiBase(), "http://localhost:4000");
    process.env.API_URL = "http://api.test:9/";
    assert.equal(apiBase(), "http://api.test:9");
  });
});

describe("getTier", () => {
  it("sends the filters and window to the API and returns the body", async () => {
    const seen = await serve(() => [200, { tier: "lowkey", date: "2026-10-31", items: [], nextCursor: null }]);
    const res = await getTier("lowkey", { language: "Go", window: "30d" });
    assert.equal(res.ok, true);
    assert.equal(seen[0], "/tiers/lowkey?language=Go&window=30d");
  });
  it("returns the API's message for a 400", async () => {
    await serve(() => [400, { error: "window: must be 7d or 30d" }]);
    const res = await getTier("lowkey", { window: "90d" });
    assert.deepEqual(res, { ok: false, kind: "bad_request", message: "window: must be 7d or 30d" });
  });
  it("reports an unreachable API instead of throwing", async () => {
    process.env.API_URL = "http://127.0.0.1:1";
    const res = await getTier("lowkey", {});
    assert.equal(res.ok, false);
    assert.equal(!res.ok && res.kind, "unreachable");
  });
  it("reports a 500 as an error with a status message", async () => {
    await serve(() => [500, "boom"]);
    const res = await getTier("lowkey", {});
    assert.deepEqual(res, { ok: false, kind: "error", message: "API answered 500" });
  });
});

describe("getRepo", () => {
  it("maps 404 to not_found", async () => {
    await serve(() => [404, { error: "repo not found" }]);
    const res = await getRepo("42");
    assert.equal(!res.ok && res.kind, "not_found");
  });
});

describe("adminToken", () => {
  const saved = process.env.ADMIN_TOKEN;
  afterEach(() => {
    if (saved === undefined) delete process.env.ADMIN_TOKEN;
    else process.env.ADMIN_TOKEN = saved;
  });
  it("is the trimmed ADMIN_TOKEN, and undefined when it is unset or blank", () => {
    delete process.env.ADMIN_TOKEN;
    assert.equal(adminToken(), undefined);
    process.env.ADMIN_TOKEN = "   ";
    assert.equal(adminToken(), undefined);
    process.env.ADMIN_TOKEN = " s3cret ";
    assert.equal(adminToken(), "s3cret");
  });
});

describe("postRescrape", () => {
  let seen: { method?: string; url?: string; auth?: string; type?: string; body: string }[] = [];
  async function answerWith(status: number, body: unknown): Promise<void> {
    seen = [];
    server = createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        seen.push({ method: req.method, url: req.url, auth: req.headers.authorization, type: req.headers["content-type"], body: raw });
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(body));
      });
    });
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    process.env.API_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }

  it("POSTs the target as JSON with the bearer token and returns { queued }", async () => {
    await answerWith(202, { queued: 2 });
    const res = await postRescrape({ groupKey: "cli|go" }, "tok-123");
    assert.deepEqual(res, { ok: true, data: { queued: 2 } });
    assert.deepEqual(seen, [{ method: "POST", url: "/rescrape", auth: "Bearer tok-123", type: "application/json", body: JSON.stringify({ groupKey: "cli|go" }) }]);
    await postRescrape({ repoId: 7 }, "tok-123");
    assert.equal(seen[1]!.body, JSON.stringify({ repoId: 7 }));
  });
  it("returns the API's message for 400, 401 and 404, and a status message for a body it cannot read", async () => {
    await answerWith(401, { error: "unauthorized" });
    assert.deepEqual(await postRescrape({ repoId: 1 }, "bad"), { ok: false, kind: "error", message: "unauthorized" });
    server!.close();
    await answerWith(404, { error: "repo or group is not tracked" });
    assert.deepEqual(await postRescrape({ repoId: 1 }, "t"), { ok: false, kind: "not_found", message: "repo or group is not tracked" });
    server!.close();
    await answerWith(400, { error: "repoId: must be a positive integer" });
    assert.deepEqual(await postRescrape({ repoId: 1 }, "t"), { ok: false, kind: "bad_request", message: "repoId: must be a positive integer" });
  });
  it("reports an unreachable API and never puts the token in the message", async () => {
    process.env.API_URL = "http://127.0.0.1:1";
    const res = await postRescrape({ repoId: 1 }, "tok-secret-xyz");
    assert.deepEqual(res, { ok: false, kind: "unreachable", message: "API unreachable" });
    assert.ok(!JSON.stringify(res).includes("tok-secret-xyz"));
  });
});
