import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { RescrapeButton, rescrapeStatus } from "./rescrape-button";

describe("RescrapeButton", () => {
  it("is a secondary button with its label, enabled, and an empty polite status region", () => {
    const html = renderToStaticMarkup(<RescrapeButton label="Refresh now" target={{ repoId: 42 }} />);
    assert.match(html, /<button type="button" class="gm-btn gm-btn--secondary gm-btn--sm"[^>]*>Refresh now<\/button>/);
    assert.doesNotMatch(html, /disabled/);
    assert.doesNotMatch(html, /gm-btn--primary/);
    assert.match(html, /<p class="rescrape__status" role="status"><\/p>/);
  });
});

describe("rescrapeStatus", () => {
  it("says when the refresh was queued, with the repo count for a group", () => {
    assert.deepEqual(rescrapeStatus({ ok: true, queued: 1, at: "2026-10-31T15:55:48.000Z" }), { text: "Refresh queued 2026-10-31 15:55 UTC", error: false });
    assert.deepEqual(rescrapeStatus({ ok: true, queued: 3, at: "2026-10-31T15:55:48.000Z" }), { text: "Refresh queued for 3 repos 2026-10-31 15:55 UTC", error: false });
  });
  it("shows the error text", () => {
    assert.deepEqual(rescrapeStatus({ ok: false, message: "unauthorized" }), { text: "Refresh failed: unauthorized", error: true });
  });
});
