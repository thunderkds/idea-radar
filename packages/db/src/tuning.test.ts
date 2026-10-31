import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { applyMigrations, labelSheetCsv, parseCsv, parseLabels, precisionAtK, sampleLowkeyForLabelling } from "./index.js";

const url = process.env.TEST_DATABASE_URL;
const DATE = "2026-10-31";
const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

describe("label sheet and label parsing (no database)", () => {
  it("writes the header, one row per repo, an empty label and a GitHub URL; quotes odd names", () => {
    const csv = labelSheetCsv([
      { repoId: 7, fullName: "o/r", score: 0.5 },
      { repoId: 8, fullName: 'a,"b"/c', score: 0.25 },
    ]);
    assert.deepEqual(parseCsv(csv), [
      ["repo_id", "full_name", "score", "url", "label"],
      ["7", "o/r", "0.5", "https://github.com/o/r", ""],
      ["8", 'a,"b"/c', "0.25", 'https://github.com/a,"b"/c', ""],
    ]);
  });
  it("reads good/bad labels in several spellings and skips empty ones", () => {
    const labels = parseLabels(
      "repo_id,full_name,score,url,label\r\n1,a/a,1,u,good\r\n2,b/b,1,u,BAD\n3,c/c,1,u,\n4,d/d,1,u,1\n5,e/e,1,u, no \n",
    );
    assert.deepEqual([...labels], [[1, true], [2, false], [4, true], [5, false]]);
  });
  it("throws on an unknown label, a bad repo_id, a missing column, or an empty file", () => {
    assert.throws(() => parseLabels("repo_id,label\n1,maybe\n"), /unknown label "maybe"/);
    assert.throws(() => parseLabels("repo_id,label\nx,good\n"), /bad repo_id/);
    assert.throws(() => parseLabels("repo_id,full_name\n1,a\n"), /no "label" column/);
    assert.throws(() => parseLabels(""), /empty/);
  });
});

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

describe("label export and precision@50 (needs TEST_DATABASE_URL)", { skip }, () => {
  const schema = `test_${randomBytes(6).toString("hex")}`;
  let admin: pg.Client;
  let pool: pg.Pool;
  let dir: string;

  /** 120 lowkey rows: repo_id n has score n / 1000; the top 50 are ids 71..120. */
  async function seed() {
    await pool.query("INSERT INTO repos (repo_id, full_name) SELECT n, 'o/r' || n FROM generate_series(1, 121) n");
    await pool.query(
      `INSERT INTO repo_scores (repo_id, date, tier, score)
       SELECT n, $1::date, 'lowkey', n / 1000.0 FROM generate_series(1, 120) n`,
      [DATE],
    );
    // other tiers and dates must not leak into the sheet or the ranking
    await pool.query("INSERT INTO repo_scores (repo_id, date, tier, score) VALUES (121, $1, 'trending', 99)", [DATE]);
    await pool.query("INSERT INTO repo_scores (repo_id, date, tier, score) VALUES (1, '2026-10-30', 'lowkey', 99)");
  }

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
    dir = mkdtempSync(join(tmpdir(), "t010-"));
  });

  after(async () => {
    await pool?.end();
    await admin?.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin?.end();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    const { rows } = await pool.query<{ s: string }>("SELECT current_schema() AS s");
    assert.equal(rows[0]!.s, schema, "refusing to truncate outside the throwaway schema");
    await pool.query("TRUNCATE repo_scores, repos");
    await seed();
  });

  it("samples limit rows: the top 50 plus a seeded random rest, lowkey rows of that date only", async () => {
    const rows = await sampleLowkeyForLabelling(pool, DATE, { limit: 80 });
    assert.equal(rows.length, 80);
    assert.equal(new Set(rows.map((r) => r.repoId)).size, 80);
    const ids = new Set(rows.map((r) => r.repoId));
    for (let id = 71; id <= 120; id++) assert.ok(ids.has(id), `top row ${id} is missing`);
    assert.ok(!ids.has(121), "trending row leaked");
    assert.ok(rows.some((r) => r.repoId <= 70), "no sampled rest");
    // order does not leak the rank: not simply sorted by score
    assert.notDeepEqual(rows.map((r) => r.repoId), [...rows.map((r) => r.repoId)].sort((a, b) => b - a));
  });

  it("is repeatable for one seed and differs for another; a short date returns all rows", async () => {
    const a = await sampleLowkeyForLabelling(pool, DATE, { limit: 80, seed: 1 });
    const b = await sampleLowkeyForLabelling(pool, DATE, { limit: 80, seed: 1 });
    const c = await sampleLowkeyForLabelling(pool, DATE, { limit: 80, seed: 2 });
    assert.deepEqual(a, b);
    assert.notDeepEqual(a.map((r) => r.repoId), c.map((r) => r.repoId));
    assert.equal((await sampleLowkeyForLabelling(pool, DATE)).length, 120); // default 200 > 120 rows
    assert.deepEqual(await sampleLowkeyForLabelling(pool, "2026-01-01"), []);
  });

  it("precision@50 is the good share of the labelled rows among the top 50", async () => {
    // top 50 are ids 71..120; label 4 of them (3 good) and a row outside the top (ignored)
    const labels = new Map<number, boolean>([[120, true], [119, true], [118, false], [71, true], [5, true]]);
    const r = await precisionAtK(pool, DATE, labels);
    assert.deepEqual(r, { k: 50, topCount: 50, labelled: 4, good: 3, precision: 0.75 });
    // 70 is rank 51: outside the top 50
    assert.equal((await precisionAtK(pool, DATE, new Map([[70, true]]))).labelled, 0);
    assert.equal((await precisionAtK(pool, DATE, new Map())).precision, null);
  });

  it("scripts: pnpm label then pnpm precision on a tiny label file", () => {
    const env = { ...process.env, DATABASE_URL: `${url}${url!.includes("?") ? "&" : "?"}options=-c%20search_path%3D${schema}` };
    const run = (script: string, args: string[]) =>
      execFileSync(process.execPath, ["--import", "tsx", "--conditions=source", join(repoRoot, "scripts", script), ...args], {
        cwd: repoRoot, env, encoding: "utf8",
      });

    const sheet = join(dir, "labels.csv");
    const out = run("label.ts", ["--", "--date", DATE, "--out", sheet, "--limit", "60"]);
    assert.match(out, /wrote 60 lowkey rows/);
    const rows = parseCsv(readFileSync(sheet, "utf8"));
    assert.deepEqual(rows[0], ["repo_id", "full_name", "score", "url", "label"]);
    assert.equal(rows.length, 61);
    assert.ok(rows.slice(1).every((r) => r[4] === ""), "label column must start empty");

    const filled = join(dir, "filled.csv");
    writeFileSync(filled, "repo_id,full_name,score,url,label\n120,o/r120,0.12,u,good\n119,o/r119,0.119,u,bad\n118,o/r118,0.118,u,\n");
    const report = run("precision.ts", ["--", "--date", DATE, "--labels", filled]);
    assert.match(report, /precision@50 = 0\.500 \(1 good of 2 labelled\)/);
    assert.match(report, /labelled 2 of the 50 top-scored/);

    assert.throws(() => run("precision.ts", ["--date", DATE]), /usage|Command failed/);
  });
});
