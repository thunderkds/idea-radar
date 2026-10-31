import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Home from "./page";
import { TierPage } from "./_components/tier-page";

describe("Home page", () => {
  it("renders the Lowkey tier by default", async () => {
    const el = await Home({ searchParams: Promise.resolve({}) });
    assert.equal(el.type, TierPage);
    assert.deepEqual(el.props, { tier: "lowkey", filters: {} });
  });
  it("passes the URL filters through, trimmed, and drops unknown keys and empty values", async () => {
    const el = await Home({ searchParams: Promise.resolve({ language: " Go ", topic: "", cursor: ["a", "b"], junk: "x" }) });
    assert.deepEqual(el.props.filters, { language: "Go", cursor: "a" });
  });
});
