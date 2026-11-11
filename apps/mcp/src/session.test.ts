import assert from "node:assert/strict";
import { test } from "node:test";
import { SESSION_TTL_SECONDS, createSession, readCookie, tokenMatches, verifySession } from "./session.js";

const TOKEN = "d-test-token-that-is-long-enough-1234";
const NOW = 1_800_000_000_000;

test("a fresh session verifies; its value is exp.hmac and never holds the token", () => {
  const value = createSession(TOKEN, NOW);
  assert.match(value, /^\d+\.[0-9a-f]{64}$/);
  assert.ok(!value.includes(TOKEN));
  assert.equal(value.split(".")[0], String(Math.floor(NOW / 1000) + SESSION_TTL_SECONDS));
  assert.equal(verifySession(TOKEN, value, NOW + 1000), true);
});

test("an expired session is refused", () => {
  const value = createSession(TOKEN, NOW);
  assert.equal(verifySession(TOKEN, value, NOW + (SESSION_TTL_SECONDS + 1) * 1000), false);
});

test("a tampered expiry or signature is refused", () => {
  const [exp, mac] = createSession(TOKEN, NOW).split(".") as [string, string];
  assert.equal(verifySession(TOKEN, `${Number(exp) + 100000}.${mac}`, NOW), false);
  assert.equal(verifySession(TOKEN, `${exp}.${mac.replace(/.$/, mac.endsWith("0") ? "1" : "0")}`, NOW), false);
  assert.equal(verifySession(TOKEN, `${exp}.`, NOW), false);
  assert.equal(verifySession(TOKEN, exp, NOW), false);
  assert.equal(verifySession(TOKEN, "", NOW), false);
  assert.equal(verifySession(TOKEN, undefined, NOW), false);
  assert.equal(verifySession(TOKEN, "abc.def", NOW), false);
});

test("rotating the token invalidates old sessions", () => {
  const value = createSession(TOKEN, NOW);
  assert.equal(verifySession(`${TOKEN}-rotated`, value, NOW), false);
});

test("tokenMatches is an exact comparison", () => {
  assert.equal(tokenMatches(TOKEN, TOKEN), true);
  assert.equal(tokenMatches(`${TOKEN} `, TOKEN), false);
  assert.equal(tokenMatches("", TOKEN), false);
  assert.equal(tokenMatches(TOKEN.slice(1), TOKEN), false);
});

test("readCookie picks one cookie from a header", () => {
  assert.equal(readCookie("a=1; ir_session=xyz; b=2", "ir_session"), "xyz");
  assert.equal(readCookie("ir_session=xyz", "ir_session"), "xyz");
  assert.equal(readCookie("xir_session=no", "ir_session"), undefined);
  assert.equal(readCookie(undefined, "ir_session"), undefined);
});
