import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ScoreBreakdown } from "./score-breakdown";

describe("ScoreBreakdown", () => {
  it("lists every component with a three-decimal value", () => {
    const html = renderToStaticMarkup(<ScoreBreakdown components={{ velocityLift: 0.5, activity: 1 }} />);
    assert.match(html, /velocityLift<\/td><td[^>]*>0\.500</);
    assert.match(html, /activity<\/td><td[^>]*>1\.000</);
    assert.match(html, /<th scope="col">component<\/th>/);
  });
  it("keeps a real 0 as 0.000, never as no data", () => {
    const html = renderToStaticMarkup(<ScoreBreakdown components={{ contributors: 0 }} />);
    assert.match(html, /contributors<\/td><td[^>]*>0\.000</);
    assert.doesNotMatch(html, /no data/);
  });
  it("shows no data for a value that is not a number", () => {
    const html = renderToStaticMarkup(<ScoreBreakdown components={{ broken: Number.NaN }} />);
    assert.match(html, /broken<\/td><td[^>]*><span class="gm-nodata">no data</);
  });
  it("says no data when there are no components", () => {
    assert.match(renderToStaticMarkup(<ScoreBreakdown components={{}} />), /gm-nodata">no data</);
  });
});
