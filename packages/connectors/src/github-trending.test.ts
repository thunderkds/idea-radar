import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { GithubTrendingConnector, parseTrendingHtml, TrendingParseError } from "./github-trending.js";

const fixture = readFileSync(new URL("./fixtures/github-trending/daily.html", import.meta.url), "utf8");

const row = (inner: string) => `<article class="Box-row">${inner}</article>`;
const h2 = (href: string) => `<h2 class="h3"><a href="${href}"><span>owner /</span>\n  name</a></h2>`;

test("parses the saved daily fixture", () => {
  const entries = parseTrendingHtml(fixture, { period: "daily" });
  assert.ok(entries.length >= 10);
  assert.equal(entries[0]?.rank, 1);
  assert.deepEqual(
    entries.map((e) => e.rank),
    entries.map((_, i) => i + 1),
  );
  for (const e of entries) {
    assert.match(e.fullName, /^[^/\s]+\/[^/\s]+$/);
    assert.equal(e.period, "daily");
    assert.ok(e.starsInPeriod === null || Number.isInteger(e.starsInPeriod));
  }
  assert.equal(entries[0]?.fullName, "thedotmack/claude-mem");
  assert.equal(entries[0]?.language, "TypeScript");
  assert.equal(entries[0]?.starsInPeriod, 1140);
});

test("throws TrendingParseError on a page with no repo rows", () => {
  assert.throws(() => parseTrendingHtml("<html><body></body></html>", { period: "daily" }), TrendingParseError);
});

test("repo without language or period stars gets nulls; entities are decoded", () => {
  const [e] = parseTrendingHtml(row(h2("/own&amp;er/na-me")), { period: "weekly" });
  assert.equal(e?.fullName, "own&er/na-me");
  assert.equal(e?.language, null);
  assert.equal(e?.starsInPeriod, null);
});

test("parses weekly stars text", () => {
  const [e] = parseTrendingHtml(row(`${h2("/a/b")}<span>12,345 stars this week</span>`), { period: "weekly" });
  assert.equal(e?.starsInPeriod, 12345);
});

function fakeFetch(status = 200) {
  const urls: string[] = [];
  const headers: Record<string, string>[] = [];
  const impl = async (url: string, init?: { headers?: Record<string, string> }) => {
    urls.push(url);
    headers.push(init?.headers ?? {});
    return { ok: status === 200, status, text: async () => fixture };
  };
  return { urls, headers, impl };
}

test("fetch iterates languages x periods in order and yields all entries", async () => {
  const f = fakeFetch();
  const c = new GithubTrendingConnector([null, "typescript"], ["daily", "weekly", "monthly"], f.impl);
  const out: unknown[] = [];
  for await (const e of c.fetch(new Date())) out.push(e);
  assert.deepEqual(f.urls, [
    "https://github.com/trending?since=daily",
    "https://github.com/trending?since=weekly",
    "https://github.com/trending?since=monthly",
    "https://github.com/trending/typescript?since=daily",
    "https://github.com/trending/typescript?since=weekly",
    "https://github.com/trending/typescript?since=monthly",
  ]);
  assert.equal(out.length, 6 * parseTrendingHtml(fixture, { period: "daily" }).length);
  assert.match(f.headers[0]?.["User-Agent"] ?? "", /idea-radar/);
});

test("fetch throws with URL and status on a non-200 response", async () => {
  const c = new GithubTrendingConnector([null], ["daily"], fakeFetch(503).impl);
  await assert.rejects(
    async () => {
      for await (const _ of c.fetch(new Date())) void _;
    },
    (err: Error) => err.message.includes("https://github.com/trending?since=daily") && err.message.includes("503"),
  );
});

test("normalize emits a github_trending/listed signal", () => {
  const c = new GithubTrendingConnector();
  const [s] = c.normalize({ fullName: "a/b", rank: 3, period: "daily", language: null, starsInPeriod: 5 });
  assert.equal(s?.source, "github_trending");
  assert.equal(s?.signalType, "listed");
  assert.equal(s?.repoId, 0);
  assert.equal(s?.fullName, "a/b");
});
