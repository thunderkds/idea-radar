import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { RepoResponse } from "../../lib/types";
import { RepoDetail } from "./repo-detail";

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

const full: RepoResponse = {
  repo: {
    repoId: 42,
    fullName: "acme/widget",
    description: "A widget",
    language: "Rust",
    topics: ["cli"],
    license: "MIT",
    stars: 1234,
    forks: 56,
    archived: false,
    createdAt: "2026-01-02T00:00:00Z",
    pushedAt: "2026-10-30T00:00:00Z",
  },
  score: { date: "2026-10-31", tier: "medium", score: 0.8123, components: { velocityLift: 0.5, activity: 1 }, consensusCount: 2, fakeStarFlag: false },
  starsSeries: [
    { date: "2026-10-30", starsNew: 3 },
    { date: "2026-10-31", starsNew: 7 },
  ],
  stackTags: ["rust", "tokio"],
  readmeExcerpt: "# widget\n<script>window.__pwned = true</script>",
  signals: [],
  timeline: [{ source: "github_trending", firstSeenAt: "2026-10-20T08:00:00Z", lastSeenAt: "2026-10-29T08:00:00Z" }],
};
const empty: RepoResponse = {
  repo: { ...full.repo, description: null, language: null, license: null, createdAt: null, pushedAt: null },
  score: null,
  starsSeries: [],
  stackTags: [],
  readmeExcerpt: null,
  signals: [],
};
const render = async (id = "42") => renderToStaticMarkup(await RepoDetail({ id }));
const nodata = (html: string) => (html.match(/gm-nodata">no data</g) ?? []).length;

describe("RepoDetail with data", () => {
  it("asks the API for the repo by its id", async () => {
    answer(200, full);
    await render("42");
    assert.match(requested, /\/repos\/42$/);
  });
  it("shows the name, description, the key numbers and a link back to the tier", async () => {
    answer(200, full);
    const html = await render();
    assert.match(html, /<h1 class="page-title">acme\/widget<\/h1>/);
    assert.match(html, /A widget/);
    assert.match(html, /gm-strip__num--key">1,234</);
    assert.match(html, /<span class="gm-strip__num">56<\/span>/);
    assert.match(html, /0\.812/);
    assert.match(html, /score · medium/);
    assert.match(html, /<span class="gm-strip__num">2<\/span><span class="gm-strip__label">sources in 7 days/);
    assert.match(html, /href="\/tiers\/medium"[^>]*>(&larr;|←) medium/);
  });
  it("shows the star history chart, the score breakdown and the source timeline", async () => {
    answer(200, full);
    const html = await render();
    assert.equal((html.match(/<rect/g) ?? []).length, 2);
    assert.match(html, /velocityLift<\/td>/);
    assert.match(html, /scored 2026-10-31/);
    assert.match(html, /<ol class="timeline"><li><span>github_trending<\/span><span>2026-10-20 to 2026-10-29/);
  });
  it("shows the stack tags and the language, license and dates", async () => {
    answer(200, full);
    const html = await render();
    assert.match(html, /<li class="gm-chip">rust<\/li><li class="gm-chip">tokio<\/li>/);
    assert.match(html, /language Rust · license MIT · pushed 2026-10-30 · created 2026-01-02/);
  });
  it("shows the README as inert text", async () => {
    answer(200, full);
    const html = await render();
    assert.match(html, /<pre class="readme">/);
    assert.doesNotMatch(html, /<script/);
    assert.match(html, /&lt;script&gt;window\.__pwned = true&lt;\/script&gt;/);
  });
  it("shows the fake-star warning only when the score is flagged", async () => {
    answer(200, { ...full, score: { ...full.score!, fakeStarFlag: true } });
    assert.match(await render(), /<strong>suspicious stars<\/strong>/);
    answer(200, full);
    assert.doesNotMatch(await render(), /suspicious stars/);
  });
  it("marks an archived repo", async () => {
    answer(200, { ...full, repo: { ...full.repo, archived: true } });
    assert.match(await render(), /<p class="meta">archived<\/p>/);
  });
  it("shows a real consensus count of 0 as 0, not as no data", async () => {
    answer(200, { ...full, score: { ...full.score!, consensusCount: 0 } });
    assert.match(await render(), /<span class="gm-strip__num">0<\/span><span class="gm-strip__label">sources in 7 days/);
  });
});

describe("RepoDetail with missing values", () => {
  it("shows no data in every empty place, never 0", async () => {
    answer(200, empty);
    const html = await render();
    // description, score, consensus, chart, score breakdown, timeline, stack, language, license, pushed, created, README
    assert.equal(nodata(html), 12);
    assert.doesNotMatch(html, /0\.000/);
    assert.doesNotMatch(html, /suspicious stars/);
  });
  it("shows no data for the consensus count and the timeline when the API sends neither", async () => {
    answer(200, { ...full, score: { date: "2026-10-31", tier: "lowkey", score: 0.5, components: {} }, timeline: undefined });
    const html = await render();
    assert.match(html, /gm-nodata">no data<\/span><\/span><span class="gm-strip__label">sources in 7 days/);
    assert.doesNotMatch(html, /<ol class="timeline">/);
  });
});

describe("RepoDetail errors", () => {
  it("reports not found for an unknown repo", async () => {
    answer(404, { error: "repo not found" });
    await assert.rejects(render("999"), (err: { digest?: string }) => /404|NOT_FOUND/.test(err.digest ?? ""));
  });
  it("shows an API unreachable alert when the API is down", async () => {
    globalThis.fetch = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    const html = await render();
    assert.match(html, /role="alert"/);
    assert.match(html, /<strong>API unreachable<\/strong>/);
  });
  it("shows a visible error state with the API's message for a 5xx", async () => {
    answer(500, { error: "database is down" });
    const html = await render();
    assert.match(html, /role="alert"/);
    assert.match(html, /<strong>The API returned an error<\/strong><div>database is down<\/div>/);
  });
  it("shows the API's own message for a 400, such as an id that is not a number", async () => {
    answer(400, { error: "repo id must be a number" });
    assert.match(await render("abc"), /<div>repo id must be a number<\/div>/);
  });
});
