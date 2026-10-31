import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyTier, consensusBoostFactor, consensusConfig, lowkeyScore, trackingConfig, type TierInput } from "./scoring.js";

const base: TierInput = {
  stars: 50,
  starsLast7d: 5,
  velocityPercentile: 0.5,
  positiveWeeks: 0,
  daysSincePush: 3,
  contributors: 3,
  hasReadme: true,
  listedByTrendingSource: false,
  velocityAboveBaseline: true,
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
  const tier = (over: Partial<TierInput>) => classifyTier({ ...base, ...over });

  it("classifies a small active multi-contributor repo as lowkey", () => {
    assert.equal(classifyTier(base), "lowkey");
  });

  it("classifies a top-velocity repo as trending", () => {
    assert.equal(tier({ velocityPercentile: 0.995 }), "trending");
  });

  it("classifies a large repo with steady growth as medium", () => {
    assert.equal(tier({ stars: 800, positiveWeeks: 6 }), "medium");
  });

  it("returns null when no tier matches", () => {
    assert.equal(tier({ hasReadme: false }), null);
  });

  describe("trending boundary", () => {
    it("needs the 99th percentile of 7-day velocity: 0.99 in, just below out", () => {
      assert.equal(tier({ stars: 800, velocityPercentile: 0.99 }), "trending");
      assert.equal(tier({ stars: 800, velocityPercentile: 0.9899 }), null);
    });

    it("a listing by a trending source is enough on its own", () => {
      assert.equal(tier({ stars: 800, listedByTrendingSource: true }), "trending");
      assert.equal(tier({ stars: 800, listedByTrendingSource: false }), null);
    });
  });

  describe("medium boundary", () => {
    it("needs 500 stars: 499 out, 500 in", () => {
      assert.equal(tier({ stars: 499, positiveWeeks: 4, hasReadme: false }), null);
      assert.equal(tier({ stars: 500, positiveWeeks: 4, hasReadme: false }), "medium");
    });

    it("needs 4 positive weeks: 3 out, 4 in", () => {
      assert.equal(tier({ stars: 500, positiveWeeks: 3 }), null);
      assert.equal(tier({ stars: 500, positiveWeeks: 4 }), "medium");
    });

    it("ignores the lowkey-only inputs", () => {
      assert.equal(
        tier({ stars: 500, positiveWeeks: 4, daysSincePush: 400, contributors: 0, hasReadme: false, velocityAboveBaseline: false }),
        "medium",
      );
    });
  });

  describe("lowkey boundary", () => {
    it("needs under 200 stars: 199 in, 200 out", () => {
      assert.equal(tier({ stars: 199 }), "lowkey");
      assert.equal(tier({ stars: 200 }), null);
    });

    it("needs a push within 30 days: 30 in, 31 out", () => {
      assert.equal(tier({ daysSincePush: 30 }), "lowkey");
      assert.equal(tier({ daysSincePush: 31 }), null);
      assert.equal(tier({ daysSincePush: Number.POSITIVE_INFINITY }), null);
    });

    it("needs 2 contributors: 1 out, 2 in", () => {
      assert.equal(tier({ contributors: 1 }), null);
      assert.equal(tier({ contributors: 2 }), "lowkey");
    });

    it("needs a README", () => {
      assert.equal(tier({ hasReadme: false }), null);
      assert.equal(tier({ hasReadme: true }), "lowkey");
    });

    it("needs velocity above the baseline: equal (false) out, above in", () => {
      assert.equal(tier({ velocityAboveBaseline: false }), null);
      assert.equal(tier({ velocityAboveBaseline: true }), "lowkey");
    });
  });

  describe("tier order", () => {
    it("trending beats medium and lowkey", () => {
      assert.equal(tier({ stars: 800, positiveWeeks: 6, velocityPercentile: 1 }), "trending");
      assert.equal(tier({ listedByTrendingSource: true }), "trending");
    });

    it("positive weeks alone do not make a small repo medium: it falls through to lowkey", () => {
      assert.equal(tier({ stars: 199, positiveWeeks: 6 }), "lowkey");
    });
  });
});

describe("consensusConfig and consensusBoostFactor", () => {
  const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

  it("is configured as a 7-day window and 0.1 per source beyond the first", () => {
    assert.equal(consensusConfig.windowDays, 7);
    assert.equal(consensusConfig.trendingBoostPerSource, 0.1);
  });

  it("is 1 for no source and for one source: a single source is no consensus", () => {
    assert.equal(consensusBoostFactor(0), 1);
    assert.equal(consensusBoostFactor(1), 1);
  });

  it("adds trendingBoostPerSource for each source beyond the first", () => {
    near(consensusBoostFactor(2), 1.1);
    near(consensusBoostFactor(5), 1.4);
  });

  it("never goes below 1, even for a negative count", () => {
    assert.equal(consensusBoostFactor(-3), 1);
  });
});

describe("trackingConfig (T024 AC 2)", () => {
  it("snapshots leaders daily, normal repos weekly, parked repos only on request", () => {
    assert.deepEqual(trackingConfig.cadenceDays, { leader: 1, normal: 7, parked: null });
  });

  it("batches 100 repos per query and caps a run at a whole number of batches", () => {
    assert.equal(trackingConfig.batchSize, 100);
    assert.ok(trackingConfig.dailyCap > 0 && trackingConfig.dailyCap % trackingConfig.batchSize === 0);
  });
});
