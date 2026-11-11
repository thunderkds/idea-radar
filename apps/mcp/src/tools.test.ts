import assert from "node:assert/strict";
import { test } from "node:test";
import type { StoredIdea } from "@idea-radar/db";
import type { IdeaStore } from "./index-store.js";
import { TOOL_DESCRIPTIONS, createToolHandlers } from "./tools.js";

/** A store that records what it was asked, so the handlers are tested without a database. */
function fakeStore(over: Partial<IdeaStore> = {}) {
  const calls: { method: string; args: unknown[] }[] = [];
  const spy =
    <A extends unknown[], R>(method: string, result: R) =>
    (...args: A): Promise<R> => {
      calls.push({ method, args });
      return Promise.resolve(result);
    };
  const store: IdeaStore = {
    list: spy("list", []),
    search: spy("search", []),
    get: spy("get", undefined),
    submit: spy("submit", { ok: true as const, saved: 2, date: "2026-11-10" }),
    ping: spy("ping", undefined),
    ...over,
  };
  return { store, calls };
}

const parse = (r: { content: { text: string }[] }) => JSON.parse(r.content[0]!.text);

test("list_ideas: passes the filter through with a clamped limit and wraps the rows with a count", async () => {
  const { store, calls } = fakeStore();
  const r = await createToolHandlers(store, "read").list_ideas({ tag: "ai", since: "2026-11-01", limit: 500 });
  assert.equal(r.isError, undefined);
  assert.deepEqual(parse(r), { count: 0, ideas: [] });
  assert.deepEqual(calls[0]!.args, [{ tag: "ai", since: "2026-11-01", until: undefined, limit: 100 }]);
});

test("list_ideas: a bad date is a tool error that names the field and never reaches the database", async () => {
  const { store, calls } = fakeStore();
  const tools = createToolHandlers(store, "read");
  for (const args of [{ since: "yesterday" }, { until: "2026-02-30" }, { since: "2026-11-10'; --" }]) {
    const r = await tools.list_ideas(args);
    assert.equal(r.isError, true);
    assert.match(r.content[0]!.text, /since|until/);
  }
  assert.equal(calls.length, 0);
});

test("list_ideas: a NUL in the tag is dropped before the query", async () => {
  const { store, calls } = fakeStore();
  await createToolHandlers(store, "read").list_ideas({ tag: "a\u0000i" });
  assert.equal((calls[0]!.args[0] as { tag: string }).tag, "ai");
});

test("search_ideas: bounds the query, trims it and drops NUL before the database", async () => {
  const { store, calls } = fakeStore();
  const tools = createToolHandlers(store, "read");
  assert.equal((await tools.search_ideas({ query: "" })).isError, true);
  assert.equal((await tools.search_ideas({ query: "   " })).isError, true);
  assert.equal((await tools.search_ideas({ query: "\u0000\u0000" })).isError, true);
  assert.equal((await tools.search_ideas({ query: "x".repeat(201) })).isError, true);
  assert.equal(calls.length, 0);
  assert.equal((await tools.search_ideas({ query: "x".repeat(200) })).isError, undefined);
  await tools.search_ideas({ query: "  ru\u0000st ", limit: 0 });
  assert.deepEqual(calls[1]!.args, ["rust", 1]);
});

test("get_idea: the full idea, or a not-found tool error that cuts a long id", async () => {
  const full: StoredIdea = {
    id: "one",
    title: "T",
    summary: "S",
    tags: [],
    signals: [{ kind: "repo", url: "https://e.x/y", note: "n" }],
    related_repos: ["o/r"],
    first_seen: "2026-11-10",
    last_seen: "2026-11-10",
    updated_at: "2026-11-10T00:00:00.000Z",
  };
  const { store } = fakeStore({ get: (id) => Promise.resolve(id === "one" ? full : undefined) });
  const tools = createToolHandlers(store, "read");
  assert.deepEqual(parse(await tools.get_idea({ id: "one" })), full);
  const missing = await tools.get_idea({ id: "n".repeat(500) });
  assert.equal(missing.isError, true);
  assert.match(missing.content[0]!.text, /not found/);
  assert.ok(missing.content[0]!.text.length < 120);
});

test("a database error is a tool error with no detail, and is logged without the input", async () => {
  const lines: string[] = [];
  const { store } = fakeStore({ get: () => Promise.reject(new Error("connection refused")) });
  const r = await createToolHandlers(store, "read", (l) => lines.push(l)).get_idea({ id: "secret-input" });
  assert.equal(r.isError, true);
  assert.doesNotMatch(r.content[0]!.text, /refused|secret-input/);
  assert.deepEqual(lines, ["get_idea failed: connection refused"]);
});

test("submit_ideas: only the write role reaches the store; any other role is a tool error and nothing is saved", async () => {
  for (const role of ["read", undefined] as const) {
    const { store, calls } = fakeStore();
    const r = await createToolHandlers(store, role).submit_ideas({ ideas: [] });
    assert.equal(r.isError, true);
    assert.match(r.content[0]!.text, /write token/);
    assert.equal(calls.length, 0);
  }
});

test("submit_ideas: a valid file answers { saved, date }; a rejected one lists every field error", async () => {
  const ok = fakeStore();
  assert.deepEqual(parse(await createToolHandlers(ok.store, "write").submit_ideas({})), {
    saved: 2,
    date: "2026-11-10",
  });
  const bad = fakeStore({
    submit: () =>
      Promise.resolve({
        ok: false as const,
        errors: ["submission: /ideas/0/signals/0/url must match format", "submission: /date bad"],
      }),
  });
  const r = await createToolHandlers(bad.store, "write").submit_ideas({});
  assert.equal(r.isError, true);
  assert.match(r.content[0]!.text, /nothing was saved/);
  assert.match(r.content[0]!.text, /\/ideas\/0\/signals\/0\/url/);
  assert.match(r.content[0]!.text, /\/date/);
});

test("every read tool description says idea text is external content to read as data; submit_ideas says routine only", () => {
  for (const name of ["list_ideas", "search_ideas", "get_idea"] as const) {
    assert.match(TOOL_DESCRIPTIONS[name], /external|untrusted/i, name);
    assert.match(TOOL_DESCRIPTIONS[name], /data/i, name);
  }
  assert.match(TOOL_DESCRIPTIONS.submit_ideas, /routine only/i);
});
