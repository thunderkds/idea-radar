import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { TierTabs } from "./tier-tabs";

describe("TierTabs", () => {
  it("links to the three tier pages", () => {
    const html = renderToStaticMarkup(<TierTabs active="lowkey" />);
    for (const path of ["/tiers/trending", "/tiers/medium", "/tiers/lowkey"]) assert.match(html, new RegExp(`href="${path}"`));
    assert.match(html, /<nav[^>]*aria-label="Tiers"/);
  });
  it("marks only the active tab as the current page", () => {
    const html = renderToStaticMarkup(<TierTabs active="medium" />);
    assert.equal((html.match(/aria-current="page"/g) ?? []).length, 1);
    assert.match(html, /<a aria-current="page" href="\/tiers\/medium">Medium<\/a>/);
  });
});
