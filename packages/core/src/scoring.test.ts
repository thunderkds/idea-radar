import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyTier, lowkeyScore, type TierInput } from "./scoring.js";

const base: TierInput = {
  stars: 50,
  starsLast7d: 5,
  velocityPercentile: 0.5,
  positiveWeeks: 0,
  daysSincePush: 3,
  contributors: 3,
  hasReadme: true,
  listedByTrendingSource: false,
};

describe("lowkeyScore", () => {
  it("is 1 when every component is 1 and 0 when every component is 0", () => {
    const ones = { velocityLift: 1, activity: 1, contributors: 1, readmeQuality: 1, issueResponsiveness: 1 };
    const zeros = { velocityLift: 0, activity: 0, contributors: 0, readmeQuality: 0, issueResponsiveness: 0 };
    assert.equal(lowkeyScore(ones), 1);
    assert.equal(lowkeyScore(zeros), 0);
  });

  it("clamps components to 0..1", () => {
    const wild = { velocityLift: 5, activity: -2, contributors: 0, readmeQuality: 0, issueResponsiveness: 0 };
    assert.equal(lowkeyScore(wild), 0.35);
  });
});

describe("classifyTier", () => {
  it("classifies a small active multi-contributor repo as lowkey", () => {
    assert.equal(classifyTier(base), "lowkey");
  });

  it("classifies a top-velocity repo as trending", () => {
    assert.equal(classifyTier({ ...base, velocityPercentile: 0.995 }), "trending");
  });

  it("classifies a large repo with steady growth as medium", () => {
    assert.equal(classifyTier({ ...base, stars: 800, positiveWeeks: 6 }), "medium");
  });

  it("returns null when no tier matches", () => {
    assert.equal(classifyTier({ ...base, hasReadme: false }), null);
  });
});
