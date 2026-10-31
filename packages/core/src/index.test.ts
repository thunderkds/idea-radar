import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeStarConfig, isLowActivity, suspiciousShare, type StargazerAccount } from "./index.js";

const account = (o: Partial<StargazerAccount> = {}): StargazerAccount => ({
  starredAt: "2026-10-30T12:00:00Z",
  createdAt: "2025-01-01T00:00:00Z",
  publicRepos: 5,
  followers: 5,
  contributions: 50,
  ...o,
});

test("T011 exports isLowActivity, suspiciousShare and fakeStarConfig from the package entry", () => {
  assert.equal(typeof isLowActivity, "function");
  assert.equal(typeof suspiciousShare, "function");
  assert.deepEqual(fakeStarConfig, {
    burstStarsPerHour: 50,
    sampleSize: 100,
    minAccountAgeDays: 30,
    flagShare: 0.5,
  });
  const fresh = account({ createdAt: "2026-10-29T00:00:00Z" });
  assert.equal(isLowActivity(fresh), true);
  assert.equal(isLowActivity(account()), false);
  assert.equal(suspiciousShare([fresh, account()]), 0.5);
  assert.equal(suspiciousShare([]), null);
});
