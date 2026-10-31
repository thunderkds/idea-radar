import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatCount, formatDate, formatDateTime, formatGained, formatScore, formatText } from "./format";

describe("formatCount", () => {
  it("groups thousands", () => {
    assert.equal(formatCount(1234567), "1,234,567");
  });
  it("keeps a real 0 as 0", () => {
    assert.equal(formatCount(0), "0");
  });
  it("returns null, never 0, for a missing value", () => {
    assert.equal(formatCount(null), null);
    assert.equal(formatCount(undefined), null);
    assert.equal(formatCount(Number.NaN), null);
  });
});

describe("formatGained", () => {
  it("prefixes a gain with +", () => {
    assert.equal(formatGained(12), "+12");
    assert.equal(formatGained(1500), "+1,500");
  });
  it("shows 0 without a sign and null for missing", () => {
    assert.equal(formatGained(0), "0");
    assert.equal(formatGained(undefined), null);
  });
});

describe("formatScore", () => {
  it("uses three decimals", () => {
    assert.equal(formatScore(0.8), "0.800");
    assert.equal(formatScore(0.81234), "0.812");
  });
  it("returns null for missing", () => {
    assert.equal(formatScore(null), null);
  });
});

describe("formatDate", () => {
  it("cuts an ISO timestamp to a UTC date", () => {
    assert.equal(formatDate("2026-10-29T23:59:59.000Z"), "2026-10-29");
    assert.equal(formatDate("2026-10-29"), "2026-10-29");
  });
  it("returns null for empty or invalid input", () => {
    assert.equal(formatDate(null), null);
    assert.equal(formatDate(""), null);
    assert.equal(formatDate("not a date"), null);
  });
});

describe("formatText", () => {
  it("returns null for null, empty and blank text", () => {
    assert.equal(formatText(null), null);
    assert.equal(formatText(""), null);
    assert.equal(formatText("   "), null);
    assert.equal(formatText("Rust"), "Rust");
  });
});

describe("formatDateTime", () => {
  it("shows an ISO timestamp as UTC to the minute", () => {
    assert.equal(formatDateTime("2026-10-31T15:55:48.264Z"), "2026-10-31 15:55 UTC");
    assert.equal(formatDateTime("2026-10-31T23:30:00+02:00"), "2026-10-31 21:30 UTC");
  });
  it("returns null for a missing or invalid value", () => {
    assert.equal(formatDateTime(null), null);
    assert.equal(formatDateTime(undefined), null);
    assert.equal(formatDateTime(""), null);
    assert.equal(formatDateTime("nope"), null);
  });
});
