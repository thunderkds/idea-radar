import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, it } from "node:test";
import { apiBase, getRepo, getTier } from "./api";

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
