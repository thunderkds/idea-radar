import { test } from "node:test";
import assert from "node:assert/strict";
import { applyFakeStarFlags, type Queryable } from "./index.js";

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
