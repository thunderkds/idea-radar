import { test } from "node:test";
import assert from "node:assert/strict";
import * as core from "./index.js";
import { fakeStarConfig, isLowActivity, suspiciousShare, type StargazerAccount } from "./index.js";

test("T010 exports the lowkey components and normalisation, and they feed lowkeyScore", () => {
  for (const name of ["velocityLift", "activity", "contributors", "readmeQuality", "issueResponsiveness", "lowkeyComponents"]) {
    assert.equal(typeof (core as Record<string, unknown>)[name], "function", `${name} is not exported as a function`);
  }
  assert.equal(typeof core.lowkeyNormalisation, "object");
  assert.deepEqual(Object.keys(core.lowkeyNormalisation).sort(), ["activity", "contributors", "readme", "velocityLift"]);

  const components = core.lowkeyComponents({
    starsLast7d: 0,
    priorStars: 0,
    hasPriorHistory: true,
    pushes30d: core.lowkeyNormalisation.activity.fullEvents30d,
    prsOpened30d: 0,
    issuesOpened30d: 0,
    contributors: core.lowkeyNormalisation.contributors.fullContributors,
    readme: null,
  });
  assert.deepEqual(components, { velocityLift: 0, activity: 1, contributors: 1, readmeQuality: 0, issueResponsiveness: 0 });
  // 0.25 * 1 + 0.15 * 1
  assert.equal(core.lowkeyScore(components), 0.4);
});


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
