import { test } from "node:test";
import assert from "node:assert/strict";
import * as db from "./index.js";

test("T015 exports applyConsensus, rollbackMigration and the consensus query functions", () => {
  for (const name of ["applyConsensus", "rollbackMigration", "listConsensus", "listTier", "getRepoDetail"] as const) {
    assert.equal(typeof db[name], "function", name);
  }
});
