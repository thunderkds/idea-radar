import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
import { discoveryConfig, discoveryQueries } from "@idea-radar/core";
import { GithubApiConnector } from "@idea-radar/connectors";
import { applyMigrations, listDueTracked } from "@idea-radar/db";
import type { JobHandler } from "./handlers.js";
import { buildHandlers, DISCOVER_JOB } from "./handlers.js";
import { runWorker } from "./runner.js";

const url = process.env.TEST_DATABASE_URL;

/** Returns why the DB tests must skip, or undefined when Postgres answers. */
async function skipReason(): Promise<string | undefined> {
  if (!url) return "TEST_DATABASE_URL is not set";
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 2000 });
  try {
    await client.connect();
    await client.query("SELECT 1");
    return undefined;
  } catch (err) {
    return `Postgres unreachable at TEST_DATABASE_URL: ${(err as Error).message}`;
  } finally {
    await client.end().catch(() => {});
  }
}

const skip = await skipReason();

const NOW = new Date("2026-10-31T06:10:00Z");
const fixture = JSON.parse(
  readFileSync(new URL("../../../packages/connectors/src/fixtures/github-api/search-repositories.json", import.meta.url), "utf8"),
) as { total_count: number; items: unknown[] };
const FIXTURE_IDS = [880100001, 880100002, 880100003];

/** A GithubApiConnector over a stubbed Search endpoint; `respond` builds the body for each call. */
function makeGithub(respond: (q: string, page: number, n: number) => unknown, status: (n: number) => number = () => 200) {
  const calls: { q: string; page: number }[] = [];
  const fetchImpl = (async (input: string) => {
    const u = new URL(input);
    const call = { q: u.searchParams.get("q")!, page: Number(u.searchParams.get("page")) };
    calls.push(call);
    return new Response(JSON.stringify(respond(call.q, call.page, calls.length)), { status: status(calls.length) });
  }) as typeof fetch;
  // Fake clock: a limiter wait moves it forward, so 60 requests take two fake minutes, not two real ones.
  let t = NOW.getTime();
  const github = new GithubApiConnector("tok", true, { fetchImpl, now: () => t, sleep: async (ms) => void (t += ms) });
  return { github, calls };
}

