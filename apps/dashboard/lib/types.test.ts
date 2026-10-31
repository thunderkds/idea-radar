import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TIERS, isTier } from "./types";

describe("TIERS", () => {
  it("lists Lowkey first, because it is the default tab", () => {
    assert.deepEqual(TIERS.map((t) => t.id), ["lowkey", "medium", "trending"]);
  });
  it("gives every tier a label and a one-line description", () => {
    for (const t of TIERS) {
      assert.ok(t.label.length > 0);
      assert.ok(t.blurb.length > 0);
    }
  });
});

describe("isTier", () => {
  it("accepts the three tier ids", () => {
    for (const id of ["lowkey", "medium", "trending"]) assert.equal(isTier(id), true);
  });
  it("rejects anything else, including a different case and the empty string", () => {
    for (const id of ["Lowkey", "popular", "", "lowkey "]) assert.equal(isTier(id), false);
  });
});
