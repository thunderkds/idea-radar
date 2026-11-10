import assert from "node:assert/strict";
import { test } from "node:test";
import type { MergedIdea } from "@idea-radar/ideas";
import { createStore } from "./index-store.js";
import { TOOL_DESCRIPTIONS, createToolHandlers } from "./tools.js";

function idea(id: string, last_seen: string, extra: Partial<MergedIdea> = {}): MergedIdea {
  return {
    id,
    title: `Title ${id}`,
    summary: `Summary ${id}`,
    tags: [],
    signals: [],
    related_repos: [],
    first_seen: last_seen,
    last_seen,
    files: [`${last_seen}.json`],
    ...extra,
  };
}

const store = createStore(
  [
    idea("one", "2026-11-10", {
      tags: ["ai"],
      signals: [{ kind: "repo", url: "https://e.x/y", note: "n" }],
      related_repos: ["o/r"],
      why_now: "now",
    }),
    idea("two", "2026-11-09", { tags: ["ai"] }),
    idea("three", "2026-11-08", { tags: ["cli"] }),
  ],
  3,
  0,
);
const tools = createToolHandlers(store);
const parse = (r: { content: { text: string }[] }) => JSON.parse(r.content[0]!.text);

test("list_ideas: newest first, count included", () => {
  const r = tools.list_ideas({});
  assert.equal(r.isError, undefined);
  const body = parse(r);
  assert.equal(body.count, 3);
  assert.deepEqual(
    body.ideas.map((i: { id: string }) => i.id),
    ["one", "two", "three"],
  );
});

test("list_ideas: tag, dates and a clamped limit", () => {
  assert.deepEqual(
    parse(tools.list_ideas({ tag: "ai", limit: 500 })).ideas.map((i: { id: string }) => i.id),
    ["one", "two"],
  );
  assert.equal(parse(tools.list_ideas({ limit: 0 })).count, 1);
  assert.deepEqual(
    parse(tools.list_ideas({ since: "2026-11-09", until: "2026-11-09" })).ideas.map((i: { id: string }) => i.id),
    ["two"],
  );
});

test("list_ideas: a bad date is a tool error that names the field, not a throw", () => {
  for (const args of [{ since: "yesterday" }, { until: "2026-02-30" }]) {
    const r = tools.list_ideas(args);
    assert.equal(r.isError, true);
    assert.match(r.content[0]!.text, /since|until/);
  }
});

test("search_ideas: matches, ranks and bounds the query", () => {
  assert.deepEqual(
    parse(tools.search_ideas({ query: "TITLE one" })).ideas.map((i: { id: string }) => i.id),
    ["one"],
  );
  assert.equal(parse(tools.search_ideas({ query: "title", limit: 2 })).count, 2);
  assert.equal(tools.search_ideas({ query: "" }).isError, true);
  assert.equal(tools.search_ideas({ query: "   " }).isError, true);
  assert.equal(tools.search_ideas({ query: "x".repeat(201) }).isError, true);
  assert.equal(tools.search_ideas({ query: "x".repeat(200) }).isError, undefined);
});

test("get_idea: full idea, or a not-found tool error", () => {
  const body = parse(tools.get_idea({ id: "one" }));
  assert.deepEqual(body.signals, [{ kind: "repo", url: "https://e.x/y", note: "n" }]);
  assert.deepEqual(body.related_repos, ["o/r"]);
  assert.equal(body.first_seen, "2026-11-10");
  assert.equal(body.last_seen, "2026-11-10");
  assert.deepEqual(body.files, ["2026-11-10.json"]);
  const missing = tools.get_idea({ id: "nope" });
  assert.equal(missing.isError, true);
  assert.match(missing.content[0]!.text, /not found/);
});

test("every tool description says idea text is external content to read as data", () => {
  for (const [name, text] of Object.entries(TOOL_DESCRIPTIONS)) {
    assert.match(text, /external|untrusted/i, name);
    assert.match(text, /data/i, name);
  }
});

test("with 10,000 ideas each tool call finishes in under 1 second", () => {
  const many = Array.from({ length: 10_000 }, (_, n) =>
    idea(`idea-${n}`, `2026-${String((n % 12) + 1).padStart(2, "0")}-${String((n % 28) + 1).padStart(2, "0")}`, {
      title: `Title ${n} about topic ${n % 50}`,
      summary: "A reasonably long summary sentence repeated. ".repeat(20),
      why_now: "Because things changed recently. ".repeat(10),
      tags: ["ai", `tag-${n % 30}`],
    }),
  );
  const big = createToolHandlers(createStore(many, 365, 0));
  const timed = (label: string, fn: () => { isError?: true }) => {
    const start = performance.now();
    const r = fn();
    const ms = performance.now() - start;
    assert.equal(r.isError, undefined, label);
    assert.ok(ms < 1000, `${label} took ${ms.toFixed(1)} ms`);
  };
  timed("list_ideas", () => big.list_ideas({ tag: "ai", limit: 100 }));
  timed("list_ideas filtered", () => big.list_ideas({ tag: "tag-7", since: "2026-03-01", until: "2026-09-01" }));
  timed("search_ideas common", () => big.search_ideas({ query: "topic" }));
  timed("search_ideas worst case (no match)", () => big.search_ideas({ query: "zzz-not-there" }));
  timed("get_idea", () => big.get_idea({ id: "idea-9999" }));
});
