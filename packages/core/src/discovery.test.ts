import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { discoveryConfig, discoveryQueries } from "./scoring.js";

describe("discoveryConfig (T025 AC 1)", () => {
  it("holds the languages, the created and pushed windows, the star range, the pages per query and the daily request cap", () => {
    assert.ok(discoveryConfig.languages.length > 0);
    assert.equal(discoveryConfig.createdWithinDays, 30);
    assert.equal(discoveryConfig.pushedWithinDays, 7);
    assert.deepEqual(discoveryConfig.stars, { min: 5, max: 200 });
    assert.ok(discoveryConfig.pagesPerQuery >= 1 && discoveryConfig.pagesPerQuery <= 10, "Search returns at most 1,000 results = 10 pages of 100");
  });

  it("allows one full pass of the queries within the daily request cap", () => {
    const passes = discoveryQueries(new Date("2026-10-31T06:00:00Z")).length * discoveryConfig.pagesPerQuery;
    assert.ok(discoveryConfig.dailyRequestCap >= passes, `${passes} requests per pass exceed the cap ${discoveryConfig.dailyRequestCap}`);
  });
});

describe("discoveryQueries (T025 AC 1)", () => {
  const now = new Date("2026-10-31T06:00:00Z");

  it("makes a created query and a pushed query for each language, with the star range", () => {
    const queries = discoveryQueries(now);
    assert.equal(queries.length, discoveryConfig.languages.length * 2);
    const [language] = discoveryConfig.languages;
    assert.ok(queries.includes(`language:${language} created:>=2026-10-01 stars:5..200`));
    assert.ok(queries.includes(`language:${language} pushed:>=2026-10-24 stars:5..200`));
  });

  it("counts the windows back from the UTC day of `now`", () => {
    const late = discoveryQueries(new Date("2026-10-31T23:59:00Z"));
    assert.deepEqual(late, discoveryQueries(new Date("2026-10-31T00:00:00Z")));
  });
});
