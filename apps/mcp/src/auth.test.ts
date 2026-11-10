import assert from "node:assert/strict";
import { test } from "node:test";
import { MIN_TOKEN_LENGTH, bearerMatches, checkToken } from "./auth.js";

const token = "t".repeat(32);

test("bearerMatches: only the exact Bearer token passes", () => {
  assert.equal(bearerMatches(`Bearer ${token}`, token), true);
  assert.equal(bearerMatches(`Bearer ${token}x`, token), false);
  assert.equal(bearerMatches(`Bearer ${token.slice(1)}`, token), false);
  assert.equal(bearerMatches(token, token), false);
  assert.equal(bearerMatches(`bearer ${token}`, token), false);
  assert.equal(bearerMatches("Bearer ", token), false);
  assert.equal(bearerMatches(undefined, token), false);
});

test("checkToken: unset or too short is refused with a message, a long token passes", () => {
  assert.match(checkToken(undefined) ?? "", /MCP_TOKEN/);
  assert.match(checkToken("") ?? "", /MCP_TOKEN/);
  assert.match(checkToken("x".repeat(MIN_TOKEN_LENGTH - 1)) ?? "", /at least 32/);
  assert.equal(checkToken("x".repeat(MIN_TOKEN_LENGTH)), undefined);
});

test("checkToken: the message never contains the token", () => {
  const short = "secret-short";
  assert.doesNotMatch(checkToken(short) ?? "", /secret-short/);
});
