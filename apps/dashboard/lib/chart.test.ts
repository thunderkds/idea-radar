import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CHART_HEIGHT, barGeometry, chartWidth } from "./chart";

describe("barGeometry", () => {
  const bars = barGeometry([
    { date: "2026-10-29", starsNew: 5 },
    { date: "2026-10-30", starsNew: 10 },
    { date: "2026-10-31", starsNew: 0 },
  ]);
  it("scales the tallest day to the full height", () => {
    assert.equal(bars[1]!.height, CHART_HEIGHT);
    assert.equal(bars[1]!.y, 0);
    assert.equal(bars[0]!.height, CHART_HEIGHT / 2);
  });
  it("gives a day without stars no height", () => {
    assert.equal(bars[2]!.height, 0);
  });
  it("marks only the last day as the current bar", () => {
    assert.deepEqual(bars.map((b) => b.current), [false, false, true]);
  });
  it("keeps a small day visible next to a big one", () => {
    const [small] = barGeometry([{ date: "a", starsNew: 1 }, { date: "b", starsNew: 1000 }]);
    assert.ok(small!.height >= 2);
  });
  it("lays bars out left to right in the chart width", () => {
    assert.deepEqual(bars.map((b) => b.x), [0, 10, 20]);
    assert.equal(chartWidth(3), 30);
  });
  it("copes with an empty series", () => {
    assert.deepEqual(barGeometry([]), []);
    assert.equal(chartWidth(0), 10);
  });
});
