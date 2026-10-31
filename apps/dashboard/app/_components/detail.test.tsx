import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ScoreBreakdown } from "./score-breakdown";
import { StarChart } from "./star-chart";
import { Timeline } from "./timeline";

describe("StarChart", () => {
  const series = [
    { date: "2026-10-29", starsNew: 4 },
    { date: "2026-10-30", starsNew: 8 },
    { date: "2026-10-31", starsNew: 2 },
  ];
  const html = renderToStaticMarkup(<StarChart series={series} />);
  it("draws one bar per day as inline SVG", () => {
    assert.equal((html.match(/<rect/g) ?? []).length, 3);
    assert.match(html, /<svg[^>]*role="img"/);
  });
  it("makes only the latest bar the neon current bar", () => {
    assert.equal((html.match(/chart-bar--current/g) ?? []).length, 1);
    assert.equal((html.match(/class="chart-bar"/g) ?? []).length, 2);
  });
  it("describes the chart and totals the stars", () => {
    assert.match(html, /aria-label="New stars per day from 2026-10-29 to 2026-10-31: 14 in total"/);
  });
  it("says no data for an empty series", () => {
    assert.match(renderToStaticMarkup(<StarChart series={[]} />), /gm-nodata">no data</);
  });
});

describe("ScoreBreakdown", () => {
  it("lists every component with a three-decimal value", () => {
    const html = renderToStaticMarkup(<ScoreBreakdown components={{ velocityLift: 0.5, activity: 1 }} />);
    assert.match(html, /velocityLift<\/td><td[^>]*>0\.500</);
    assert.match(html, /activity<\/td><td[^>]*>1\.000</);
  });
  it("says no data when there are no components", () => {
    assert.match(renderToStaticMarkup(<ScoreBreakdown components={{}} />), /no data/);
  });
});

describe("Timeline", () => {
  it("lists each source with its first and last date", () => {
    const html = renderToStaticMarkup(
      <Timeline entries={[{ source: "github_trending", firstSeenAt: "2026-10-20T08:00:00Z", lastSeenAt: "2026-10-29T08:00:00Z" }]} />,
    );
    assert.match(html, /github_trending/);
    assert.match(html, /2026-10-20 to 2026-10-29/);
  });
  it("says no data when the API sent no timeline or an empty one", () => {
    assert.match(renderToStaticMarkup(<Timeline entries={undefined} />), /gm-nodata">no data</);
    assert.match(renderToStaticMarkup(<Timeline entries={[]} />), /gm-nodata">no data</);
  });
});
