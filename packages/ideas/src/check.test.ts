import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { checkIdeaDirs } from "./check.js";

const good = JSON.stringify({ schema_version: 1, date: "2026-11-10", routine: "r", ideas: [] });

function withRoot(files: Record<string, string>, run: (root: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), "ideas-check-"));
  try {
    mkdirSync(join(root, "examples"));
    for (const [name, body] of Object.entries(files)) writeFileSync(join(root, name), body);
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("an empty ideas directory passes", () => {
  withRoot({}, (root) => assert.deepEqual(checkIdeaDirs(root), { ok: true, lines: [] }));
});

test("valid files in ideas/ and ideas/examples/ pass", () => {
  withRoot({ "2026-11-10.json": good, "examples/2026-11-10.example.json": good }, (root) => {
    assert.equal(checkIdeaDirs(root).ok, true);
  });
});

test("an invalid file in ideas/examples/ fails and is named", () => {
  withRoot({ "examples/x.example.json": "{ nope" }, (root) => {
    const r = checkIdeaDirs(root);
    assert.equal(r.ok, false);
    assert.ok(r.lines.some((l) => l.includes("x.example.json") && l.includes("invalid JSON")));
  });
});

test("an invalid file in ideas/ fails", () => {
  withRoot(
    { "2026-11-10.json": JSON.stringify({ schema_version: 2, date: "2026-11-10", routine: "r", ideas: [] }) },
    (root) => {
      assert.equal(checkIdeaDirs(root).ok, false);
    },
  );
});
