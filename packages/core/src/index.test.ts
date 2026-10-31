import { test } from "node:test";
import assert from "node:assert/strict";
import * as core from "./index.js";

test("T015 exports consensusConfig and consensusBoostFactor", () => {
  assert.equal(typeof core.consensusBoostFactor, "function");
  assert.equal(core.consensusConfig.windowDays, 7);
});
