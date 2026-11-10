import assert from "node:assert/strict";
import { test } from "node:test";
import { MIN_TOKEN_LENGTH, bearerMatches, checkTokens, roleFor } from "./auth.js";

const token = "t".repeat(32);
const good = { MCP_TOKEN: "r".repeat(32), MCP_WRITE_TOKEN: "w".repeat(32), DASHBOARD_TOKEN: "d".repeat(32) };

test("bearerMatches: only the exact Bearer token passes", () => {
  assert.equal(bearerMatches(`Bearer ${token}`, token), true);
  assert.equal(bearerMatches(`Bearer ${token}x`, token), false);
  assert.equal(bearerMatches(`Bearer ${token.slice(1)}`, token), false);
  assert.equal(bearerMatches(token, token), false);
  assert.equal(bearerMatches(`bearer ${token}`, token), false);
  assert.equal(bearerMatches("Bearer ", token), false);
  assert.equal(bearerMatches(undefined, token), false);
});

test("roleFor: the write token is write, the read token is read, anything else has no role", () => {
  const tokens = { read: good.MCP_TOKEN, write: good.MCP_WRITE_TOKEN };
  assert.equal(roleFor(`Bearer ${good.MCP_WRITE_TOKEN}`, tokens), "write");
  assert.equal(roleFor(`Bearer ${good.MCP_TOKEN}`, tokens), "read");
  assert.equal(roleFor(`Bearer ${good.DASHBOARD_TOKEN}`, tokens), undefined);
  assert.equal(roleFor("Bearer wrong", tokens), undefined);
  assert.equal(roleFor(undefined, tokens), undefined);
});

test("checkTokens: every token must be set, long enough and different from the others", () => {
  assert.equal(checkTokens(good), undefined);
  for (const name of Object.keys(good) as (keyof typeof good)[]) {
    assert.match(checkTokens({ ...good, [name]: undefined }) ?? "", new RegExp(`${name} is not set`));
    assert.match(checkTokens({ ...good, [name]: "" }) ?? "", new RegExp(`${name} is not set`));
    assert.match(
      checkTokens({ ...good, [name]: "x".repeat(MIN_TOKEN_LENGTH - 1) }) ?? "",
      new RegExp(`${name} must be at least 32`),
    );
  }
  assert.match(checkTokens({ ...good, MCP_WRITE_TOKEN: good.MCP_TOKEN }) ?? "", /must all be different/);
  assert.match(checkTokens({ ...good, DASHBOARD_TOKEN: good.MCP_WRITE_TOKEN }) ?? "", /must all be different/);
});

test("checkTokens: the message never contains a token value", () => {
  for (const bad of [
    { ...good, MCP_TOKEN: "secret-short" },
    { ...good, MCP_WRITE_TOKEN: good.MCP_TOKEN },
  ]) {
    const message = checkTokens(bad) ?? "";
    assert.doesNotMatch(message, /secret-short|rrrr|wwww|dddd/);
  }
});
