import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { DEFAULT_SOURCE, DEFAULT_TARGET, generateTokens } from "./gen-tokens";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "gen-tokens-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const small = {
  color: { tokens: [{ name: "bg", value: "#101010" }] },
  type: { families: { sans: "Sans", mono: "Mono" } },
  spacing: { tokens: [{ name: "space-1", value: "4px" }] },
  radius: { tokens: [{ name: "radius-sm", value: "2px" }] },
  shadow: { tokens: [{ name: "glow", value: "none" }] },
  filter: { tokens: [{ name: "blur", value: "blur(2px)" }] },
  layout: { tokens: [{ name: "topbar-h", value: "56px" }] },
};

describe("generateTokens", () => {
  it("reads a tokens.json and writes the matching tokens.css", () => {
    const source = join(dir, "tokens.json");
    const target = join(dir, "tokens.css");
    writeFileSync(source, JSON.stringify(small));
    const css = generateTokens(source, target);
    assert.equal(readFileSync(target, "utf8"), css);
    assert.match(css, /--bg: #101010;/);
    assert.match(css, /--font-sans: Sans;/);
    assert.match(css, /--topbar-h: 56px;/);
  });
  it("overwrites an older tokens.css", () => {
    const source = join(dir, "tokens.json");
    const target = join(dir, "tokens.css");
    writeFileSync(source, JSON.stringify(small));
    writeFileSync(target, "stale");
    generateTokens(source, target);
    assert.doesNotMatch(readFileSync(target, "utf8"), /stale/);
  });
  it("fails on a tokens file that is not JSON, and leaves the target alone", () => {
    const source = join(dir, "tokens.json");
    const target = join(dir, "tokens.css");
    writeFileSync(source, "not json");
    writeFileSync(target, "keep");
    assert.throws(() => generateTokens(source, target));
    assert.equal(readFileSync(target, "utf8"), "keep");
  });
  it("matches the checked-in app/tokens.css when run on the design-system tokens", () => {
    const target = join(dir, "tokens.css");
    generateTokens(DEFAULT_SOURCE, target);
    assert.equal(readFileSync(target, "utf8"), readFileSync(DEFAULT_TARGET, "utf8"));
  });
});
