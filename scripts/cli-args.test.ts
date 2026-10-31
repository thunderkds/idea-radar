import assert from "node:assert/strict";
import { test } from "node:test";
import { parseArgs } from "./cli-args.ts";

test("parseArgs reads --name value pairs for every flag the tuning scripts take", () => {
  const args = parseArgs([
    "--date", "2026-10-31", "--out", "labels.csv", "--labels", "filled.csv",
    "--limit", "200", "--top", "50", "--seed", "42", "--k", "50",
  ]);
  assert.deepEqual(args, {
    date: "2026-10-31", out: "labels.csv", labels: "filled.csv", limit: "200", top: "50", seed: "42", k: "50",
  });
});

test("parseArgs returns an empty object for no arguments", () => {
  assert.deepEqual(parseArgs([]), {});
});

test("parseArgs ignores the bare -- that pnpm passes through", () => {
  assert.deepEqual(parseArgs(["--", "--date", "2026-10-31", "--"]), { date: "2026-10-31" });
});

test("parseArgs keeps the last value of a repeated flag", () => {
  assert.deepEqual(parseArgs(["--k", "10", "--k", "20"]), { k: "20" });
});

test("parseArgs throws on a bare word that is not a flag value", () => {
  assert.throws(() => parseArgs(["labels.csv"]), /unexpected argument "labels.csv"/);
  assert.throws(() => parseArgs(["--k", "5", "extra"]), /unexpected argument "extra"/);
});

test("parseArgs throws when a flag has no value or the next token is another flag", () => {
  assert.throws(() => parseArgs(["--date"]), /missing value for --date/);
  assert.throws(() => parseArgs(["--date", "--out", "x.csv"]), /missing value for --date/);
});
