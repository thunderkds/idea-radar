import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import pg from "pg";
import { applyMigrations, listDueTracked, recordSnapshots, regroupTracked, trackCandidates } from "./index.js";
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
    await pool.query("TRUNCATE tracked_repos, repo_snapshots, candidates, repos, repo_content, repo_scores");
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
      // repos 1 and 2 were snapshotted before, so today is not a first snapshot (see the first-snapshot test below)
      await pool.query("INSERT INTO repo_snapshots (repo_id, date, stars, forks, commits_30d) VALUES (1, '2026-10-20', 90, 0, 0), (2, '2026-10-20', 190, 0, 0)");
      await recordSnapshots(pool, DATE, [snap(1, 100), snap(2, 200), snap(3, 300)], [], NOW);
      await recordSnapshots(pool, DATE, [snap(1, 110, { commits30d: 9 })], [], NOW);

      const snaps = (await pool.query("SELECT repo_id, stars, forks, commits_30d FROM repo_snapshots WHERE date = $1 ORDER BY repo_id", [DATE])).rows;
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

    it("a repo with exactly one snapshot is due the next UTC day whatever its priority, a parked one stays on request (T026 AC 6)", async () => {
      await track(1, "normal", "2026-10-29T00:00:00Z");
      await track(2, "leader", "2026-10-29T00:00:00Z");
      await track(3, "parked", "2026-10-30T02:00:00Z"); // requested
      await recordSnapshots(pool, DATE, [snap(1, 100), snap(2, 200), snap(3, 300)], [], NOW);
      const day = Date.parse(`${DATE}T00:00:00Z`);
      const dueAt = async () => (await pool.query("SELECT next_due_at FROM tracked_repos ORDER BY repo_id")).rows.map((r) => (r.next_due_at === Infinity ? Infinity : r.next_due_at.getTime()));
      assert.deepEqual(await dueAt(), [day + DAY_MS, day + DAY_MS, Infinity]);
      // the rerun of the same day still sees one snapshot: same result
      await recordSnapshots(pool, DATE, [snap(1, 101)], [], new Date("2026-10-30T04:00:00Z"));
      assert.deepEqual(await dueAt(), [day + DAY_MS, day + DAY_MS, Infinity]);
      // so a normal repo shows velocity after 1 day: its second snapshot is the next day, and it then waits a week
      assert.deepEqual(await listDueTracked(pool, new Date("2026-10-31T00:00:05Z")), [1, 2]);
      await recordSnapshots(pool, "2026-10-31", [snap(1, 111)], [], new Date("2026-10-31T03:00:00Z"));
      assert.equal((await dueAt())[0], Date.parse("2026-10-31T00:00:00Z") + 7 * DAY_MS, "second snapshot: back to the normal cadence");
      assert.equal((await pool.query("SELECT stars_new FROM repo_star_gains WHERE repo_id = 1")).rows[0].stars_new, 10);
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

  describe("regroupTracked (T026 AC 3, 4, 5)", () => {
    const REGROUP_DATE = "2026-11-02";
    const REGROUP_NOW = new Date("2026-11-02T01:00:00Z");
    interface Spec {
      topics?: string[];
      stack?: string[];
      archived?: boolean;
      score?: number;
      commits?: number;
      snapshotDate?: string;
      /** `tracked_repos.last_snapshot_at`: the repo was snapshotted at some time (set with `commits` too). */
      snapshotted?: string;
      priority?: string;
      due?: string;
    }
    /** One tracked repo with the data the regroup reads. */
    const add = async (id: number, o: Spec = {}) => {
      await pool.query("INSERT INTO repos (repo_id, full_name, topics, archived) VALUES ($1, $2, $3, $4)", [
        id, `o/r${id}`, o.topics ?? ["rag", "vector-database"], o.archived ?? false,
      ]);
      await pool.query("INSERT INTO repo_content (repo_id, stack_tags) VALUES ($1, $2)", [id, o.stack ?? ["python"]]);
      await pool.query("INSERT INTO tracked_repos (repo_id, priority, added_reason, next_due_at) VALUES ($1, $2, 'signal', $3)", [
        id, o.priority ?? "normal", o.due ?? "2026-11-09T00:00:00Z",
      ]);
      if (o.score !== undefined) {
        await pool.query("INSERT INTO repo_scores (repo_id, date, tier, score) VALUES ($1, '2026-11-01', 'lowkey', $2)", [id, o.score]);
      }
      if (o.commits !== undefined) {
        await pool.query("INSERT INTO repo_snapshots (repo_id, date, stars, forks, commits_30d) VALUES ($1, $2, 10, 0, $3)", [
          id, o.snapshotDate ?? "2026-11-01", o.commits,
        ]);
      }
      const snapshotted = o.snapshotted ?? (o.commits !== undefined ? (o.snapshotDate ?? "2026-11-01") : undefined);
      if (snapshotted) await pool.query("UPDATE tracked_repos SET last_snapshot_at = $2 WHERE repo_id = $1", [id, `${snapshotted}T03:00:00Z`]);
    };
    const state = async () =>
      Object.fromEntries(
        (await pool.query("SELECT repo_id, priority, group_key, next_due_at FROM tracked_repos ORDER BY repo_id")).rows.map((r) => [r.repo_id, r]),
      ) as Record<number, { priority: string; group_key: string | null; next_due_at: Date }>;
    const priorities = async () => Object.values(await state()).map((r) => r.priority);

    it("10 repos of one idea, 2 active: those 2 become leader, the other 8 normal, and the group key is set", async () => {
      for (let i = 1; i <= 10; i++) {
        await add(i, {
          topics: i % 2 ? ["Vector-Database", "RAG", "awesome"] : ["rag", "hacktoberfest", "vector-database"],
          ...(i === 3 ? { score: 0.9, commits: 30 } : i === 8 ? { score: 0.4, commits: 12 } : { commits: 0 }),
        });
      }
      const res = await regroupTracked(pool, REGROUP_DATE, REGROUP_NOW);
      assert.deepEqual(res, { tracked: 10, groups: 1, leaders: 2, normal: 8, parked: 0, promoted: 2 });
      const st = await state();
      assert.deepEqual((await priorities()).filter((p) => p === "leader").length, 2);
      assert.equal(st[3]!.priority, "leader");
      assert.equal(st[8]!.priority, "leader");
      assert.ok(Object.values(st).every((r) => r.group_key === "rag+vector-database|python"));
    });

    it("only active repos lead: one active repo gives one leader, no activity gives none", async () => {
      await add(1, { score: 0.5, commits: 3 });
      await add(2, { commits: 0 });
      await add(3, { commits: 0 });
      await regroupTracked(pool, REGROUP_DATE, REGROUP_NOW);
      assert.deepEqual(await priorities(), ["leader", "normal", "normal"]);
      await pool.query("TRUNCATE tracked_repos, repo_scores, repo_snapshots");
      await pool.query("INSERT INTO tracked_repos (repo_id, added_reason) VALUES (2, 'signal'), (3, 'signal')");
      await pool.query("INSERT INTO repo_snapshots (repo_id, date, stars, forks, commits_30d) VALUES (2, '2026-11-01', 5, 0, 0), (3, '2026-11-01', 5, 0, 0)");
      await regroupTracked(pool, REGROUP_DATE, REGROUP_NOW);
      assert.deepEqual(await priorities(), ["normal", "normal"]);
    });

    it("ranks by the weighted, group-normalised score and commits (weights from the config)", async () => {
      await add(1, { score: 1000, commits: 0 }); // 0.6
      await add(2, { score: 0, commits: 50 }); // 0.4
      await add(3, { score: 900, commits: 10 }); // 0.54 + 0.08 = 0.62
      await regroupTracked(pool, REGROUP_DATE, REGROUP_NOW);
      assert.deepEqual(await priorities(), ["leader", "normal", "leader"]);
    });

    it("an archived repo is parked and not due; so is a repo with no score and no snapshot in 30 days", async () => {
      await add(1, { archived: true, score: 0.9, commits: 40 });
      await add(2, { snapshotted: "2026-09-01" }); // snapshotted long ago, nothing since, never scored
      await add(3, { commits: 5, snapshotDate: "2026-09-30" }); // last snapshot 33 days ago, no score
      await add(4, { score: 0.5, commits: 5 }); // active: stays in the group
      await regroupTracked(pool, REGROUP_DATE, REGROUP_NOW);
      const st = await state();
      assert.deepEqual([1, 2, 3, 4].map((i) => st[i]!.priority), ["parked", "parked", "parked", "leader"]);
      for (const i of [1, 2, 3]) assert.equal(st[i]!.next_due_at.toString(), "Infinity", `repo ${i}: only on request`);
      assert.deepEqual(await listDueTracked(pool, new Date("2026-12-31T00:00:00Z")), [4]);
    });

    it("a repo never snapshotted is not parked for inactivity: a new tracked repo stays normal and due (R1.1)", async () => {
      await add(1, { due: "2026-11-02T00:30:00Z" }); // added today by discovery: no score, no snapshot yet
      await add(2, { archived: true, due: "2026-11-02T00:30:00Z" }); // archived still parks
      await pool.query("UPDATE tracked_repos SET added_at = $1", [new Date("2026-11-02T00:30:00Z")]);
      await regroupTracked(pool, REGROUP_DATE, REGROUP_NOW);
      const st = await state();
      assert.equal(st[1]!.priority, "normal");
      assert.equal(st[1]!.next_due_at.toISOString(), "2026-11-02T00:30:00.000Z", "due time untouched");
      assert.equal(st[1]!.group_key, "rag+vector-database|python");
      assert.equal(st[2]!.priority, "parked");
      assert.deepEqual(await listDueTracked(pool, new Date("2026-11-02T06:00:00Z")), [1]);
    });

    it("a parked repo that a request made due keeps that due time; one that became active is due now and rejoins its group", async () => {
      await add(1, { priority: "parked", due: "2026-11-01T12:00:00Z" }); // requested, no data yet
      await add(2, { priority: "parked", due: "infinity", commits: 4 }); // now has a recent snapshot, no score
      await regroupTracked(pool, REGROUP_DATE, REGROUP_NOW);
      const st = await state();
      assert.equal(st[1]!.priority, "parked");
      assert.equal(st[1]!.next_due_at.toISOString(), "2026-11-01T12:00:00.000Z");
      assert.equal(st[2]!.priority, "leader", "active again, and the only active repo of its group");
      assert.equal(st[2]!.next_due_at.getTime(), REGROUP_NOW.getTime());
    });

    it("two idea groups stay independent: each has its own leaders", async () => {
      await add(1, { topics: ["rag", "vector-database"], score: 0.9, commits: 9 });
      await add(2, { topics: ["rag", "vector-database"], score: 0.1, commits: 1 });
      await add(3, { topics: ["rag", "vector-database"], score: 0.05, commits: 1 });
      await add(4, { topics: ["terminal-ui"], score: 0.2, commits: 2 });
      await add(5, { topics: ["terminal-ui"], commits: 0 });
      await add(6, { topics: ["terminal-ui"], commits: 0 });
      const res = await regroupTracked(pool, REGROUP_DATE, REGROUP_NOW);
      assert.equal(res.groups, 2);
      assert.deepEqual(await priorities(), ["leader", "leader", "normal", "leader", "normal", "normal"]);
      const st = await state();
      assert.deepEqual([st[1]!.group_key, st[4]!.group_key], ["rag+vector-database|python", "terminal-ui|python"]);
    });

    it("a repo with no group key keeps its own priority and gets a null key", async () => {
      await add(1, { topics: ["awesome"], priority: "leader", score: 0.3, commits: 3 });
      await add(2, { topics: [], priority: "normal", commits: 0 });
      await add(3, { topics: ["rag"], score: 0.3, commits: 3 });
      await pool.query("INSERT INTO tracked_repos (repo_id, added_reason) VALUES (4, 'signal')"); // no repos row at all
      await pool.query("INSERT INTO repo_snapshots (repo_id, date, stars, forks, commits_30d) VALUES (4, '2026-11-01', 1, 0, 1)");
      await regroupTracked(pool, REGROUP_DATE, REGROUP_NOW);
      const st = await state();
      assert.deepEqual([1, 2, 3, 4].map((i) => st[i]!.group_key), [null, null, "rag|python", null]);
      assert.deepEqual([1, 2, 3, 4].map((i) => st[i]!.priority), ["leader", "normal", "leader", "normal"]);
    });

    it("a new leader is due now; a demoted repo keeps its due time (AC 4)", async () => {
      await add(1, { priority: "leader", due: "2026-11-03T00:00:00Z", score: 0.1, commits: 1 });
      await add(2, { priority: "leader", due: "2026-11-03T00:00:00Z", score: 0.2, commits: 2 });
      await add(3, { priority: "normal", due: "2026-11-09T00:00:00Z", score: 0.9, commits: 20 });
      await regroupTracked(pool, REGROUP_DATE, REGROUP_NOW);
      let st = await state();
      assert.deepEqual([1, 2, 3].map((i) => st[i]!.priority), ["normal", "leader", "leader"]);
      assert.equal(st[3]!.next_due_at.getTime(), REGROUP_NOW.getTime(), "promoted: due now");
      assert.equal(st[2]!.next_due_at.toISOString(), "2026-11-03T00:00:00.000Z", "still leader: untouched");
      assert.equal(st[1]!.next_due_at.toISOString(), "2026-11-03T00:00:00.000Z", "demoted: keeps its due time");
      // a leader that was due earlier than now stays that early
      await pool.query("UPDATE tracked_repos SET priority = 'normal', next_due_at = '2026-10-01T00:00:00Z' WHERE repo_id = 3");
      await regroupTracked(pool, REGROUP_DATE, REGROUP_NOW);
      st = await state();
      assert.equal(st[3]!.next_due_at.toISOString(), "2026-10-01T00:00:00.000Z");
    });

    it("is idempotent: a rerun changes nothing", async () => {
      for (let i = 1; i <= 5; i++) await add(i, { score: i / 10, commits: i });
      await add(6, { archived: true });
      const first = await regroupTracked(pool, REGROUP_DATE, REGROUP_NOW);
      const before = JSON.stringify(await state());
      const second = await regroupTracked(pool, REGROUP_DATE, new Date("2026-11-02T05:00:00Z"));
      assert.equal(JSON.stringify(await state()), before);
      assert.deepEqual({ ...second, promoted: 0 }, { ...first, promoted: 0 });
      assert.equal(second.promoted, 0, "no one is newly promoted the second time");
    });
  });
});
