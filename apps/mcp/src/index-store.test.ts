import assert from "node:assert/strict";
import { test } from "node:test";
import type { MergedIdea } from "@idea-radar/ideas";
import { clampLimit, createStore, isRealDate } from "./index-store.js";

function idea(id: string, last_seen: string, extra: Partial<MergedIdea> = {}): MergedIdea {
  return {
    id,
    title: `Title of ${id}`,
    summary: `Summary of ${id}`,
    tags: [],
    signals: [],
    related_repos: [],
    first_seen: last_seen,
    last_seen,
    files: [`${last_seen}.json`],
    ...extra,
  };
}

// loadIdeas returns ideas sorted by id; the store must not depend on that.
const sample = [
  idea("a-old", "2026-11-01", { tags: ["ai"] }),
  idea("b-new", "2026-11-10", { tags: ["ai", "cli"] }),
  idea("c-new", "2026-11-10", { tags: ["cli"] }),
  idea("d-mid", "2026-11-05", { tags: ["ai"] }),
];

test("list: newest last_seen first, ties by id", () => {
  const store = createStore(sample, 4, 0);
  assert.deepEqual(
    store.list({ limit: 20 }).map((i) => i.id),
    ["b-new", "c-new", "d-mid", "a-old"],
  );
});

test("list: tag filter, date range (inclusive) and limit", () => {
  const store = createStore(sample, 4, 0);
  assert.deepEqual(
    store.list({ tag: "ai", limit: 20 }).map((i) => i.id),
    ["b-new", "d-mid", "a-old"],
  );
  assert.deepEqual(
    store.list({ since: "2026-11-05", until: "2026-11-10", limit: 20 }).map((i) => i.id),
    ["b-new", "c-new", "d-mid"],
  );
  assert.deepEqual(
    store.list({ until: "2026-11-05", limit: 20 }).map((i) => i.id),
    ["d-mid", "a-old"],
  );
  assert.deepEqual(
    store.list({ limit: 2 }).map((i) => i.id),
    ["b-new", "c-new"],
  );
});

test("list: tag matching ignores case; an unknown tag gives an empty list", () => {
  const store = createStore(sample, 4, 0);
  assert.equal(store.list({ tag: "AI", limit: 20 }).length, 3);
  assert.deepEqual(store.list({ tag: "nope", limit: 20 }), []);
});

test("list: does not leak signals or files into the summary entries", () => {
  const store = createStore(
    [idea("x", "2026-11-10", { signals: [{ kind: "repo", url: "https://e.x/y", note: "n" }] })],
    1,
    0,
  );
  assert.deepEqual(Object.keys(store.list({ limit: 1 })[0]!).sort(), [
    "first_seen",
    "id",
    "last_seen",
    "summary",
    "tags",
    "title",
  ]);
});

test("search: case-insensitive over title, summary, tags and why_now; title matches rank first", () => {
  const store = createStore(
    [
      idea("by-summary", "2026-11-10", { summary: "talks about Rust a lot" }),
      idea("by-tag", "2026-11-09", { tags: ["rust"] }),
      idea("by-why", "2026-11-08", { why_now: "RUST is hot" }),
      idea("by-title-old", "2026-11-01", { title: "A rusty RUST tool" }),
      idea("no-match", "2026-11-10"),
    ],
    5,
    0,
  );
  assert.deepEqual(
    store.search("rust", 20).map((i) => i.id),
    ["by-title-old", "by-summary", "by-tag", "by-why"],
  );
  assert.deepEqual(
    store.search("RUST", 1).map((i) => i.id),
    ["by-title-old"],
  );
});

test("search: treats the query as plain text, not a pattern", () => {
  const store = createStore([idea("a", "2026-11-10", { title: "C++ (beta)" }), idea("b", "2026-11-10")], 2, 0);
  assert.deepEqual(
    store.search("c++ (", 20).map((i) => i.id),
    ["a"],
  );
  assert.deepEqual(store.search(".*", 20), []);
});

test("get: returns the full idea or undefined", () => {
  const full = idea("a", "2026-11-10", {
    signals: [{ kind: "repo", url: "https://e.x/y", note: "n" }],
    related_repos: ["o/r"],
  });
  const store = createStore([full], 1, 0);
  assert.deepEqual(store.get("a"), full);
  assert.equal(store.get("missing"), undefined);
});

test("stats and empty store", () => {
  assert.deepEqual(createStore(sample, 3, 1).stats, { ideas: 4, files: 3, skipped: 1 });
  const empty = createStore([], 0, 0);
  assert.deepEqual(empty.list({ limit: 20 }), []);
  assert.deepEqual(empty.search("x", 20), []);
});

test("clampLimit: default 20, range 1-100, whole numbers", () => {
  assert.equal(clampLimit(undefined), 20);
  assert.equal(clampLimit(0), 1);
  assert.equal(clampLimit(-5), 1);
  assert.equal(clampLimit(500), 100);
  assert.equal(clampLimit(7.9), 7);
  assert.equal(clampLimit(Number.NaN), 20);
});

test("isRealDate: YYYY-MM-DD calendar dates only", () => {
  assert.equal(isRealDate("2026-11-10"), true);
  assert.equal(isRealDate("2024-02-29"), true);
  assert.equal(isRealDate("2026-02-29"), false);
  assert.equal(isRealDate("2026-13-01"), false);
  assert.equal(isRealDate("2026-1-1"), false);
  assert.equal(isRealDate("yesterday"), false);
});
