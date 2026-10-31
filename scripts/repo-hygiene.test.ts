import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const root = new URL("../", import.meta.url);
const read = (path: string): string => readFileSync(new URL(path, root), "utf8");

test("LICENSE is the MIT license", () => {
  const license = read("LICENSE");
  assert.ok(license.startsWith("MIT License"));
  assert.match(license, /Copyright \(c\) 2026 thunderkds/);
});

test("root package.json declares the MIT license", () => {
  assert.equal(JSON.parse(read("package.json")).license, "MIT");
});

test("every `uses:` line in ci.yml is pinned to a 40-hex commit SHA", () => {
  const uses = read(".github/workflows/ci.yml")
    .split("\n")
    .filter((line) => /^\s*-?\s*uses:/.test(line));
  assert.ok(uses.length > 0, "ci.yml has no uses: lines");
  for (const line of uses) {
    assert.match(line, /uses:\s*\S+@[0-9a-f]{40}(\s+#\s*\S+)?\s*$/, `not pinned to a SHA: ${line.trim()}`);
  }
});

test("ci.yml installs from the lockfile with least-privilege permissions", () => {
  const ci = read(".github/workflows/ci.yml");
  assert.match(ci, /--frozen-lockfile/);
  assert.match(ci, /^permissions:\s*\n\s+contents:\s*read\s*$/m);
  assert.match(ci, /timeout-minutes:/);
});

test("ci.yml runs lint, typecheck and test", () => {
  const ci = read(".github/workflows/ci.yml");
  for (const step of ["pnpm lint", "pnpm typecheck", "pnpm test"]) {
    assert.ok(ci.includes(`run: ${step}`), `ci.yml is missing "run: ${step}"`);
  }
});
