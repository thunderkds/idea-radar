import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  activity,
  contributors,
  issueResponsiveness,
  lowkeyComponents,
  readmeQuality,
  velocityLift,
  type LowkeyInput,
} from "./lowkey.js";
import { lowkeyNormalisation, lowkeyScore } from "./scoring.js";

const close = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} is not ${expected}`);

describe("velocityLift", () => {
  // Prior 83 stars in 83 days = 1 a day, above the 0.1 floor.
  const lift = (starsLast7d: number, priorStars = 83) => velocityLift({ starsLast7d, priorStars, hasPriorHistory: true });

  it("is 0 when the 7-day rate equals or is below the baseline", () => {
    close(lift(7), 0); // lift 1
    close(lift(0), 0);
  });
  it("is 1 at the configured full lift and stays 1 above it", () => {
    close(lift(7 * lowkeyNormalisation.velocityLift.fullLift), 1);
    close(lift(700), 1);
  });
  it("grows between the two points", () => {
    close(lift(21), 0.5); // lift 3 of 5
    assert.ok(lift(14) < lift(21));
  });
  it("floors the baseline so one star on a zero baseline is not a full lift", () => {
    close(velocityLift({ starsLast7d: 1, priorStars: 0, hasPriorHistory: true }), (1 / 7 / 0.1 - 1) / 4);
    close(velocityLift({ starsLast7d: 0, priorStars: 0, hasPriorHistory: true }), 0);
  });
  it("uses the configured value, not 1, when there is no prior history", () => {
    const v = velocityLift({ starsLast7d: 100, priorStars: 0, hasPriorHistory: false });
    close(v, lowkeyNormalisation.velocityLift.noHistory);
    assert.notEqual(v, 1);
  });
});

describe("activity", () => {
  const events = (pushes30d: number, prsOpened30d = 0, issuesOpened30d = 0) =>
    activity({ pushes30d, prsOpened30d, issuesOpened30d });
  it("is 0 with no events, 1 at the full count and above", () => {
    close(events(0), 0);
    close(events(30), 1);
    close(events(100, 100, 100), 1);
  });
  it("sums pushes, PRs and issues", () => {
    close(events(5, 5, 5), 0.5);
  });
});

describe("contributors", () => {
  it("is 0 for none, proportional below the full count, 1 at and above it", () => {
    close(contributors({ contributors: 0 }), 0);
    close(contributors({ contributors: 2 }), 0.4);
    close(contributors({ contributors: 5 }), 1);
    close(contributors({ contributors: 50 }), 1);
  });
});

describe("readmeQuality", () => {
  const filler = (chars: number) => "x".repeat(chars);
  const good = [
    "# Project",
    filler(800),
    "## Installation",
    "```sh",
    "# not a heading",
    "npm i project",
    "```",
    "## Usage",
    filler(800),
    "## API",
    "## Contributing",
    "## License",
  ].join("\n");
  const bare = "A small tool.";
  const headingsOnly = "# Project\n## Install\n## Usage\n";

  it("is 0 for an empty, whitespace or missing README", () => {
    assert.equal(readmeQuality(""), 0);
    assert.equal(readmeQuality("  \n\t "), 0);
    assert.equal(readmeQuality(null), 0);
    assert.equal(readmeQuality(undefined), 0);
  });
  it("is 1 for a long README with 5+ headings and install and usage sections", () => {
    close(readmeQuality(good), 1);
  });
  it("scores a bare README by length alone", () => {
    close(readmeQuality(bare), (0.4 * bare.length) / 1500);
  });
  it("scores a headings-only README below the good one and above the bare one", () => {
    const q = readmeQuality(headingsOnly);
    close(q, 0.4 * (headingsOnly.trim().length / 1500) + 0.3 * (3 / 5) + 0.15 + 0.15);
    assert.ok(q < readmeQuality(good) && q > readmeQuality(bare));
  });
  it("matches install and usage headings case-insensitively, with the listed spellings", () => {
    for (const h of ["Install", "INSTALLATION", "Getting Started"]) {
      assert.ok(readmeQuality(`## ${h}`) > readmeQuality("## Overview"), h);
    }
    for (const h of ["usage", "Quick start", "QUICKSTART"]) {
      assert.ok(readmeQuality(`## ${h}`) > readmeQuality("## Overview"), h);
    }
  });
  it("does not count install or usage words outside a heading, or '#' lines inside a code fence", () => {
    const prose = "Install it and read the usage notes.";
    close(readmeQuality(prose), (0.4 * prose.length) / 1500);
    const fenced = "```sh\n# Install\n# Usage\n```";
    close(readmeQuality(fenced), (0.4 * fenced.length) / 1500);
  });
  it("does not treat '#hashtag' without a space as a heading", () => {
    close(readmeQuality("#Install"), (0.4 * "#Install".length) / 1500);
  });
});

describe("issueResponsiveness", () => {
  it("is 0 for missing input and clamps a given rate to 0..1", () => {
    assert.equal(issueResponsiveness(), 0);
    assert.equal(issueResponsiveness(0), 0);
    assert.equal(issueResponsiveness(0.5), 0.5);
    assert.equal(issueResponsiveness(1), 1);
    assert.equal(issueResponsiveness(3), 1);
    assert.equal(issueResponsiveness(-1), 0);
    assert.equal(issueResponsiveness(Number.NaN), 0);
  });
});

describe("lowkeyComponents", () => {
  const base: LowkeyInput = {
    starsLast7d: 35, priorStars: 83, hasPriorHistory: true,
    pushes30d: 10, prsOpened30d: 10, issuesOpened30d: 10,
    contributors: 5, readme: "# A\n## Install\n## Usage\n", issueResponseRate: 1,
  };

  it("returns the five components, all within 0..1", () => {
    const c = lowkeyComponents(base);
    assert.deepEqual(Object.keys(c).sort(), ["activity", "contributors", "issueResponsiveness", "readmeQuality", "velocityLift"]);
    for (const v of Object.values(c)) assert.ok(v >= 0 && v <= 1);
    close(c.velocityLift, 1);
    close(c.activity, 1);
    close(c.contributors, 1);
    close(c.issueResponsiveness, 1);
  });
  it("tolerates missing README and issue data", () => {
    const c = lowkeyComponents({ ...base, readme: null, issueResponseRate: undefined });
    assert.equal(c.readmeQuality, 0);
    assert.equal(c.issueResponsiveness, 0);
  });
  it("feeds lowkeyScore: all components at 1 scores 1, all at 0 scores 0", () => {
    assert.equal(lowkeyScore({ velocityLift: 1, activity: 1, contributors: 1, readmeQuality: 1, issueResponsiveness: 1 }), 1);
    const zero = lowkeyComponents({
      starsLast7d: 0, priorStars: 1000, hasPriorHistory: true, pushes30d: 0, prsOpened30d: 0, issuesOpened30d: 0,
      contributors: 0, readme: "",
    });
    assert.equal(lowkeyScore(zero), 0);
  });
});
