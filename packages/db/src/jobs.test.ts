import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import pg from "pg";
import { applyMigrations, claimNext, completeJob, enqueueDue, failJob, MAX_JOB_ATTEMPTS } from "./index.js";

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

const T0 = new Date("2026-10-31T06:10:00Z");
const schedule = { hourly: ["gh_archive"], daily: ["ossinsight", "github_trending", "resolve_pending", "score"] };

describe("jobs queue (needs TEST_DATABASE_URL)", { skip }, () => {
  const schema = `test_${randomBytes(6).toString("hex")}`;
  let admin: pg.Client;
  let pool: pg.Pool;

  const rows = async (where = "TRUE") =>
    (await pool.query(`SELECT * FROM jobs WHERE ${where} ORDER BY id`)).rows as Record<string, any>[];
  const byName = async (name: string) => (await rows(`name = '${name}'`))[0]!;

  before(async () => {
    admin = new pg.Client({ connectionString: url });
    await admin.connect();
    await admin.query(`CREATE SCHEMA ${schema}`);
    pool = new pg.Pool({ connectionString: url, options: `-c search_path=${schema}`, max: 8 });
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
    const { rows: r } = await pool.query<{ s: string }>("SELECT current_schema() AS s");
    assert.equal(r[0]!.s, schema, "refusing to truncate outside the throwaway schema");
    await pool.query("TRUNCATE jobs");
  });

  describe("enqueueDue (AC 2)", () => {
    it("creates gh_archive per UTC hour and daily jobs per UTC date, and a second call adds nothing", async () => {
      assert.equal(await enqueueDue(pool, T0, schedule), 5);
      assert.equal(await enqueueDue(pool, T0, schedule), 0);
      assert.equal((await byName("gh_archive")).data_key, "2026-10-31T06");
      assert.equal((await byName("ossinsight")).data_key, "2026-10-31");
      // A later hour of the same day adds only the new hourly job.
      assert.equal(await enqueueDue(pool, new Date("2026-10-31T07:00:00Z"), schedule), 1);
      // A new day adds everything again.
      assert.equal(await enqueueDue(pool, new Date("2026-11-01T00:00:00Z"), schedule), 5);
      assert.equal((await rows()).length, 11);
    });

    it("never recreates a job that already ran", async () => {
      await enqueueDue(pool, T0, { hourly: [], daily: ["ossinsight"] });
      const job = (await claimNext(pool, {}, T0))!;
      await completeJob(pool, job.id, T0);
      assert.equal(await enqueueDue(pool, new Date("2026-10-31T23:00:00Z"), { hourly: [], daily: ["ossinsight"] }), 0);
      assert.equal((await byName("ossinsight")).status, "ok");
    });
  });

  describe("claimNext (AC 3)", () => {
    it("claims each job once, oldest first, and returns null when nothing is due", async () => {
      await enqueueDue(pool, T0, { hourly: [], daily: ["a", "b"] });
      const caps = { perName: { a: 1, b: 1 } };
      const first = await claimNext(pool, caps, T0);
      const second = await claimNext(pool, caps, T0);
      assert.deepEqual([first?.name, second?.name], ["a", "b"]);
      assert.equal(await claimNext(pool, caps, T0), null);
      assert.equal((await byName("a")).status, "running");
    });

    it("does not claim a job before its run_after", async () => {
      await enqueueDue(pool, T0, { hourly: [], daily: ["a"] });
      assert.equal(await claimNext(pool, {}, new Date("2026-10-31T06:00:00Z")), null);
    });

    it("honours the per-name cap", async () => {
      await pool.query("INSERT INTO jobs (name, data_key, run_after) VALUES ('a','1',$1),('a','2',$1),('b','1',$1)", [T0]);
      const caps = { perName: { a: 1, b: 1 } };
      assert.equal((await claimNext(pool, caps, T0))?.name, "a");
      // a is at its cap, so the next claim skips a/2 and takes b/1.
      assert.equal((await claimNext(pool, caps, T0))?.name, "b");
      assert.equal(await claimNext(pool, caps, T0), null);
      const done = (await byName("a")).id;
      await completeJob(pool, done, T0);
      assert.equal((await claimNext(pool, caps, T0))?.dataKey, "2");
    });

    it("honours the global cap", async () => {
      await pool.query("INSERT INTO jobs (name, data_key, run_after) VALUES ('a','1',$1),('b','1',$1),('c','1',$1)", [T0]);
      const caps = { global: 2, defaultPerName: 5 };
      assert.ok(await claimNext(pool, caps, T0));
      assert.ok(await claimNext(pool, caps, T0));
      assert.equal(await claimNext(pool, caps, T0), null);
    });

    it("never hands one job to two concurrent claimers and never exceeds the caps", async () => {
      const values = Array.from({ length: 12 }, (_, i) => `('a','${i}','${T0.toISOString()}')`).join(",");
      await pool.query(`INSERT INTO jobs (name, data_key, run_after) VALUES ${values}`);
      const caps = { global: 3, perName: { a: 3 } };
      const claimed = (await Promise.all(Array.from({ length: 8 }, () => claimNext(pool, caps, T0)))).filter(Boolean);
      assert.equal(claimed.length, 3);
      assert.equal(new Set(claimed.map((j) => j!.id)).size, 3);
      assert.equal((await rows("status = 'running'")).length, 3);
    });
  });

  describe("failJob (AC 4)", () => {
    it("adds an attempt, backs off exponentially (30s, 60s, ...) and keeps the error", async () => {
      await pool.query("INSERT INTO jobs (name, data_key, run_after) VALUES ('a','1',$1)", [T0]);
      let now = T0;
      for (const waitS of [30, 60, 120, 240]) {
        const job = (await claimNext(pool, {}, now))!;
        assert.equal(await failJob(pool, job.id, "boom", now), "pending");
        const row = await byName("a");
        assert.equal(row.status, "pending");
        assert.equal(row.last_error, "boom");
        assert.equal(row.run_after.getTime(), now.getTime() + waitS * 1000);
        assert.equal(await claimNext(pool, {}, new Date(now.getTime() + waitS * 1000 - 1)), null, "not due yet");
        now = new Date(now.getTime() + waitS * 1000);
      }
    });

    it(`ends as failed after ${MAX_JOB_ATTEMPTS} attempts and is never claimed again`, async () => {
      await pool.query("INSERT INTO jobs (name, data_key, run_after) VALUES ('a','1',$1)", [T0]);
      let status: string | null = null;
      let now = T0;
      for (let i = 0; i < MAX_JOB_ATTEMPTS; i++) {
        const job = (await claimNext(pool, {}, now))!;
        assert.ok(job, `attempt ${i + 1} claimable`);
        status = await failJob(pool, job.id, `err ${i}`, now);
        now = new Date(now.getTime() + 2 * 3_600_000);
      }
      assert.equal(status, "failed");
      const row = await byName("a");
      assert.equal(row.status, "failed");
      assert.equal(row.attempts, MAX_JOB_ATTEMPTS);
      assert.equal(row.last_error, `err ${MAX_JOB_ATTEMPTS - 1}`);
      assert.ok(row.finished_at);
      assert.equal(await claimNext(pool, {}, new Date(now.getTime() + 86_400_000)), null);
    });

    it("ignores a job that is not running", async () => {
      await pool.query("INSERT INTO jobs (name, data_key, run_after) VALUES ('a','1',$1)", [T0]);
      assert.equal(await failJob(pool, (await byName("a")).id, "x", T0), null);
      assert.equal((await byName("a")).attempts, 0);
    });
  });

  describe("stuck jobs (AC 5)", () => {
    const caps = { timeoutMs: { slow: 6 * 3_600_000 } };

    it("reclaims a running job past the default 2h timeout and counts it as a failed attempt", async () => {
      await pool.query("INSERT INTO jobs (name, data_key, run_after) VALUES ('a','1',$1)", [T0]);
      const first = (await claimNext(pool, caps, T0))!;
      assert.equal(await claimNext(pool, caps, new Date(T0.getTime() + 2 * 3_600_000 - 1000)), null, "still within timeout");
      const again = await claimNext(pool, caps, new Date(T0.getTime() + 2 * 3_600_000 + 1000));
      assert.equal(again?.id, first.id);
      assert.equal(again?.attempts, 1);
    });

    it("uses the per-name timeout (6h for a slow job)", async () => {
      await pool.query("INSERT INTO jobs (name, data_key, run_after) VALUES ('slow','1',$1)", [T0]);
      await claimNext(pool, caps, T0);
      assert.equal(await claimNext(pool, caps, new Date(T0.getTime() + 5 * 3_600_000)), null);
      assert.ok(await claimNext(pool, caps, new Date(T0.getTime() + 6 * 3_600_000 + 1000)));
    });

    it("does not count a stuck job against the caps", async () => {
      await pool.query("INSERT INTO jobs (name, data_key, run_after) VALUES ('a','1',$1),('a','2',$1)", [T0]);
      await claimNext(pool, { perName: { a: 1 } }, T0);
      const later = new Date(T0.getTime() + 3 * 3_600_000);
      assert.ok(await claimNext(pool, { perName: { a: 1 } }, later));
    });

    it("fails a stuck job that has used up its attempts", async () => {
      await pool.query(
        "INSERT INTO jobs (name, data_key, run_after, status, attempts, locked_at) VALUES ('a','1',$1,'running',$2,$1)",
        [T0, MAX_JOB_ATTEMPTS - 1],
      );
      assert.equal(await claimNext(pool, {}, new Date(T0.getTime() + 3 * 3_600_000)), null);
      const row = await byName("a");
      assert.equal(row.status, "failed");
      assert.equal(row.last_error, "lock timeout");
    });
  });

  describe("score ordering (AC 6)", () => {
    const names = { hourly: ["gh_archive"], daily: ["ossinsight", "score"] };
    const afterDelay = new Date("2026-10-31T03:00:00Z");
    const caps = { defaultPerName: 5 };

    it("is not claimable until every other job of its date is ok", async () => {
      await enqueueDue(pool, afterDelay, names);
      const claimed: string[] = [];
      // gh_archive (hour 03) and ossinsight are claimed; score stays blocked while they run.
      for (let i = 0; i < 3; i++) {
        const j = await claimNext(pool, caps, afterDelay);
        if (j) claimed.push(j.name);
      }
      assert.deepEqual(claimed.sort(), ["gh_archive", "ossinsight"]);
      assert.equal((await byName("score")).status, "pending");

      await completeJob(pool, (await byName("gh_archive")).id, afterDelay);
      assert.equal(await claimNext(pool, caps, afterDelay), null, "ossinsight still running");

      await completeJob(pool, (await byName("ossinsight")).id, afterDelay);
      assert.equal((await claimNext(pool, caps, afterDelay))?.name, "score");
    });

    it("stays blocked while an ingest job is failed or waiting for retry", async () => {
      await enqueueDue(pool, afterDelay, names);
      const gh = (await claimNext(pool, caps, afterDelay))!;
      assert.equal(gh.name, "gh_archive");
      await failJob(pool, gh.id, "x", afterDelay);
      const oss = (await claimNext(pool, caps, afterDelay))!;
      await completeJob(pool, oss.id, afterDelay);
      assert.equal(await claimNext(pool, caps, afterDelay), null);
    });

    it("ignores ingest jobs of other dates", async () => {
      await pool.query("INSERT INTO jobs (name, data_key, run_after) VALUES ('ossinsight','2026-10-30',$1)", [afterDelay]);
      await pool.query("INSERT INTO jobs (name, data_key, run_after) VALUES ('score','2026-10-31',$1)", [afterDelay]);
      const claimed = await claimNext(pool, { perName: { score: 1 }, defaultPerName: 1 }, afterDelay);
      assert.equal(claimed?.name, "ossinsight");
      assert.equal((await claimNext(pool, caps, afterDelay))?.name, "score");
    });

    it("is not due before 02:00 UTC of its date", async () => {
      await enqueueDue(pool, new Date("2026-10-31T00:05:00Z"), { hourly: [], daily: ["score"] });
      assert.equal(await claimNext(pool, caps, new Date("2026-10-31T01:59:00Z")), null);
      assert.equal((await claimNext(pool, caps, new Date("2026-10-31T02:00:00Z")))?.name, "score");
    });
  });
});
