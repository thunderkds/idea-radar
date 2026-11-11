import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { validateIdeaFile } from "./validate.js";
import type { IdeaFile } from "./types.js";

const examplePath = new URL("../../../ideas/examples/2026-11-10.example.json", import.meta.url);
const example = (): any => JSON.parse(readFileSync(examplePath, "utf8"));

function errorsOf(json: unknown, name = "ideas/t.json"): string[] {
  const r = validateIdeaFile(json, name);
  assert.equal(r.ok, false);
  return r.ok ? [] : r.errors;
}

test("the example file is valid and typed as an IdeaFile", () => {
  const r = validateIdeaFile(example(), "ideas/examples/2026-11-10.example.json");
  assert.equal(r.ok, true);
  if (r.ok) {
    const file: IdeaFile = r.file;
    assert.equal(file.ideas[0]?.id, "offline-first-markdown-notes-sync");
  }
});

test("an empty day is valid", () => {
  const r = validateIdeaFile({ schema_version: 1, date: "2026-11-10", routine: "r", ideas: [] }, "f.json");
  assert.equal(r.ok, true);
});

test("a non-http signal url is rejected, naming file and field", () => {
  const f = example();
  f.ideas[0].signals[0].url = "ftp://x";
  const errors = errorsOf(f);
  assert.ok(
    errors.some((e) => e.startsWith("ideas/t.json: /ideas/0/signals/0/url ")),
    errors.join("\n"),
  );
});

test("an extra property is rejected, naming the property", () => {
  const f = example();
  f.ideas[0].score = 9;
  const errors = errorsOf(f);
  assert.ok(
    errors.some((e) => e.includes("ideas/t.json: /ideas/0") && e.includes("score")),
    errors.join("\n"),
  );
});

test("a bad id is rejected, naming /ideas/0/id", () => {
  const f = example();
  f.ideas[0].id = "Not A Slug";
  assert.ok(errorsOf(f).some((e) => e.startsWith("ideas/t.json: /ideas/0/id ")));
});

test("schema_version 2 is rejected, naming /schema_version", () => {
  const f = example();
  f.schema_version = 2;
  assert.ok(errorsOf(f).some((e) => e.startsWith("ideas/t.json: /schema_version ")));
});

test("a missing required field is rejected", () => {
  const f = example();
  delete f.routine;
  assert.ok(errorsOf(f).some((e) => e.includes("routine")));
});

test("an impossible calendar date is rejected", () => {
  const f = example();
  f.date = "2026-02-31";
  assert.ok(errorsOf(f).some((e) => e.startsWith("ideas/t.json: /date ")));
});

test("a non-object top level is rejected", () => {
  assert.ok(errorsOf([]).length > 0);
  assert.ok(errorsOf(null).length > 0);
});

test("a duplicate id within one file names both indexes", () => {
  const f = example();
  f.ideas.push({ ...f.ideas[0] });
  const errors = errorsOf(f);
  assert.ok(
    errors.some((e) => e.includes("/ideas/1/id") && e.includes("/ideas/0/id")),
    errors.join("\n"),
  );
});

test("more than 100 ideas is rejected", () => {
  const f = example();
  f.ideas = Array.from({ length: 101 }, (_, i) => ({ ...f.ideas?.[0], id: `idea-${i}` }));
  assert.ok(errorsOf(f).some((e) => e.startsWith("ideas/t.json: /ideas ")));
});

test("an enum error names the allowed values, so a wrong signal kind can be fixed in one resend", () => {
  const f = example();
  f.ideas[0].signals[0].kind = "github";
  const errors = errorsOf(f);
  assert.ok(
    errors.includes(
      "ideas/t.json: /ideas/0/signals/0/kind must be equal to one of the allowed values (repo, article, post, discussion, other)",
    ),
    errors.join("\n"),
  );
});

test("only enum errors get the allowed-values suffix; other messages keep their text", () => {
  const f = example();
  f.ideas[0].id = "Not A Slug";
  f.ideas[0].score = 9;
  const errors = errorsOf(f);
  assert.ok(
    errors.some((e) => e.includes("/id must match pattern")),
    errors.join("\n"),
  );
  assert.ok(
    errors.every((e) => !e.includes("allowed values")),
    errors.join("\n"),
  );
});
