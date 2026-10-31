import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { TierItem, TierResponse } from "../../lib/types";
import { TierPage } from "./tier-page";

const realFetch = globalThis.fetch;
let requested = "";
afterEach(() => {
  globalThis.fetch = realFetch;
});

function answer(status: number, body: unknown) {
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
    requested = String(input);
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
  }) as typeof fetch;
}
function fail() {
  globalThis.fetch = (async () => {
    throw new TypeError("fetch failed");
  }) as typeof fetch;
}

const item = (id: number, over: Partial<TierItem> = {}): TierItem => ({
  repoId: id,
  fullName: `acme/repo-${id}`,
  description: `Repo ${id}`,
  language: "Go",
  topics: [],
  stars: 100 + id,
  score: 0.5,
  starsGained: 5,
  components: {},
  stackTags: [],
  ...over,
});
const page = (items: TierItem[], over: Partial<TierResponse> = {}): TierResponse => ({
  tier: "lowkey",
  date: "2026-10-31",
  items,
  nextCursor: null,
  ...over,
});
const render = async (tier: "lowkey" | "medium" | "trending" = "lowkey", filters = {}) => renderToStaticMarkup(await TierPage({ tier, filters }));

describe("TierPage with data", () => {
  it("shows the title, the tabs, the filters and one row per repo", async () => {
    answer(200, page([item(1), item(2)]));
    const html = await render();
    assert.match(html, /<h1 class="page-title">Lowkey repos<\/h1>/);
    assert.match(html, /<nav class="tabs"/);
    assert.match(html, /<form class="filters"/);
    assert.equal((html.match(/class="repo-row"/g) ?? []).length, 2);
    assert.match(html, /scored 2026-10-31 · 2 on this page/);
  });
  it("asks the API for the tier with the filters and the 7d window", async () => {
    answer(200, page([item(1)]));
    await render("medium", { language: "Go", topic: "cli" });
    assert.match(requested, /\/tiers\/medium\?language=Go&topic=cli&window=7d$/);
  });
  it("shows the consensus badge and the fake-star warning on the rows that have them", async () => {
    answer(200, page([item(1, { consensusCount: 2, fakeStarFlag: true }), item(2)]));
    const html = await render();
    assert.match(html, /consensus 2/);
    assert.equal((html.match(/suspicious stars/g) ?? []).length, 1);
  });
  it("shows no data, never 0, for missing values", async () => {
    answer(200, page([item(1, { description: null, language: null })]));
    const html = await render();
    assert.equal((html.match(/gm-nodata">no data</g) ?? []).length, 2);
  });
  it("links to the next page with the cursor and keeps the filters", async () => {
    answer(200, page([item(1)], { nextCursor: "abc" }));
    const html = await render("lowkey", { language: "Go" });
    assert.match(html, /href="\/tiers\/lowkey\?language=Go&amp;cursor=abc"[^>]*>Next page</);
    assert.doesNotMatch(html, /First page/);
  });
  it("offers the first page on a later page and no next link on the last page", async () => {
    answer(200, page([item(1)], { nextCursor: null }));
    const html = await render("lowkey", { cursor: "abc" });
    assert.match(html, /href="\/tiers\/lowkey"[^>]*>First page</);
    assert.doesNotMatch(html, /Next page/);
  });
  it("labels the gained stars with the chosen window", async () => {
    answer(200, page([item(1)]));
    assert.match(await render("lowkey", { window: "30d" }), /<dt>30d stars<\/dt>/);
  });
});

describe("TierPage empty and error states", () => {
  it("says no repos match when the list is empty", async () => {
    answer(200, page([]));
    const html = await render();
    assert.match(html, /No repos in this tier match these filters/);
    assert.doesNotMatch(html, /class="repo-row"/);
  });
  it("says nothing is scored yet when the API has no score date", async () => {
    answer(200, page([], { date: null }));
    assert.match(await render(), /No scored repos yet/);
  });
  it("shows an API unreachable alert, and still the tabs, when the API is down", async () => {
    fail();
    const html = await render();
    assert.match(html, /role="alert"/);
    assert.match(html, /<strong>API unreachable<\/strong>/);
    assert.match(html, /<nav class="tabs"/);
  });
  it("shows the API's own message for a 400", async () => {
    answer(400, { error: "window: must be 7d or 30d" });
    const html = await render("lowkey", { window: "90d" });
    assert.match(html, /<strong>The API rejected these filters<\/strong><div>window: must be 7d or 30d<\/div>/);
  });
  it("shows a visible error state, not a crash, for a 5xx with the API's message", async () => {
    answer(500, { error: "database is down" });
    const html = await render();
    assert.match(html, /role="alert"/);
    assert.match(html, /<strong>The API returned an error<\/strong><div>database is down<\/div>/);
    assert.doesNotMatch(html, /class="repo-row"/);
  });
  it("shows the status for a 5xx that is not JSON", async () => {
    answer(502, "<html>Bad gateway</html>");
    assert.match(await render(), /<div>API answered 502<\/div>/);
  });
});
