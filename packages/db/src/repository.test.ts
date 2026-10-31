import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readdirSync } from "node:fs";
import pg from "pg";
import type { Repo, RepoDaily, RepoScore, Signal } from "@idea-radar/core";
import {
  applyMigrations,
  getCursor,
  insertSignals,
  listUnresolvedNames,
  markNotFound,
  MAX_PENDING_ATTEMPTS,
  recordSourceRun,
  resolvePending,
  setCursor,
  upsertRepo,
  upsertRepoContent,
  upsertRepoDaily,
  upsertRepoScores,
} from "./index.js";

const url = process.env.TEST_DATABASE_URL;

/** Every shipped migration file; the tests count against the directory so a new migration needs no edit here. */
const migrationFiles = readdirSync(new URL("../migrations", import.meta.url))
  .filter((f) => f.endsWith(".sql") && !f.endsWith(".down.sql"))
  .sort();

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

const repo = (repoId: number, fullName: string, extra: Partial<Repo> = {}): Repo => ({
  repoId,
  fullName,
  description: "d",
  language: "TypeScript",
  topics: ["a", "b, c"],
  license: "MIT",
  stars: 10,
  forks: 2,
  archived: false,
  createdAt: new Date("2024-01-02T03:04:05Z"),
  pushedAt: null,
  ...extra,
});

const daily = (repoId: number, date: string, extra: Partial<RepoDaily> = {}): RepoDaily => ({
  repoId,
  date,
  starsNew: 5,
  forksNew: 1,
  pushes: 3,
  issuesOpened: 2,
  prsOpened: 1,
  distinctActors: 9,
  contributors: 4,
  starsMaxHour: 3,
  ...extra,
});

const signal = (repoId: number, extra: Partial<Signal> = {}): Signal => ({
  repoId,
  source: "ossinsight",
  signalType: "trending_rank",
  value: { rank: 1 },
  observedAt: new Date("2026-10-30T10:00:00Z"),
  ...extra,
});

