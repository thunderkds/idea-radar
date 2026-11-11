import assert from "node:assert/strict";
import { test } from "node:test";
import { clampLimit, isRealDate } from "./index-store.js";

// The Postgres-backed store is tested through the MCP tools in server.test.ts (it needs TEST_DATABASE_URL).

test("clampLimit: default 20, range 1-100, whole numbers", () => {
  assert.equal(clampLimit(undefined), 20);
  assert.equal(clampLimit(0), 1);
  assert.equal(clampLimit(-5), 1);
  assert.equal(clampLimit(500), 100);
  assert.equal(clampLimit(7.9), 7);
  assert.equal(clampLimit(Number.NaN), 20);
});

test("isRealDate: YYYY-MM-DD calendar dates only", () => {
  assert.equal(isRealDate("2026-11-10"), true);
  assert.equal(isRealDate("2024-02-29"), true);
  assert.equal(isRealDate("2026-02-29"), false);
  assert.equal(isRealDate("2026-13-01"), false);
  assert.equal(isRealDate("2026-1-1"), false);
  assert.equal(isRealDate("yesterday"), false);
});
