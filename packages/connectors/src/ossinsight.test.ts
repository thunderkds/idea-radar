import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { OssInsightConnector, OssInsightEmptyError } from "./ossinsight.js";

const load = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`./fixtures/ossinsight/${name}.json`, import.meta.url), "utf8"));

const BASE = "https://api.ossinsight.io/v1";
type Reply = { status?: number; body?: unknown; text?: string };

/** Fake fetch: routes by URL prefix, records every URL requested. */
function fakeFetch(routes: Record<string, Reply | (() => Reply)>) {
  const calls: string[] = [];
  const impl = async (url: string) => {
    calls.push(url);
    const path = url.slice(BASE.length);
    const key = Object.keys(routes)
      .filter((k) => path.startsWith(k))
      .sort((a, b) => b.length - a.length)[0];
    if (!key) throw new Error(`unrouted ${url}`);
    const r = typeof routes[key] === "function" ? (routes[key] as () => Reply)() : (routes[key] as Reply);
    const status = r.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => {
        if (r.text !== undefined) return JSON.parse(r.text);
        return r.body;
      },
    };
  };
  return { impl, calls };
}

const happyRoutes = {
  "/trends/repos/": { body: load("trends-rows") },
  "/collections/10001/repos/": { body: load("collection-10001-repos") },
  "/collections/10003/repos/": { body: load("collection-10003-repos") },
  "/collections/10007/repos/": { body: load("collection-10007-repos") },
  "/collections/": { body: load("collections") },
};

async function drain(c: OssInsightConnector) {
  const out = [];
  for await (const row of c.fetch(new Date())) out.push(row);
  return out;
}

const one = ["past_24_hours"] as const;

test("AC1: zero rows over all periods throws OssInsightEmptyError naming data_quality status and reason", async () => {
  const { impl, calls } = fakeFetch({ "/trends/repos/": { body: load("trends-unavailable") } });
  const c = new OssInsightConnector(true, ["past_24_hours", "past_week"], impl);
  await assert.rejects(drain(c), (e: Error) => {
    assert.ok(e instanceof OssInsightEmptyError);
    assert.match(e.message, /unavailable/);
    assert.match(e.message, /cannot be computed/); // data_quality.reason
    return true;
  });
  assert.equal(calls.length, 2); // collections are not requested when trends are empty
});

test("AC1: empty rows with no data_quality still throws, and says so", async () => {
  const body = { data: { columns: [], rows: [], result: { row_count: 0 } } };
  const c = new OssInsightConnector(true, one, fakeFetch({ "/trends/repos/": { body } }).impl);
  await assert.rejects(drain(c), (e: Error) => e instanceof OssInsightEmptyError && /no data_quality/.test(e.message));
});

test("AC1: one empty period is fine when another period has rows", async () => {
  let n = 0;
  const { impl } = fakeFetch({
    ...happyRoutes,
    "/trends/repos/": () => ({ body: n++ === 0 ? load("trends-unavailable") : load("trends-rows") }),
  });
  const rows = await drain(new OssInsightConnector(true, ["past_24_hours", "past_week"], impl));
  assert.equal(rows.length, 3);
});

test("AC2: non-200 throws with URL and status", async () => {
  const { impl } = fakeFetch({ "/trends/repos/": { status: 503, body: {} } });
  const c = new OssInsightConnector(true, one, impl);
  await assert.rejects(drain(c), (e: Error) => {
    assert.match(e.message, /trends\/repos\/\?period=past_24_hours/);
    assert.match(e.message, /503/);
    return true;
  });
});

test("AC2: bodies that are not the expected JSON shape throw", async () => {
  for (const reply of [
    { body: "just a string" },
    { body: { data: {} } },
    { body: { data: { rows: "nope" } } },
    { body: { data: { rows: [{ repo_name: "a/b" }] } } }, // row without repo_id
    { text: "<html>not json" },
  ] as Reply[]) {
    const c = new OssInsightConnector(true, one, fakeFetch({ "/trends/repos/": reply }).impl);
    await assert.rejects(drain(c), /OSS Insight/);
  }
});

test("AC3: signals carry every collection the repo belongs to, merged with collection_names", async () => {
  const { impl } = fakeFetch(happyRoutes);
  const rows = await drain(new OssInsightConnector(true, one, impl));
  const byName = new Map(rows.map((r) => [r.repo_name, r.collections]));
  // collection_names "Database,Cloud Native" + membership in AI and Database (deduped)
  assert.deepEqual(byName.get("pingcap/tidb"), ["Database", "Cloud Native", "Artificial Intelligence"]);
  // no collection_names; member of JavaScript Framework only
  assert.deepEqual(byName.get("facebook/react"), ["JavaScript Framework"]);
  assert.deepEqual(byName.get("example/untagged"), []);

  const c = new OssInsightConnector(true, one, impl);
  const signals = rows.flatMap((r) => c.normalize(r));
  const tidb = signals.find((s) => s.fullName === "pingcap/tidb")!;
  assert.equal(tidb.repoId, 41986369);
  assert.equal(tidb.source, "ossinsight");
  assert.deepEqual((tidb.value as { collections: string[] }).collections, [
    "Database",
    "Cloud Native",
    "Artificial Intelligence",
  ]);
});

