import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import pg from "pg";
import { applyMigrations, listDueTracked, recordSnapshots, trackCandidates } from "./index.js";
import type { SnapshotInput } from "./index.js";

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

const DATE = "2026-10-30";
const NOW = new Date("2026-10-30T03:00:00Z");
const DAY_MS = 86_400_000;
const snap = (repoId: number, stars: number, o: Partial<SnapshotInput> = {}): SnapshotInput => ({
  repoId, stars, forks: 1, pushedAt: new Date("2026-10-29T10:00:00Z"), commits30d: 4, ...o,
});

describe("tracked repos and snapshots (needs TEST_DATABASE_URL)", { skip }, () => {
  const schema = `test_${randomBytes(6).toString("hex")}`;
  let admin: pg.Client;
  let pool: pg.Pool;

  const tracked = async () =>
    (
      await pool.query<Record<string, any>>(
        "SELECT repo_id, priority, added_reason, next_due_at::text AS due, last_snapshot_at FROM tracked_repos ORDER BY repo_id",
      )
    ).rows;
  const track = (repoId: number, priority: string, nextDue: string) =>
    pool.query("INSERT INTO tracked_repos (repo_id, priority, added_reason, next_due_at) VALUES ($1, $2, 'signal', $3)", [
      repoId, priority, nextDue,
    ]);

  before(async () => {
    admin = new pg.Client({ connectionString: url });
    await admin.connect();
    await admin.query(`CREATE SCHEMA ${schema}`);
    pool = new pg.Pool({ connectionString: url, options: `-c search_path=${schema}`, max: 4 });
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
    await pool.query("TRUNCATE tracked_repos, repo_snapshots, candidates");
  });

  describe("trackCandidates (AC 3)", () => {
    it("tracks every candidate of the date as normal and due now, with the candidate reason", async () => {
      await pool.query(
        "INSERT INTO candidates (date, repo_id, reason, priority) VALUES ($1, 1, 'velocity', 5), ($1, 2, 'signal', 3), ('2026-10-29', 3, 'signal', 9)",
        [DATE],
      );
      assert.equal(await trackCandidates(pool, DATE), 2);
      const rows = await tracked();
      assert.deepEqual(rows.map((r) => [r.repo_id, r.priority, r.added_reason, r.last_snapshot_at]), [
        [1, "normal", "velocity", null],
        [2, "normal", "signal", null],
      ]);
      assert.deepEqual(await listDueTracked(pool, new Date()), [1, 2], "a new repo is due now");
    });

    it("keeps the priority, reason and due time of a repo that is already tracked, and is safe to repeat", async () => {
      await track(1, "leader", "2026-11-05T00:00:00Z");
      await pool.query("INSERT INTO candidates (date, repo_id, reason, priority) VALUES ($1, 1, 'velocity', 5), ($1, 2, 'signal', 3)", [DATE]);
      assert.equal(await trackCandidates(pool, DATE), 1, "only the new repo is added");
      assert.equal(await trackCandidates(pool, DATE), 0);
      const rows = await tracked();
      assert.deepEqual(rows.map((r) => [r.repo_id, r.priority, r.added_reason]), [[1, "leader", "signal"], [2, "normal", "signal"]]);
      assert.match(rows[0]!.due, /^2026-11-05/);
    });
  });

  describe("listDueTracked (AC 5, 7)", () => {
    it("returns only repos due by now, oldest due first; a parked repo is due only when a request set its due time", async () => {
      await track(1, "normal", "2026-10-29T00:00:00Z");
      await track(2, "leader", "2026-10-20T00:00:00Z");
      await track(3, "normal", "2026-10-31T00:00:00Z"); // not due yet
      await track(4, "parked", "infinity"); // parked: only on request
      await track(5, "parked", "2026-10-30T02:00:00Z"); // a request made it due now
      assert.deepEqual(await listDueTracked(pool, NOW), [2, 1, 5]);
    });

    it("stops at the cap, taking the oldest due first", async () => {
      for (let i = 1; i <= 5; i++) await track(i, "normal", `2026-10-2${i}T00:00:00Z`);
      assert.deepEqual(await listDueTracked(pool, NOW, 3), [1, 2, 3]);
    });
  });

  describe("recordSnapshots (AC 5, 7)", () => {
    it("stores one snapshot per repo per day (rerun upserts) and moves the due time by priority cadence from the snapshot day", async () => {
      await track(1, "leader", "2026-10-29T00:00:00Z");
      await track(2, "normal", "2026-10-29T00:00:00Z");
      await track(3, "parked", "2026-10-30T02:00:00Z"); // requested
      await recordSnapshots(pool, DATE, [snap(1, 100), snap(2, 200), snap(3, 300)], [], NOW);
      await recordSnapshots(pool, DATE, [snap(1, 110, { commits30d: 9 })], [], NOW);

      const snaps = (await pool.query("SELECT repo_id, stars, forks, commits_30d FROM repo_snapshots ORDER BY repo_id")).rows;
      assert.deepEqual(snaps, [
        { repo_id: 1, stars: 110, forks: 1, commits_30d: 9 },
        { repo_id: 2, stars: 200, forks: 1, commits_30d: 4 },
        { repo_id: 3, stars: 300, forks: 1, commits_30d: 4 },
      ]);
      const day = Date.parse(`${DATE}T00:00:00Z`);
      const due = (await pool.query("SELECT repo_id, next_due_at, last_snapshot_at FROM tracked_repos ORDER BY repo_id")).rows;
      assert.equal(due[0].next_due_at.getTime(), day + 1 * DAY_MS, "leader: next day");
      assert.equal(due[1].next_due_at.getTime(), day + 7 * DAY_MS, "normal: next week");
      assert.equal(due[2].next_due_at.toString(), "Infinity", "parked: only on request again");
      assert.equal(due[0].last_snapshot_at.getTime(), NOW.getTime());
      // the next daily run (any time that day) finds the leader due again
      assert.deepEqual(await listDueTracked(pool, new Date("2026-10-31T00:00:05Z")), [1]);
    });

    it("sets a repo GitHub no longer returns to parked and not due, and stores no snapshot for it", async () => {
      await track(1, "leader", "2026-10-29T00:00:00Z");
      await recordSnapshots(pool, DATE, [], [1, 99], NOW);
      assert.deepEqual((await tracked()).map((r) => [r.repo_id, r.priority, r.due]), [[1, "parked", "infinity"]]);
      assert.equal((await pool.query("SELECT 1 FROM repo_snapshots")).rowCount, 0);
      assert.deepEqual(await listDueTracked(pool, NOW), []);
    });
  });

  describe("repo_star_gains view (AC 6, 7)", () => {
    const insert = (repoId: number, date: string, stars: number) =>
      pool.query("INSERT INTO repo_snapshots (repo_id, date, stars, forks, commits_30d) VALUES ($1, $2, $3, 0, 0)", [repoId, date, stars]);
    const gains = async (repoId: number) =>
      (await pool.query("SELECT date::text AS date, stars_new FROM repo_star_gains WHERE repo_id = $1 ORDER BY date", [repoId])).rows;

    it("spreads a difference evenly over the days since the previous snapshot: +70 in 7 days is 10 a day", async () => {
      await insert(1, "2026-10-23", 100);
      await insert(1, "2026-10-30", 170);
      const rows = await gains(1);
      assert.deepEqual(rows.map((r) => r.date), ["2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30"]);
      assert.ok(rows.every((r) => r.stars_new === 10));
    });

    it("an uneven difference still adds up exactly, and a loss of stars counts as 0", async () => {
      await insert(1, "2026-10-20", 10);
      await insert(1, "2026-10-23", 11); // +1 over 3 days
      await insert(1, "2026-10-25", 5); // -6: no gain
      await insert(1, "2026-10-26", 12); // +7 in 1 day
      const rows = await gains(1);
      assert.equal(rows.slice(0, 3).reduce((n, r) => n + r.stars_new, 0), 1);
      assert.deepEqual(rows.slice(3, 5).map((r) => r.stars_new), [0, 0]);
      assert.deepEqual(rows.slice(5), [{ date: "2026-10-26", stars_new: 7 }]);
    });

    it("a repo's first snapshot covers no day, and repos do not mix", async () => {
      await insert(1, "2026-10-30", 100);
      await insert(2, "2026-10-29", 50);
      await insert(2, "2026-10-30", 60);
      assert.deepEqual(await gains(1), []);
      assert.deepEqual(await gains(2), [{ date: "2026-10-30", stars_new: 10 }]);
    });
  });
});
