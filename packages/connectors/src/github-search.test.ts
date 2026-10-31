import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GithubApiConnector } from "./github-api.js";

const searchFixture = readFileSync(new URL("./fixtures/github-api/search-repositories.json", import.meta.url), "utf8");
const TOKEN = "ghp_secretTokenValue123";
const MINUTE = 60_000;

interface Call {
  url: URL;
  init: RequestInit;
}

/** Stub fetch returning `body` for every call; records each call. */
function stub(body: unknown = JSON.parse(searchFixture), status = 200) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url: new URL(url), init });
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

/** A connector on a fake clock: `sleep` moves the clock forward and records the wait. */
function make(fetchImpl: typeof fetch) {
  const clock = { t: Date.parse("2026-10-31T06:00:00Z"), sleeps: [] as number[] };
  const c = new GithubApiConnector(TOKEN, true, {
    fetchImpl,
    now: () => clock.t,
    sleep: async (ms) => {
      clock.sleeps.push(ms);
      clock.t += ms;
    },
  });
  return { c, clock };
}

describe("GithubApiConnector.searchRepos (T025 AC 2)", () => {
  it("maps a saved Search response to repos and asks for 100 per page, most stars first", async () => {
    const { calls, fetchImpl } = stub();
    const { c } = make(fetchImpl);
    const out = await c.searchRepos("language:TypeScript created:>=2026-10-01 stars:5..200", 1);
    assert.equal(calls.length, 1);
    const { url, init } = calls[0]!;
    assert.equal(url.origin + url.pathname, "https://api.github.com/search/repositories");
    assert.equal(url.searchParams.get("q"), "language:TypeScript created:>=2026-10-01 stars:5..200");
    assert.equal(url.searchParams.get("per_page"), "100");
    assert.equal(url.searchParams.get("page"), "1");
    assert.equal(url.searchParams.get("sort"), "stars");
    assert.equal((init.headers as Record<string, string>).authorization, `bearer ${TOKEN}`);
    assert.equal(out.totalCount, 3);
    assert.equal(out.hasMore, false, "3 results fit in page 1");
    assert.deepEqual(out.repos[0], {
      repoId: 880100001,
      fullName: "alice/tiny-queue",
      description: "A tiny durable job queue for Postgres",
      language: "TypeScript",
      topics: ["postgres", "queue", "typescript"],
      license: "MIT",
      stars: 41,
      forks: 3,
      archived: false,
      createdAt: new Date("2026-10-12T08:30:00Z"),
      pushedAt: new Date("2026-10-30T09:45:00Z"),
    });
    assert.deepEqual(out.repos.map((r) => r.repoId), [880100001, 880100002, 880100003]);
    assert.equal(out.repos[1]!.description, null);
    assert.equal(out.repos[1]!.license, null);
  });

  it("hasMore is true while the pages fetched so far cover fewer than min(total, 1000) results", async () => {
    const { fetchImpl } = stub({ total_count: 5000, incomplete_results: false, items: [] });
    const { c } = make(fetchImpl);
    assert.equal((await c.searchRepos("q", 1)).hasMore, true);
    assert.equal((await c.searchRepos("q", 9)).hasMore, true);
    assert.equal((await c.searchRepos("q", 10)).hasMore, false, "page 10 ends the 1,000-result cap");
    const small = make(stub({ total_count: 150, incomplete_results: false, items: [] }).fetchImpl).c;
    assert.equal((await small.searchRepos("q", 1)).hasMore, true);
    assert.equal((await small.searchRepos("q", 2)).hasMore, false);
  });

  it("makes no request for a page beyond the 1,000-result cap, or a page below 1", async () => {
    const { calls, fetchImpl } = stub();
    const { c } = make(fetchImpl);
    assert.deepEqual(await c.searchRepos("q", 11), { repos: [], totalCount: 0, hasMore: false });
    assert.deepEqual(await c.searchRepos("q", 0), { repos: [], totalCount: 0, hasMore: false });
    assert.equal(calls.length, 0);
  });

  it("needs a token, reports an HTTP error and keeps the token out of errors", async () => {
    await assert.rejects(new GithubApiConnector(undefined, true, { fetchImpl: stub().fetchImpl }).searchRepos("q", 1), /no token/);
    await assert.rejects(make(stub({}, 403).fetchImpl).c.searchRepos("q", 1), /GitHub Search HTTP 403/);
    const leaky = (async () => {
      throw new Error(`socket closed for ${TOKEN}`);
    }) as unknown as typeof fetch;
    await assert.rejects(make(leaky).c.searchRepos("q", 1), (err: Error) => {
      assert.match(err.message, /\[redacted\]/);
      assert.ok(!err.message.includes(TOKEN));
      return true;
    });
  });
});

describe("Search rate limit (T025 AC 2, AC 4)", () => {
  it("spaces 31 calls over at least 60 s on a fake clock: the first 30 go at once, the 31st waits", async () => {
    const { calls, fetchImpl } = stub();
    const { c, clock } = make(fetchImpl);
    const start = clock.t;
    for (let i = 0; i < 31; i++) await c.searchRepos("q", 1);
    assert.equal(calls.length, 31);
    assert.deepEqual(clock.sleeps, [MINUTE]);
    assert.ok(clock.t - start >= MINUTE, "31 calls took at least 60 s");
  });

  it("never lets more than 30 calls fall in any 60 s window, 70 calls, concurrent callers", async () => {
    const stamps: number[] = [];
    const { c, clock } = make((async () => {
      stamps.push(clock.t);
      return new Response(JSON.stringify({ total_count: 0, items: [] }));
    }) as unknown as typeof fetch);
    await Promise.all(Array.from({ length: 70 }, () => c.searchRepos("q", 1)));
    assert.equal(stamps.length, 70);
    for (let i = 30; i < stamps.length; i++) {
      assert.ok(stamps[i]! - stamps[i - 30]! >= MINUTE, `call ${i} came ${stamps[i]! - stamps[i - 30]!} ms after call ${i - 30}`);
    }
  });

  it("a call that fails still counts against the window", async () => {
    const { fetchImpl } = stub({}, 500);
    const { c, clock } = make(fetchImpl);
    for (let i = 0; i < 30; i++) await c.searchRepos("q", 1).catch(() => {});
    await c.searchRepos("q", 1).catch(() => {});
    assert.deepEqual(clock.sleeps, [MINUTE]);
  });
});