test("AC3: collection list and member repos are fetched once per run", async () => {
  const { impl, calls } = fakeFetch(happyRoutes);
  await drain(new OssInsightConnector(true, ["past_24_hours", "past_week"], impl));
  assert.equal(calls.filter((u) => u.startsWith(`${BASE}/collections/?`) || u === `${BASE}/collections/`).length, 1);
  assert.equal(calls.filter((u) => u.includes("/10001/repos")).length, 1);
  assert.equal(calls.length, 2 + 1 + 3);
});

test("normalize still splits collection_names when fetch did not add collections", () => {
  const c = new OssInsightConnector(true);
  const [s] = c.normalize({ repo_id: "1", repo_name: "a/b", collection_names: "X, Y" });
  assert.deepEqual((s!.value as { collections: string[] }).collections, ["X", "Y"]);
});

test("AC4: a collection fetch failure fails the run before any row is yielded", async () => {
  for (const failing of ["/collections/", "/collections/10003/repos/"]) {
    const { impl } = fakeFetch({ ...happyRoutes, [failing]: { status: 500, body: { message: "boom" } } });
    const c = new OssInsightConnector(true, one, impl);
    const seen: unknown[] = [];
    await assert.rejects(
      (async () => {
        for await (const r of c.fetch(new Date())) seen.push(r);
      })(),
      /500/,
    );
    assert.equal(seen.length, 0);
  }
});

test("AC4: an empty collection list, or a member list flagged unavailable, fails the run", async () => {
  const empty = { data: { rows: [] } };
  const c1 = new OssInsightConnector(true, one, fakeFetch({ ...happyRoutes, "/collections/": { body: empty } }).impl);
  await assert.rejects(drain(c1), OssInsightEmptyError);

  const unavailable = { data: { rows: [] }, data_quality: { status: "unavailable", reason: "capture down" } };
  const c2 = new OssInsightConnector(
    true,
    one,
    fakeFetch({ ...happyRoutes, "/collections/10001/repos/": { body: unavailable } }).impl,
  );
  await assert.rejects(drain(c2), (e: Error) => e instanceof OssInsightEmptyError && /capture down/.test(e.message));
});

test("AC4: a collection with an empty member list and no data_quality problem is allowed", async () => {
  const none = { data: { rows: [] } };
  const { impl } = fakeFetch({ ...happyRoutes, "/collections/10007/repos/": { body: none } });
  const rows = await drain(new OssInsightConnector(true, one, impl));
  assert.deepEqual(rows.find((r) => r.repo_name === "facebook/react")!.collections, []);
});

function manyCollections(n: number) {
  const rows = Array.from({ length: n }, (_, i) => ({ id: String(i + 1), name: `C${i + 1}` }));
  const members = { body: { data: { rows: [{ repo_id: "10270250", repo_name: "facebook/react" }] } } };
  const routes: Record<string, Reply> = {
    "/trends/repos/": { body: load("trends-rows") },
    "/collections/": { body: { data: { rows } } },
  };
  for (const r of rows) routes[`/collections/${r.id}/repos/`] = members;
  return routes;
}

test("AC5: requests are sequential and a run never exceeds rateLimit.perHour", async () => {
  // Start-to-end overlap check: a request must finish before the next one starts.
  let inFlight = 0;
  let maxInFlight = 0;
  const routes = manyCollections(596); // 3 trends + 1 list + 596 = 600, exactly the budget
  const inner = fakeFetch(routes);
  const impl = async (url: string) => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((r) => setImmediate(r));
    inFlight--;
    return inner.impl(url);
  };
  const c = new OssInsightConnector(true, undefined, impl);
  const rows = await drain(c);
  assert.equal(rows.length, 9); // 3 rows x 3 periods
  assert.equal(inner.calls.length, 600);
  assert.ok(inner.calls.length <= c.rateLimit.perHour);
  assert.ok(maxInFlight <= c.rateLimit.concurrency);
  assert.equal(maxInFlight, 1);
});

test("AC5: a run that would exceed perHour throws before requesting the collections", async () => {
  const inner = fakeFetch(manyCollections(597)); // would need 601 requests
  const c = new OssInsightConnector(true, undefined, inner.impl);
  await assert.rejects(drain(c), /budget/i);
  assert.ok(inner.calls.length <= c.rateLimit.perHour);
  assert.equal(inner.calls.length, 4); // 3 trends + the collection list, no member fetches
});

test("AC5: the budget is per run, a second run starts at zero", async () => {
  const inner = fakeFetch(manyCollections(596));
  const c = new OssInsightConnector(true, undefined, inner.impl);
  await drain(c);
  await drain(c);
  assert.equal(inner.calls.length, 1200);
});
