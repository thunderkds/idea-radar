import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { StarChart } from "./star-chart";

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
  it("titles each bar with its day and count, and shows the date range in the legend", () => {
    assert.match(html, /<title>2026-10-30: 8 new stars<\/title>/);
    assert.match(html, /<figcaption[^>]*><span>2026-10-29<\/span><span>14 new stars<\/span><span>2026-10-31<\/span>/);
  });
  it("draws a real zero-star day as a bar, not as missing data", () => {
    const zero = renderToStaticMarkup(<StarChart series={[{ date: "2026-10-30", starsNew: 0 }, { date: "2026-10-31", starsNew: 3 }]} />);
    assert.equal((zero.match(/<rect/g) ?? []).length, 2);
    assert.doesNotMatch(zero, /no data/);
  });
  it("says no data for an empty series", () => {
    assert.match(renderToStaticMarkup(<StarChart series={[]} />), /gm-nodata">no data</);
  });
});
