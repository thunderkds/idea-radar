import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { parseCsv } from "../packages/db/src/index.ts";
import { LABEL_USAGE, parseLabelArgs, runLabel } from "./label.ts";

/** A pool stand-in: answers the one lowkey-rows query with `n` rows, best score first. */
function fakePool(n: number) {
  const rows = Array.from({ length: n }, (_, i) => ({ repo_id: n - i, full_name: `o/r${n - i}`, score: (n - i) / 100 }));
  return { query: async () => ({ rows }) } as never;
}

test("parseLabelArgs returns the options for a good command line", () => {
  assert.deepEqual(parseLabelArgs(["--", "--date", "2026-10-31", "--out", "l.csv"]), {
    date: "2026-10-31", out: "l.csv", limit: undefined, top: undefined, seed: undefined,
  });
  assert.deepEqual(
    parseLabelArgs(["--date", "2026-10-31", "--out", "l.csv", "--limit", "20", "--top", "5", "--seed", "7"]),
    { date: "2026-10-31", out: "l.csv", limit: 20, top: 5, seed: 7 },
  );
});

test("parseLabelArgs returns null (usage) for a missing or malformed --date or a missing --out", () => {
  assert.equal(parseLabelArgs(["--out", "l.csv"]), null);
  assert.equal(parseLabelArgs(["--date", "31-10-2026", "--out", "l.csv"]), null);
  assert.equal(parseLabelArgs(["--date", "2026-10-31"]), null);
  assert.match(LABEL_USAGE, /pnpm label/);
});

test("parseLabelArgs lets parseArgs errors through", () => {
  assert.throws(() => parseLabelArgs(["--date"]), /missing value for --date/);
});

test("runLabel writes a CSV with the header, one row per repo and an empty label column", async () => {
  const dir = mkdtempSync(join(tmpdir(), "t010-label-"));
  try {
    const out = join(dir, "sheet.csv");
    const message = await runLabel(fakePool(6), { date: "2026-10-31", out, limit: 4, top: 2 });
    assert.equal(message, `wrote 4 lowkey rows of 2026-10-31 to ${out}`);
    const rows = parseCsv(readFileSync(out, "utf8"));
    assert.deepEqual(rows[0], ["repo_id", "full_name", "score", "url", "label"]);
    assert.equal(rows.length, 5);
    assert.ok(rows.slice(1).every((r) => r[3] === `https://github.com/${r[1]}` && r[4] === ""));
    const ids = rows.slice(1).map((r) => Number(r[0]));
    assert.ok(ids.includes(6) && ids.includes(5), "the top 2 rows are always in the sample");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
