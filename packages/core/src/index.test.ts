import { test } from "node:test";
import assert from "node:assert/strict";
import * as core from "./index.js";

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
