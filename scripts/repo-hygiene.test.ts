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

test("the routine prompt sends ideas with submit_ideas and never touches the repository", () => {
  const prompt = read("routines/daily-ideas.md");
  assert.match(prompt, /submit_ideas/);
  for (const banned of [/git push/i, /git commit/i, /git clone/i, /pnpm/i, /ideas:check/i]) {
    assert.doesNotMatch(prompt, banned, `routine prompt must not match ${banned}`);
  }
  assert.match(prompt, /never clone, edit, commit or push/i);
});

test("railway.json does not watch idea data in git but still watches the schema", () => {
  const { build } = JSON.parse(read("railway.json")) as { build: { watchPatterns: string[] } };
  assert.ok(!build.watchPatterns.includes("/ideas/**"), "/ideas/** must not be watched");
  assert.ok(build.watchPatterns.includes("/ideas/schema.json"), "/ideas/schema.json must be watched");
});

test("git idea-file ingest is gone from CI and the root scripts", () => {
  assert.doesNotMatch(read(".github/workflows/ci.yml"), /ideas:check/);
  const scripts = (JSON.parse(read("package.json")) as { scripts: Record<string, string> }).scripts;
  assert.equal(scripts["ideas:check"], undefined);
});

test("docs/deploy.md covers Postgres, the three tokens and the dashboard login, with no real token", () => {
  const deploy = read("docs/deploy.md");
  for (const name of ["DATABASE_URL", "MCP_TOKEN", "MCP_WRITE_TOKEN", "DASHBOARD_TOKEN", "/login"]) {
    assert.ok(deploy.includes(name), `deploy.md does not mention ${name}`);
  }
  assert.doesNotMatch(deploy, /git push|ideas:check|IDEAS_DIR/);
  assert.doesNotMatch(deploy, /\b[0-9a-f]{32,}\b/i, "deploy.md shows a long hex string that looks like a token");
  for (const m of deploy.matchAll(/Bearer\s+(\S+)/g)) {
    assert.match(m[1] ?? "", /^["<$]/, `Bearer is followed by a non-placeholder: ${m[0]}`);
  }
});
