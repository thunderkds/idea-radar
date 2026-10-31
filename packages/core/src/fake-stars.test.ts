import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isLowActivity, suspiciousShare, type StargazerAccount } from "./fake-stars.js";
import { fakeStarConfig } from "./scoring.js";

const STARRED = "2026-10-30T12:00:00Z";
const daysBefore = (days: number) => new Date(Date.parse(STARRED) - days * 86_400_000).toISOString();

/** An active, old account; `o` overrides one fact at a time. */
const account = (o: Partial<StargazerAccount> = {}): StargazerAccount => ({
  starredAt: STARRED,
  createdAt: daysBefore(400),
  publicRepos: 5,
  followers: 5,
  contributions: 50,
  ...o,
});

describe("isLowActivity", () => {
  it("a healthy old account is not low-activity", () => assert.equal(isLowActivity(account()), false));

  it("account age: 29 days is low-activity, 30 days is not", () => {
    assert.equal(isLowActivity(account({ createdAt: daysBefore(29) })), true);
    assert.equal(isLowActivity(account({ createdAt: daysBefore(30) })), false);
  });

  it("age is measured at the star time, not now", () => {
    // Created 40 days before it starred: old enough then, whatever the date today.
    assert.equal(isLowActivity(account({ createdAt: daysBefore(40) })), false);
  });

  it("no public activity needs all three to be 0", () => {
    const none = { publicRepos: 0, followers: 0, contributions: 0 };
    assert.equal(isLowActivity(account(none)), true);
    assert.equal(isLowActivity(account({ ...none, publicRepos: 1 })), false);
    assert.equal(isLowActivity(account({ ...none, followers: 1 })), false);
    assert.equal(isLowActivity(account({ ...none, contributions: 1 })), false);
  });

  it("uses the minAccountAgeDays of the config it is given", () => {
    assert.equal(isLowActivity(account({ createdAt: daysBefore(40) }), { minAccountAgeDays: 60 }), true);
  });
});

describe("suspiciousShare", () => {
  it("is null for an empty sample", () => assert.equal(suspiciousShare([]), null));

  it("is the low-activity fraction of the sample", () => {
    const sample = [account({ createdAt: daysBefore(1) }), account(), account(), account()];
    assert.equal(suspiciousShare(sample), 0.25);
  });

  it("the default config flags at half", () => assert.equal(fakeStarConfig.flagShare, 0.5));
});
