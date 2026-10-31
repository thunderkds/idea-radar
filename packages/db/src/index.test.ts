import { test } from "node:test";
import assert from "node:assert/strict";
import * as db from "./index.js";
import { applyFakeStarFlags, type Queryable } from "./index.js";

test("T010 exports the label and precision tuning functions, and they round-trip a label sheet", () => {
  for (const name of ["sampleLowkeyForLabelling", "labelSheetCsv", "parseCsv", "parseLabels", "precisionAtK"]) {
    assert.equal(typeof (db as Record<string, unknown>)[name], "function", `${name} is not exported as a function`);
  }
  assert.deepEqual([...db.CSV_HEADER], ["repo_id", "full_name", "score", "url", "label"]);

  const sheet = db.labelSheetCsv([{ repoId: 7, fullName: "o/r", score: 0.5 }]);
  assert.deepEqual(db.parseCsv(sheet)[1], ["7", "o/r", "0.5", "https://github.com/o/r", ""]);
  const filled = sheet.replace(/,\n$/, ",good\n");
  assert.deepEqual([...db.parseLabels(filled)], [[7, true]]);
});


test("T011 exports applyFakeStarFlags from the package entry and it flags a burst repo with a suspicious sample", async () => {
  assert.equal(typeof applyFakeStarFlags, "function");
  const updates: unknown[][] = [];
  const db = {
    query: async (sql: string, params: unknown[]) => {
      if (sql.includes("UPDATE repo_scores")) {
        updates.push(params);
        return { rows: [] };
      }
      return { rows: [{ repo_id: 42, tier: "trending", score: 0.8 }] };
    },
  } as unknown as Queryable;
  const newAccount = {
    starredAt: "2026-10-30T12:00:00Z",
    createdAt: "2026-10-29T12:00:00Z",
    publicRepos: 1,
    followers: 1,
    contributions: 1,
  };
  const run = await applyFakeStarFlags(db, "2026-10-31", async () => [newAccount, newAccount]);
  assert.deepEqual(run, { checked: 1, flagged: 1 });
  assert.equal(updates.length, 1);
  assert.equal(updates[0]![0], 42);
  assert.equal(updates[0]![2], true);
});


test("T015 exports applyConsensus, rollbackMigration and the consensus query functions", () => {
  for (const name of ["applyConsensus", "rollbackMigration", "listConsensus", "listTier", "getRepoDetail"] as const) {
    assert.equal(typeof db[name], "function", name);
  }
});
