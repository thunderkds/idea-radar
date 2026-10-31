import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { activeTier, apiTierQuery, firstPageHref, nextPageHref, parseTierFilters } from "./query";

describe("parseTierFilters", () => {
  it("keeps the five known filters and drops the rest", () => {
    assert.deepEqual(parseTierFilters({ language: "Rust", topic: "cli", collection: "AI", window: "30d", cursor: "abc", x: "1" }), {
      language: "Rust",
      topic: "cli",
      collection: "AI",
      window: "30d",
      cursor: "abc",
    });
  });
  it("drops empty and blank values (the API answers 400 for an empty filter)", () => {
    assert.deepEqual(parseTierFilters({ language: "", topic: "   ", collection: undefined }), {});
  });
  it("takes the first of a repeated parameter and trims it", () => {
    assert.deepEqual(parseTierFilters({ language: [" Go ", "Rust"] }), { language: "Go" });
  });
});

describe("apiTierQuery", () => {
  it("always sends the window, defaulting to 7d", () => {
    assert.equal(apiTierQuery({}), "window=7d");
  });
  it("round-trips every filter to the API query", () => {
    const q = new URLSearchParams(apiTierQuery({ language: "C++", topic: "cli", collection: "Web Framework", window: "30d", cursor: "c1" }));
    assert.equal(q.get("language"), "C++");
    assert.equal(q.get("topic"), "cli");
    assert.equal(q.get("collection"), "Web Framework");
    assert.equal(q.get("window"), "30d");
    assert.equal(q.get("cursor"), "c1");
  });
  it("passes a bad window on, so the API can answer 400 with its own message", () => {
    assert.equal(apiTierQuery({ window: "90d" }), "window=90d");
  });
});

describe("page links", () => {
  it("nextPageHref keeps the filters and sets the cursor", () => {
    const href = nextPageHref("medium", { language: "Go", cursor: "old" }, "new");
    const [path, query] = href.split("?");
    assert.equal(path, "/tiers/medium");
    const q = new URLSearchParams(query);
    assert.equal(q.get("language"), "Go");
    assert.equal(q.get("cursor"), "new");
  });
  it("firstPageHref drops the cursor", () => {
    assert.equal(firstPageHref("lowkey", { language: "Go", cursor: "old" }), "/tiers/lowkey?language=Go");
    assert.equal(firstPageHref("lowkey", {}), "/tiers/lowkey");
  });
});

describe("activeTier", () => {
  it("treats / as Lowkey", () => {
    assert.equal(activeTier("/"), "lowkey");
  });
  it("reads the tier from /tiers/:tier", () => {
    assert.equal(activeTier("/tiers/trending"), "trending");
    assert.equal(activeTier("/tiers/medium/"), "medium");
  });
  it("is null elsewhere", () => {
    assert.equal(activeTier("/repos/1"), null);
    assert.equal(activeTier("/tiers/other"), null);
  });
});
