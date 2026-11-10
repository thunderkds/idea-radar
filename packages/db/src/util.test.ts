import assert from "node:assert/strict";
import { test } from "node:test";
import { clampLimit, escapeLike, validDateOrNull } from "./util.js";

test("escapeLike escapes %, _ and backslash so they match literally", () => {
  assert.equal(escapeLike("50%_off\\x"), "50\\%\\_off\\\\x");
  assert.equal(escapeLike("plain"), "plain");
});

test("clampLimit keeps a limit in 1..MAX_LIMIT and defaults non-numbers", () => {
  assert.equal(clampLimit(0), 1);
  assert.equal(clampLimit(-5), 1);
  assert.equal(clampLimit(20.9), 20);
  assert.equal(clampLimit(1_000_000), 500);
  assert.equal(clampLimit(Number.NaN), 20);
});

test("validDateOrNull accepts only real YYYY-MM-DD dates", () => {
  assert.equal(validDateOrNull("2026-11-10"), "2026-11-10");
  assert.equal(validDateOrNull("2026-02-31"), null);
  assert.equal(validDateOrNull("not a date"), null);
  assert.equal(validDateOrNull(undefined), null);
  assert.equal(validDateOrNull(42), null);
});