describe("discover job (T025, needs TEST_DATABASE_URL)", { skip }, () => {
  const schema = `test_${randomBytes(6).toString("hex")}`;
  let admin: pg.Client;
  let pool: pg.Pool;
  const lines: string[] = [];

  const job = async () => (await pool.query("SELECT * FROM jobs WHERE name = $1", [DISCOVER_JOB])).rows[0] as Record<string, any>;
  const source = async (id: string) =>
    (await pool.query("SELECT * FROM sources WHERE id = $1", [id])).rows[0] as Record<string, any> | undefined;
  const tracked = async () =>
    (await pool.query("SELECT repo_id, priority, added_reason, next_due_at FROM tracked_repos ORDER BY repo_id")).rows as Record<string, any>[];
  const count = async (table: string) =>
    (await pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`)).rows[0]!.n;
  const runDiscover = (github: GithubApiConnector) => {
    const handler = buildHandlers({ connectors: [github], log: (l) => lines.push(l) })[DISCOVER_JOB]!;
    const handlers: Record<string, JobHandler> = { [DISCOVER_JOB]: handler };
    return runWorker({ db: pool, handlers, caps: { defaultPerName: 5 }, once: true, now: () => NOW });
  };

  before(async () => {
    admin = new pg.Client({ connectionString: url });
    await admin.connect();
    await admin.query(`CREATE SCHEMA ${schema}`);
    pool = new pg.Pool({ connectionString: url, options: `-c search_path=${schema}`, max: 10 });
    const client = await pool.connect();
    try {
      await applyMigrations(client);
    } finally {
      client.release();
    }
  });

  after(async () => {
    await pool?.end();
    await admin?.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin?.end();
  });

  beforeEach(async () => {
    const { rows } = await pool.query<{ s: string }>("SELECT current_schema() AS s");
    assert.equal(rows[0]!.s, schema, "refusing to truncate outside the throwaway schema");
    await pool.query("TRUNCATE jobs, repos, sources, tracked_repos");
    lines.length = 0;
  });

  it("runs every query, writes the results to repos and tracks each repo once as normal, due now, 'search' (AC 3, AC 4)", async () => {
    // Every query returns the same three repos: they must land once.
    const { github, calls } = makeGithub(() => fixture);
    await runDiscover(github);
    const queries = discoveryQueries(NOW);
    assert.deepEqual(calls.map((c) => c.q), queries, "each configured query once, page 1 (3 results fit one page)");
    assert.deepEqual((await tracked()).map((r) => [r.repo_id, r.priority, r.added_reason]), FIXTURE_IDS.map((id) => [id, "normal", "search"]));
    assert.deepEqual(await listDueTracked(pool, new Date()), FIXTURE_IDS, "due now");
    const repos = (await pool.query("SELECT repo_id, full_name, language, stars, topics, license FROM repos ORDER BY repo_id")).rows;
    assert.equal(repos.length, 3);
    assert.deepEqual(repos[0], { repo_id: 880100001, full_name: "alice/tiny-queue", language: "TypeScript", stars: 41, topics: ["postgres", "queue", "typescript"], license: "MIT" });
    assert.equal((await job()).status, "ok");
    assert.equal((await source("github_api"))!.last_status, "ok");
    assert.deepEqual(JSON.parse(lines.at(-1)!), { job: "discover", date: "2026-10-31", queries: queries.length, requests: queries.length, found: 3 * queries.length, added: 3 });
  });

  it("an existing leader stays a leader with its due time; its metadata is still refreshed (AC 4)", async () => {
    await pool.query("INSERT INTO tracked_repos (repo_id, priority, added_reason, next_due_at) VALUES (880100001, 'leader', 'signal', '2026-11-05T00:00:00Z')");
    await pool.query("INSERT INTO repos (repo_id, full_name, stars, forks, archived, created_at) VALUES (880100001, 'alice/old-name', 1, 0, false, now())");
    await runDiscover(makeGithub(() => fixture).github);
    const rows = await tracked();
    assert.deepEqual(rows.map((r) => [r.repo_id, r.priority, r.added_reason]), [
      [880100001, "leader", "signal"],
      [880100002, "normal", "search"],
      [880100003, "normal", "search"],
    ]);
    assert.equal(rows[0]!.next_due_at.toISOString(), "2026-11-05T00:00:00.000Z");
    const r = (await pool.query("SELECT full_name, stars FROM repos WHERE repo_id = 880100001")).rows[0];
    assert.deepEqual(r, { full_name: "alice/tiny-queue", stars: 41 });
  });

  it("pages a query while more results exist, up to pagesPerQuery, and no further", async () => {
    // total_count 250: pages 1, 2, 3 of each query. total_count 9999: pagesPerQuery pages.
    const three = makeGithub(() => ({ total_count: 250, items: [] }));
    await runDiscover(three.github);
    const first = discoveryQueries(NOW)[0]!;
    assert.deepEqual(three.calls.filter((c) => c.q === first).map((c) => c.page), [1, 2, 3]);

    await pool.query("TRUNCATE jobs");
    const many = makeGithub(() => ({ total_count: 9999, items: [] }));
    await runDiscover(many.github);
    assert.deepEqual(many.calls.filter((c) => c.q === first).map((c) => c.page), Array.from({ length: discoveryConfig.pagesPerQuery }, (_, i) => i + 1));
  });

  it("stops at the daily request cap and says so in the log", async () => {
    const saved = discoveryConfig.dailyRequestCap;
    discoveryConfig.dailyRequestCap = 7;
    try {
      const { github, calls } = makeGithub(() => ({ total_count: 9999, items: [] }));
      await runDiscover(github);
      assert.equal(calls.length, 7);
      assert.equal((await job()).status, "ok");
      assert.deepEqual(JSON.parse(lines.at(-1)!), { job: "discover", date: "2026-10-31", queries: discoveryQueries(NOW).length, requests: 7, found: 0, added: 0, capped: true });
    } finally {
      discoveryConfig.dailyRequestCap = saved;
    }
  });

  it("without a GitHub token it is skipped and logged: no request, no repos, no github_api health", async () => {
    await runDiscover(new GithubApiConnector(undefined));
    assert.equal((await job()).status, "ok");
    assert.equal(await count("tracked_repos"), 0);
    assert.equal(await source("github_api"), undefined);
    assert.match(lines.join("\n"), /discover.*no token/);
  });

  it("a Search failure fails the job and marks github_api error; results stored before it stay", async () => {
    const { github } = makeGithub(() => fixture, (n) => (n === 1 ? 200 : 403));
    await runDiscover(github);
    const j = await job();
    assert.equal(j.status, "pending");
    assert.match(j.last_error, /GitHub Search HTTP 403/);
    assert.equal((await source("github_api"))!.last_status, "error");
    assert.deepEqual((await tracked()).map((r) => r.repo_id), FIXTURE_IDS);
  });
});
