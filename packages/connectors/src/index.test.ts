import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildRegistry } from "./index.js";

const byId = (env: NodeJS.ProcessEnv) => new Map(buildRegistry(env).map((c) => [c.id, c]));

describe("buildRegistry env flags", () => {
  it("OSSINSIGHT_ENABLED=false disables OSS Insight; it is on by default", () => {
    assert.equal(byId({}).get("ossinsight")!.enabled, true);
    assert.equal(byId({ OSSINSIGHT_ENABLED: "false" }).get("ossinsight")!.enabled, false);
  });

  it("TRENDSHIFT_ENABLED=true without TRENDSHIFT_API_KEY stays disabled", () => {
    assert.equal(byId({ TRENDSHIFT_ENABLED: "true" }).get("trendshift")!.enabled, false);
    assert.equal(byId({ TRENDSHIFT_API_KEY: "k" }).get("trendshift")!.enabled, false, "key alone is not enough");
    assert.equal(byId({ TRENDSHIFT_ENABLED: "true", TRENDSHIFT_API_KEY: "k" }).get("trendshift")!.enabled, true);
  });

  it("GITHUB_EXPLORER_ENABLED defaults to false", () => {
    assert.equal(byId({}).get("github_explorer")!.enabled, false);
    assert.equal(byId({ GITHUB_EXPLORER_ENABLED: "true" }).get("github_explorer")!.enabled, true);
  });

  it("Trendshift is never displayable, whatever the env says", () => {
    assert.equal(byId({}).get("trendshift")!.displayable, false);
    assert.equal(byId({ TRENDSHIFT_ENABLED: "true", TRENDSHIFT_API_KEY: "k" }).get("trendshift")!.displayable, false);
  });
});
