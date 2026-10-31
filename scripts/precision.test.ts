import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { PRECISION_USAGE, formatPrecision, parsePrecisionArgs, runPrecision } from "./precision.ts";

/** A pool stand-in: answers the top-k query with repo ids `n` down to 1 (best score first). */
function fakePool(n: number) {
  const rows = Array.from({ length: n }, (_, i) => ({ repo_id: n - i, full_name: `o/r${n - i}`, score: (n - i) / 100 }));
  return { query: async (_sql: string, params: unknown[]) => ({ rows: rows.slice(0, (params[1] as number | null) ?? n) }) } as never;
}

test("parsePrecisionArgs reads --date, --labels and an optional --k (default 50)", () => {
  assert.deepEqual(parsePrecisionArgs(["--", "--date", "2026-10-31", "--labels", "f.csv"]), {
    date: "2026-10-31", labels: "f.csv", k: 50,
  });
  assert.deepEqual(parsePrecisionArgs(["--date", "2026-10-31", "--labels", "f.csv", "--k", "3"]), {
    date: "2026-10-31", labels: "f.csv", k: 3,
  });
});

test("parsePrecisionArgs returns null (usage) for a missing or malformed --date or a missing --labels", () => {
  assert.equal(parsePrecisionArgs(["--labels", "f.csv"]), null);
  assert.equal(parsePrecisionArgs(["--date", "yesterday", "--labels", "f.csv"]), null);
  assert.equal(parsePrecisionArgs(["--date", "2026-10-31"]), null);
  assert.match(PRECISION_USAGE, /pnpm precision/);
});

test("formatPrecision prints the ratio to 3 places, with good / labelled and the top count", () => {
  const lines = formatPrecision({ k: 3, topCount: 3, labelled: 3, good: 2, precision: 2 / 3 }, "2026-10-31");
  assert.deepEqual(lines, [
    "precision@3 = 0.667 (2 good of 3 labelled)",
    "labelled 3 of the 3 top-scored lowkey rows of 2026-10-31",
  ]);
});

test("formatPrecision prints n/a when nothing in the top k is labelled", () => {
  const [first] = formatPrecision({ k: 50, topCount: 4, labelled: 0, good: 0, precision: null }, "2026-10-31");
  assert.equal(first, "precision@50 = n/a (none of the top rows is labelled) (0 good of 0 labelled)");
});

test("runPrecision reads a filled label sheet and reports precision@k of the top rows", async () => {
  const dir = mkdtempSync(join(tmpdir(), "t010-precision-"));
  try {
    const file = join(dir, "filled.csv");
    // top 3 of 6 are ids 6, 5, 4: two labelled (one good, one bad); id 1 is outside the top 3
    writeFileSync(file, "repo_id,full_name,score,url,label\n6,o/r6,0.06,u,good\n5,o/r5,0.05,u,bad\n4,o/r4,0.04,u,\n1,o/r1,0.01,u,good\n");
    const lines = await runPrecision(fakePool(6), { date: "2026-10-31", labels: file, k: 3 });
    assert.deepEqual(lines, [
      "precision@3 = 0.500 (1 good of 2 labelled)",
      "labelled 2 of the 3 top-scored lowkey rows of 2026-10-31",
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("runPrecision throws on an unknown label value", async () => {
  const dir = mkdtempSync(join(tmpdir(), "t010-precision-"));
  try {
    const file = join(dir, "bad.csv");
    writeFileSync(file, "repo_id,label\n6,maybe\n");
    await assert.rejects(runPrecision(fakePool(6), { date: "2026-10-31", labels: file, k: 3 }), /unknown label "maybe"/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
