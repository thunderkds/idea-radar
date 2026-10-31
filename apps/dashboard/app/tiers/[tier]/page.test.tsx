import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TierPage } from "../../_components/tier-page";
import Tier from "./page";

describe("Tier page", () => {
  it("renders the tier from the path with the URL filters", async () => {
    const el = await Tier({ params: Promise.resolve({ tier: "medium" }), searchParams: Promise.resolve({ window: "30d" }) });
    assert.equal(el.type, TierPage);
    assert.deepEqual(el.props, { tier: "medium", filters: { window: "30d" } });
  });
  it("answers not found for a tier that does not exist", async () => {
    await assert.rejects(
      Tier({ params: Promise.resolve({ tier: "popular" }), searchParams: Promise.resolve({}) }),
      (err: { digest?: string }) => /404|NOT_FOUND/.test(err.digest ?? ""),
    );
  });
});
