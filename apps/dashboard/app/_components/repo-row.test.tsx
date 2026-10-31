import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { TierItem } from "../../lib/types";
import { RepoRow } from "./repo-row";

const base: TierItem = {
  repoId: 42,
  fullName: "acme/widget",
  description: "A widget",
  language: "Rust",
  topics: [],
  stars: 1234,
  score: 0.8,
  starsGained: 12,
  components: {},
  stackTags: [],
};
const render = (item: Partial<TierItem>, windowLabel = "7d") =>
  renderToStaticMarkup(<RepoRow item={{ ...base, ...item }} windowLabel={windowLabel} />);

describe("RepoRow", () => {
  it("shows name as a link to /repos/:id, description, language, stars, window stars and score", () => {
    const html = render({});
    assert.match(html, /<a [^>]*href="\/repos\/42"[^>]*>acme\/widget<\/a>/);
    assert.match(html, /A widget/);
    assert.match(html, /<dt>language<\/dt><dd>Rust<\/dd>/);
    assert.match(html, /<dt>stars<\/dt><dd>1,234<\/dd>/);
    assert.match(html, /<dt>7d stars<\/dt><dd>\+12<\/dd>/);
    assert.match(html, /<dt>score<\/dt><dd>0\.800<\/dd>/);
  });
  it("labels the gained stars with the selected window", () => {
    assert.match(render({}, "30d"), /<dt>30d stars<\/dt>/);
  });
  it("shows a consensus badge with the count when 1 or more sources flag the repo", () => {
    assert.match(render({ consensusCount: 3 }), /gm-chip[^>]*>consensus 3</);
  });
  it("shows no badge when the count is 0 or the API did not send it", () => {
    assert.doesNotMatch(render({ consensusCount: 0 }), /consensus/);
    assert.doesNotMatch(render({}), /consensus/);
  });
  it("shows the fake-star warning in the warn colour class with the words suspicious stars", () => {
    const html = render({ fakeStarFlag: true });
    assert.match(html, /warn-flag/);
    assert.match(html, /suspicious stars/);
    assert.match(html, /<svg/);
    assert.doesNotMatch(render({ fakeStarFlag: false }), /suspicious stars/);
  });
  it("shows no data in the dim style for a missing description or language, and keeps a real 0", () => {
    const html = render({ description: null, language: null, stars: 0 });
    assert.equal((html.match(/gm-nodata">no data</g) ?? []).length, 2);
    assert.match(html, /<dt>stars<\/dt><dd>0<\/dd>/);
  });
  it("escapes markup in the description", () => {
    const html = render({ description: "<img src=x onerror=alert(1)>" });
    assert.doesNotMatch(html, /<img/);
    assert.match(html, /&lt;img/);
  });
});