describe("db data access (needs TEST_DATABASE_URL)", { skip }, () => {
  const schema = `test_${randomBytes(6).toString("hex")}`;
  let admin: pg.Client;
  let pool: pg.Pool;

  /** Every pool connection resolves unqualified names in the throwaway schema only. */
  const newPool = () => new pg.Pool({ connectionString: url, options: `-c search_path=${schema}`, max: 4 });
  const count = async (table: string): Promise<number> =>
    (await pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`)).rows[0]!.n;

  before(async () => {
    admin = new pg.Client({ connectionString: url });
    await admin.connect();
    await admin.query(`CREATE SCHEMA ${schema}`);
    pool = newPool();
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
    await pool.query(
      "TRUNCATE repos, repo_daily, signals, repo_content, repo_scores, sources, pending_signals, ingest_cursors",
    );
  });

  describe("migrations", () => {
    it("applies each file once; a second run is a no-op (AC 1)", async () => {
      const client = await pool.connect();
      try {
        assert.deepEqual(await applyMigrations(client), []);
      } finally {
        client.release();
      }
      const { rows } = await pool.query<{ name: string }>("SELECT name FROM schema_migrations ORDER BY name");
      assert.deepEqual(
        rows.map((r) => r.name),
        migrationFiles,
      );
    });

    it("two concurrent runs on a fresh schema both succeed and apply once (advisory lock, AC 14)", async () => {
      const fresh = `${schema}_lock`;
      await admin.query(`CREATE SCHEMA ${fresh}`);
      const freshPool = new pg.Pool({ connectionString: url, options: `-c search_path=${fresh}`, max: 2 });
      try {
        const [a, b] = await Promise.all([freshPool.connect(), freshPool.connect()]);
        try {
          const results = await Promise.all([applyMigrations(a), applyMigrations(b)]);
          assert.equal(results[0]!.length + results[1]!.length, migrationFiles.length, "each migration applied exactly once in total");
        } finally {
          a.release();
          b.release();
        }
        const { rows } = await freshPool.query("SELECT name FROM schema_migrations");
        assert.equal(rows.length, migrationFiles.length);
      } finally {
        await freshPool.end();
        await admin.query(`DROP SCHEMA ${fresh} CASCADE`);
      }
    });

    it("returns BIGINT and NUMERIC as numbers (AC 13)", async () => {
      const { rows } = await pool.query("SELECT 9007199254740::bigint AS b, 0.35::numeric AS n");
      assert.strictEqual(rows[0].b, 9007199254740);
      assert.strictEqual(rows[0].n, 0.35);
    });
  });

  describe("upsertRepo", () => {
    it("inserts, then updates on the same repo_id; a rename changes full_name (AC 2)", async () => {
      await upsertRepo(pool, [repo(1, "old/name")]);
      await upsertRepo(pool, [repo(1, "new/name", { stars: 99, createdAt: null })]);
      const { rows } = await pool.query("SELECT * FROM repos");
      assert.equal(rows.length, 1);
      assert.equal(rows[0].repo_id, 1);
      assert.equal(rows[0].full_name, "new/name");
      assert.equal(rows[0].stars, 99);
      assert.equal(rows[0].created_at, null);
      assert.deepEqual(rows[0].topics, ["a", "b, c"]);
    });

    it("handles an empty array and a duplicate key inside one batch", async () => {
      await upsertRepo(pool, []);
      assert.equal(await count("repos"), 0);
      await upsertRepo(pool, [repo(1, "a/one"), repo(1, "a/uno")]);
      const { rows } = await pool.query("SELECT full_name FROM repos");
      assert.deepEqual(rows, [{ full_name: "a/uno" }]);
    });
  });

  describe("upsertRepoDaily", () => {
    it("upserts on (repo_id, date); same key replaces counts and writes the new columns (AC 3, 11)", async () => {
      await upsertRepoDaily(pool, [daily(1, "2026-10-30"), daily(1, "2026-10-31")]);
      await upsertRepoDaily(pool, [daily(1, "2026-10-30", { starsNew: 7, contributors: 6, starsMaxHour: 5 })]);
      const { rows } = await pool.query("SELECT * FROM repo_daily ORDER BY date");
      assert.equal(rows.length, 2);
      assert.equal(rows[0].stars_new, 7, "replaced, not 5 + 7");
      assert.equal(rows[0].contributors, 6);
      assert.equal(rows[0].stars_max_hour, 5);
      assert.equal(rows[1].stars_new, 5);
      await upsertRepoDaily(pool, []);
    });
  });

  describe("insertSignals", () => {
    it("inserts a batch in one statement, value as jsonb, observed_at kept (AC 4)", async () => {
      const client = await pool.connect();
      let queries = 0;
      const original = client.query.bind(client);
      (client as { query: unknown }).query = (...args: unknown[]) => {
        queries++;
        return (original as (...a: unknown[]) => unknown)(...args);
      };
      try {
        const res = await insertSignals(client, [
          signal(1, { value: { rank: 1, tags: ["x"] } }),
          signal(2, { signalType: "other", observedAt: new Date("2026-10-29T23:30:00+02:00") }),
          signal(3),
        ]);
        assert.deepEqual(res, { inserted: 3, queued: 0 });
        assert.equal(queries, 1, "one round trip for all-known repo ids");
      } finally {
        client.release();
      }
      const { rows } = await pool.query("SELECT * FROM signals ORDER BY repo_id");
      assert.equal(rows.length, 3);
      assert.deepEqual(rows[0].value, { rank: 1, tags: ["x"] });
      assert.equal(rows[1].observed_at.toISOString(), "2026-10-29T21:30:00.000Z");
      assert.equal((await pool.query("SELECT jsonb_typeof(value) AS t FROM signals LIMIT 1")).rows[0].t, "object");
    });

    it("resolves repoId 0 by full_name, case-insensitively (AC 5)", async () => {
      await upsertRepo(pool, [repo(42, "Owner/Repo")]);
      const res = await insertSignals(pool, [signal(0, { fullName: "owner/REPO" })]);
      assert.deepEqual(res, { inserted: 1, queued: 0 });
      assert.equal((await pool.query("SELECT repo_id FROM signals")).rows[0].repo_id, 42);
    });

    it("queues unknown names instead of dropping them: [by id, by name, unknown] (AC 6)", async () => {
      await upsertRepo(pool, [repo(42, "owner/repo")]);
      const res = await insertSignals(pool, [
        signal(7),
        signal(0, { fullName: "owner/repo" }),
        signal(0, { fullName: "ghost/unknown", value: { rank: 9 } }),
      ]);
      assert.deepEqual(res, { inserted: 2, queued: 1 });
      assert.equal(await count("signals"), 2);
      const { rows } = await pool.query("SELECT * FROM pending_signals");
      assert.equal(rows.length, 1);
      assert.equal(rows[0].full_name, "ghost/unknown");
      assert.deepEqual(rows[0].value, { rank: 9 });
    });

    it("throws on repoId 0 without fullName and writes nothing (AC 10)", async () => {
      await assert.rejects(insertSignals(pool, [signal(5), signal(0)]), /no fullName/);
      assert.equal(await count("signals"), 0);
      assert.equal(await count("pending_signals"), 0);
    });

    it("empty array is a no-op", async () => {
      assert.deepEqual(await insertSignals(pool, []), { inserted: 0, queued: 0 });
    });

    it("writes 20,000 signals in one statement, past the 65,535 bind-parameter limit of a row-per-tuple INSERT", async () => {
      const many = Array.from({ length: 20_000 }, (_, i) => signal(1 + (i % 50), { value: { i } }));
      assert.deepEqual(await insertSignals(pool, many), { inserted: 20_000, queued: 0 });
      assert.equal(await count("signals"), 20_000);
    });
  });

  describe("pending queue", () => {
    const queueGhost = async (name: string, observedAt: Date) =>
      insertSignals(pool, [signal(0, { fullName: name, observedAt })]);

    it("listUnresolvedNames returns distinct, case-insensitive names, oldest first, limited", async () => {
      await queueGhost("Ghost/One", new Date());
      await queueGhost("ghost/one", new Date());
      await queueGhost("ghost/two", new Date());
      await queueGhost("ghost/three", new Date());
      const names = await listUnresolvedNames(pool, 10);
      assert.equal(names.length, 3);
      assert.equal(names[0], "Ghost/One");
      assert.equal((await listUnresolvedNames(pool, 2)).length, 2);
    });

    it("resolvePending moves rows to signals keeping the original observed_at (AC 12)", async () => {
      const old = new Date("2026-10-20T01:02:03Z");
      await queueGhost("Ghost/One", old);
      await queueGhost("ghost/one", new Date("2026-10-21T00:00:00Z"));
      await queueGhost("ghost/two", old);
      const moved = await resolvePending(pool, new Map([["GHOST/one", 77]]));
      assert.equal(moved, 2);
      const { rows } = await pool.query("SELECT repo_id, observed_at FROM signals ORDER BY observed_at");
      assert.deepEqual(rows.map((r) => r.repo_id), [77, 77]);
      assert.equal(rows[0].observed_at.toISOString(), old.toISOString());
      assert.equal(await count("pending_signals"), 1, "ghost/two stays queued");
      assert.equal(await resolvePending(pool, new Map()), 0);
    });

    it("markNotFound bumps attempts and deletes rows at the limit, returning the count (AC 12)", async () => {
      await queueGhost("ghost/one", new Date());
      await queueGhost("ghost/one", new Date());
      await queueGhost("ghost/keep", new Date());
      for (let i = 1; i < MAX_PENDING_ATTEMPTS; i++) {
        assert.equal(await markNotFound(pool, ["Ghost/One"]), 0);
      }
      const { rows } = await pool.query("SELECT full_name, attempts, last_attempt_at FROM pending_signals ORDER BY id");
      assert.deepEqual(rows.map((r) => r.attempts), [MAX_PENDING_ATTEMPTS - 1, MAX_PENDING_ATTEMPTS - 1, 0]);
      assert.notEqual(rows[0].last_attempt_at, null);
      assert.equal(rows[2].last_attempt_at, null);
      assert.equal(await markNotFound(pool, ["ghost/one"]), 2);
      assert.equal(await count("pending_signals"), 1);
      assert.equal(await markNotFound(pool, []), 0);
    });
  });

  describe("upsertRepoContent / upsertRepoScores", () => {
    it("upsertRepoContent upserts on repo_id (AC 7)", async () => {
      const content = {
        repoId: 1,
        readmeMd: "# hi",
        manifests: { "package.json": { name: "x" } },
        fileTreeSummary: { src: 3 },
        stackTags: ["node", "react, next"],
      };
      await upsertRepoContent(pool, [content]);
      await upsertRepoContent(pool, [{ ...content, readmeMd: "# bye", stackTags: ["go"] }]);
      const { rows } = await pool.query("SELECT * FROM repo_content");
      assert.equal(rows.length, 1);
      assert.equal(rows[0].readme_md, "# bye");
      assert.deepEqual(rows[0].manifests, { "package.json": { name: "x" } });
      assert.deepEqual(rows[0].stack_tags, ["go"]);
      await upsertRepoContent(pool, []);
    });

    it("upsertRepoScores upserts on (repo_id, date), numeric score as number (AC 7, 13)", async () => {
      const score: RepoScore = {
        repoId: 1,
        date: "2026-10-31",
        tier: "lowkey",
        score: 0.35,
        components: { velocity_lift: 0.5 },
        consensusCount: 2,
        fakeStarFlag: false,
      };
      await upsertRepoScores(pool, [score]);
      await upsertRepoScores(pool, [{ ...score, tier: "trending", score: 0.9, fakeStarFlag: true }]);
      const { rows } = await pool.query("SELECT * FROM repo_scores");
      assert.equal(rows.length, 1);
      assert.equal(rows[0].tier, "trending");
      assert.strictEqual(rows[0].score, 0.9);
      assert.equal(rows[0].fake_star_flag, true);
      assert.deepEqual(rows[0].components, { velocity_lift: 0.5 });
      await upsertRepoScores(pool, []);
    });
  });

  describe("recordSourceRun and cursors", () => {
    it("recordSourceRun inserts a missing source (not displayable), then updates it (AC 7)", async () => {
      const t1 = new Date("2026-10-31T01:00:00Z");
      await recordSourceRun(pool, "gh_archive", "error", "boom", t1);
      let { rows } = await pool.query("SELECT * FROM sources");
      assert.equal(rows.length, 1);
      assert.equal(rows[0].last_status, "error");
      assert.equal(rows[0].last_error, "boom");
      assert.equal(rows[0].displayable, false);
      assert.equal(rows[0].last_run_at.toISOString(), t1.toISOString());

      await pool.query("UPDATE sources SET displayable = TRUE, name = 'GH Archive' WHERE id = 'gh_archive'");
      const t2 = new Date("2026-10-31T02:00:00Z");
      await recordSourceRun(pool, "gh_archive", "ok", null, t2);
      ({ rows } = await pool.query("SELECT * FROM sources"));
      assert.equal(rows.length, 1);
      assert.equal(rows[0].last_status, "ok");
      assert.equal(rows[0].last_error, null);
      assert.equal(rows[0].last_run_at.toISOString(), t2.toISOString());
      assert.equal(rows[0].name, "GH Archive", "registry fields untouched");
      assert.equal(rows[0].displayable, true);
    });

    it("getCursor / setCursor round-trip per source (AC 8)", async () => {
      assert.equal(await getCursor(pool, "gh_archive"), null);
      await setCursor(pool, "gh_archive", "2026-10-30");
      await setCursor(pool, "other", "x");
      await setCursor(pool, "gh_archive", "2026-10-31");
      assert.equal(await getCursor(pool, "gh_archive"), "2026-10-31");
      assert.equal(await getCursor(pool, "other"), "x");
    });
  });
});
