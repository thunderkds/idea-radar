import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { loadIdeas } from "./load.js";

function idea(id: string, title: string) {
  return { id, title, summary: `summary of ${title}`, tags: ["t"], signals: [], related_repos: [] };
}
function file(date: string, ...ideas: ReturnType<typeof idea>[]) {
  return JSON.stringify({ schema_version: 1, date, routine: "r", ideas });
}
function withDir(files: Record<string, string>, run: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "ideas-"));
  try {
    for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
    run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("the later date wins and first_seen/last_seen/files are filled", () => {
  withDir(
    {
      "2026-11-09.json": file("2026-11-09", idea("a", "A old")),
      "2026-11-10.json": file("2026-11-10", idea("a", "A new"), idea("b", "B")),
    },
    (dir) => {
      const { ideas, skipped } = loadIdeas(dir);
      assert.deepEqual(skipped, []);
      const a = ideas.find((i) => i.id === "a")!;
      assert.equal(a.title, "A new");
      assert.equal(a.first_seen, "2026-11-09");
      assert.equal(a.last_seen, "2026-11-10");
      assert.deepEqual(a.files, ["2026-11-09.json", "2026-11-10.json"]);
      const b = ideas.find((i) => i.id === "b")!;
      assert.equal(b.first_seen, "2026-11-10");
      assert.deepEqual(b.files, ["2026-11-10.json"]);
    },
  );
});

test("the same date: the file name that sorts last wins", () => {
  withDir(
    {
      "2026-11-10.json": file("2026-11-10", idea("a", "first")),
      "2026-11-10-b.json": file("2026-11-10", idea("a", "second")),
    },
    (dir) => {
      assert.equal(loadIdeas(dir).ideas[0]?.title, "first"); // "2026-11-10.json" > "2026-11-10-b.json" ('.' > '-')
    },
  );
});

test("output is identical whatever the creation (readdir) order", () => {
  const files = {
    "2026-11-08.json": file("2026-11-08", idea("a", "A8"), idea("c", "C8")),
    "2026-11-09.json": file("2026-11-09", idea("a", "A9"), idea("b", "B9")),
    "2026-11-10.json": file("2026-11-10", idea("b", "B10")),
  };
  const reversed = Object.fromEntries(Object.entries(files).reverse());
  let one: unknown, two: unknown;
  withDir(files, (dir) => (one = loadIdeas(dir)));
  withDir(reversed, (dir) => (two = loadIdeas(dir)));
  assert.deepEqual(one, two);
});

test("a broken JSON file is skipped with a reason; the valid file still loads", () => {
  withDir({ "2026-11-09.json": "{ nope", "2026-11-10.json": file("2026-11-10", idea("a", "A")) }, (dir) => {
    const { ideas, skipped } = loadIdeas(dir);
    assert.equal(ideas.length, 1);
    assert.equal(skipped.length, 1);
    assert.equal(skipped[0]?.file, "2026-11-09.json");
    assert.match(skipped[0]!.reason, /invalid JSON/);
  });
});

test("a schema-invalid file is skipped with file and field in the reason", () => {
  const bad = JSON.stringify({ schema_version: 1, date: "2026-11-09", routine: "r", ideas: [idea("Bad Id", "x")] });
  withDir({ "2026-11-09.json": bad, "2026-11-10.json": file("2026-11-10", idea("a", "A")) }, (dir) => {
    const { ideas, skipped } = loadIdeas(dir);
    assert.equal(ideas.length, 1);
    assert.match(skipped[0]!.reason, /2026-11-09\.json: \/ideas\/0\/id /);
  });
});

test("an unknown schema_version is skipped with a clear reason", () => {
  withDir(
    { "2026-11-10.json": JSON.stringify({ schema_version: 2, date: "2026-11-10", routine: "r", ideas: [] }) },
    (dir) => {
      const { ideas, skipped } = loadIdeas(dir);
      assert.deepEqual(ideas, []);
      assert.match(skipped[0]!.reason, /unsupported schema_version 2/);
    },
  );
});

test("a file over 1 MB is skipped without being parsed", () => {
  withDir({ "big.json": " ".repeat(1024 * 1024 + 1) }, (dir) => {
    const { ideas, skipped } = loadIdeas(dir);
    assert.deepEqual(ideas, []);
    assert.match(skipped[0]!.reason, /larger than 1 MB/);
  });
});

test("schema.json, non-.json files and sub-directories are ignored", () => {
  withDir({ "schema.json": "{}", "README.md": "x", "2026-11-10.json": file("2026-11-10", idea("a", "A")) }, (dir) => {
    mkdirSync(join(dir, "examples"));
    writeFileSync(join(dir, "examples", "x.json"), "{ nope");
    const { ideas, skipped } = loadIdeas(dir);
    assert.equal(ideas.length, 1);
    assert.deepEqual(skipped, []);
  });
});

test("an empty or missing directory loads nothing", () => {
  withDir({}, (dir) => assert.deepEqual(loadIdeas(dir), { ideas: [], skipped: [] }));
  assert.deepEqual(loadIdeas(join(tmpdir(), "does-not-exist-ideas")), { ideas: [], skipped: [] });
});
