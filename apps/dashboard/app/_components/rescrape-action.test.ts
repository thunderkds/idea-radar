import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { rescrapeAction } from "./rescrape-action";

const realFetch = globalThis.fetch;
const savedToken = process.env.ADMIN_TOKEN;
let calls: { url: string; init: RequestInit | undefined }[] = [];

function answer(status: number, body: unknown) {
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
}

beforeEach(() => {
  calls = [];
  process.env.ADMIN_TOKEN = "tok-abc";
});
afterEach(() => {
  globalThis.fetch = realFetch;
  if (savedToken === undefined) delete process.env.ADMIN_TOKEN;
  else process.env.ADMIN_TOKEN = savedToken;
});

describe("rescrapeAction (server action)", () => {
  it("calls POST /rescrape on the server with the bearer token and returns when it was queued", async () => {
    answer(202, { queued: 3 });
    const before = Date.now();
    const res = await rescrapeAction({ groupKey: "cli|go" });
    assert.ok(res.ok);
    assert.equal(res.ok && res.queued, 3);
    assert.ok(res.ok && Math.abs(Date.parse(res.at) - before) < 10_000);
    assert.match(calls[0]!.url, /\/rescrape$/);
    assert.equal(calls[0]!.init?.method, "POST");
    assert.equal((calls[0]!.init?.headers as Record<string, string>).authorization, "Bearer tok-abc");
    assert.equal(calls[0]!.init?.body, JSON.stringify({ groupKey: "cli|go" }));
  });
  it("refuses without calling the API when ADMIN_TOKEN is not set on the dashboard server", async () => {
    delete process.env.ADMIN_TOKEN;
    answer(202, { queued: 1 });
    const res = await rescrapeAction({ repoId: 1 });
    assert.deepEqual(res, { ok: false, message: "Refresh is not enabled on this dashboard" });
    assert.equal(calls.length, 0);
  });
  it("refuses a target the browser could forge, without calling the API", async () => {
    answer(202, { queued: 1 });
    for (const bad of [null, {}, { repoId: "1" }, { repoId: 0 }, { repoId: 1.5 }, { groupKey: "" }, { groupKey: 5 }, { groupKey: "x".repeat(201) }, { repoId: 1, groupKey: "a" }, "x"]) {
      const res = await rescrapeAction(bad as never);
      assert.deepEqual(res, { ok: false, message: "Invalid refresh request" }, JSON.stringify(bad));
    }
    assert.equal(calls.length, 0);
  });
  it("returns the API's error text, and never the token", async () => {
    answer(401, { error: "unauthorized" });
    assert.deepEqual(await rescrapeAction({ repoId: 1 }), { ok: false, message: "unauthorized" });
    answer(404, { error: "repo or group is not tracked" });
    assert.deepEqual(await rescrapeAction({ repoId: 1 }), { ok: false, message: "repo or group is not tracked" });
    globalThis.fetch = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    const down = await rescrapeAction({ repoId: 1 });
    assert.deepEqual(down, { ok: false, message: "API unreachable" });
    assert.ok(!JSON.stringify(down).includes("tok-abc"));
  });
});
