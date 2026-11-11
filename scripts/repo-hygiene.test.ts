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
  // The env-var route exposes the write token to the routine's model; the doc must warn and prefer the connector.
  assert.match(deploy, /prefer the connector/i, "deploy.md must prefer the connector over the env-var route");
  assert.match(
    deploy,
    /write token[^.]*visible to the (routine's )?model/i,
    "deploy.md must say the env-var route exposes the write token",
  );
  assert.match(deploy, /prefer \*\*Custom\*\*/i, "deploy.md must prefer Custom network access over Full");
  assert.doesNotMatch(deploy, /\b[0-9a-f]{32,}\b/i, "deploy.md shows a long hex string that looks like a token");
  for (const m of deploy.matchAll(/Bearer\s+(\S+)/g)) {
    assert.match(m[1] ?? "", /^["<$]/, `Bearer is followed by a non-placeholder: ${m[0]}`);
  }
});

// --- T037: the routine prompt is GitHub-only, self-contained, and short. It has no repository to read, so it must
// carry the schema's allowed values and limits itself; these tests read them from ideas/schema.json.
const schema = JSON.parse(read("ideas/schema.json")) as {
  $defs: {
    idea: { properties: Record<string, { maxLength?: number; items?: { maxLength?: number } }> };
    signal: { properties: { kind: { enum: string[] }; note: { maxLength: number } } };
  };
};
const promptBody = (): string => read("routines/daily-ideas.md").split(/^---$/m).slice(1).join("---");

test("the routine prompt lists every signal kind and every length limit the schema sets", () => {
  const body = promptBody();
  for (const kind of schema.$defs.signal.properties.kind.enum) {
    assert.ok(body.includes(`\`${kind}\``), `the prompt does not list the signal kind \`${kind}\``);
  }
  const idea = schema.$defs.idea.properties;
  const limits: Array<[string, number | undefined]> = [
    ["`id`", idea.id?.maxLength],
    ["`title`", idea.title?.maxLength],
    ["`summary`", idea.summary?.maxLength],
    ["`why_now`", idea.why_now?.maxLength],
    ["each tag", idea.tags?.items?.maxLength],
    ["`note`", schema.$defs.signal.properties.note.maxLength],
  ];
  for (const [label, max] of limits) {
    assert.ok(typeof max === "number", `schema has no maxLength for ${label}`);
    assert.ok(body.includes(`${label} ≤${max}`), `the prompt does not state the limit "${label} ≤${max}"`);
  }
});

test("the routine prompt researches GitHub only: three buckets (10 rising, 5 low-key, 5 medium), no other source", () => {
  const body = promptBody();
  assert.match(body, /`rising` \(10\)/);
  assert.match(body, /`low-key` \(5\)/);
  assert.match(body, /`medium` \(5\)/);
  assert.match(body, /under 500 stars/i);
  assert.match(body, /500 to 5,000 stars/i);
  assert.match(body, /github\.com\/trending/);
  assert.match(body, /github\.com\/search/);
  assert.match(body, /forks/i);
  assert.match(body, /awesome/i);
  for (const banned of [/hacker news/i, /reddit/i, /\bblogs?\b/i, /\ba few times\b/i]) {
    assert.doesNotMatch(body, banned, `routine prompt must not match ${banned}`);
  }
  const hosts = [...body.matchAll(/https?:\/\/([^/\s`)"]+)/g)].map((m) => m[1]);
  assert.ok(hosts.length > 0);
  for (const host of hosts) assert.equal(host, "github.com", `the prompt names a non-GitHub host: ${host}`);
});

test("the routine prompt carries the cost rules and the safety rules, in 550 words or fewer", () => {
  const body = promptBody();
  const words = body.split(/\s+/).filter(Boolean).length;
  assert.ok(words <= 550, `the prompt body has ${words} words; the budget is 550`);
  assert.match(body, /`limit` 40/);
  assert.match(body, /at most 8 /i);
  assert.match(body, /resend once/i);
  assert.match(body, /unreachable/i);
  assert.match(body, /untrusted/i);
  assert.match(body, /never write the ideas to a file/i);
  assert.match(body, /write token/i);
  assert.doesNotMatch(body, /\b[0-9a-f]{32,}\b/i, "the prompt shows a long hex string that looks like a token");
});
