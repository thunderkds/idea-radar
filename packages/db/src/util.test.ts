import assert from "node:assert/strict";
import { test } from "node:test";
import { assertLoopbackDatabaseUrl, clampLimit, escapeLike, validDateOrNull } from "./util.js";

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

test("assertLoopbackDatabaseUrl accepts localhost, 127.0.0.1 and [::1]", () => {
  assert.doesNotThrow(() => assertLoopbackDatabaseUrl("postgres://postgres:pg@localhost:5432/postgres"));
  assert.doesNotThrow(() => assertLoopbackDatabaseUrl("postgres://postgres:pg@127.0.0.1:55432/postgres"));
  assert.doesNotThrow(() => assertLoopbackDatabaseUrl("postgres://u:p@[::1]:5432/db"));
});

test("assertLoopbackDatabaseUrl names the host but never the password, and says which tables are dropped", () => {
  assert.throws(
    () => assertLoopbackDatabaseUrl("postgres://u:secret@prod.example.com:5432/db"),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /prod\.example\.com/);
      assert.doesNotMatch(err.message, /secret/);
      assert.match(err.message, /ideas, runs, schema_migrations/);
      return true;
    },
  );
});

test("assertLoopbackDatabaseUrl rejects a host or hostaddr query parameter, a loopback name only in the path, and junk", () => {
  assert.throws(() => assertLoopbackDatabaseUrl("postgres://u:p@localhost/db?host=prod.example.com"));
  assert.throws(() => assertLoopbackDatabaseUrl("postgres://u:p@localhost/db?hostaddr=10.0.0.5"));
  assert.throws(() => assertLoopbackDatabaseUrl("postgres://x@prod.example.com/localhost"));
  assert.throws(() => assertLoopbackDatabaseUrl("not a url"));
});
