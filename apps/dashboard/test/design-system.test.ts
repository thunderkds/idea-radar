import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, it } from "node:test";
import { renderTokensCss, type TokensJson } from "../lib/tokens-css";

const root = resolve(__dirname, "..");
const appDir = join(root, "app");
const tokensJson = JSON.parse(
  readFileSync(resolve(root, "../../docs/design-system/project/tokens.json"), "utf8"),
) as TokensJson & { color: { tokens: { name: string; value: string }[] } };

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const sources = walk(appDir).filter((f) => /\.(css|tsx?)$/.test(f));

describe("tokens.css", () => {
  it("is exactly what gen-tokens produces from tokens.json", () => {
    assert.equal(readFileSync(join(appDir, "tokens.css"), "utf8"), renderTokensCss(tokensJson));
  });
  it("defines every colour token as a custom property", () => {
    const css = readFileSync(join(appDir, "tokens.css"), "utf8");
    for (const t of tokensJson.color.tokens) assert.ok(css.includes(`--${t.name}: ${t.value};`), t.name);
    assert.ok(css.includes("--font-sans:") && css.includes("--font-mono:"));
  });
});

describe("components use tokens only", () => {
  // Matches #rgb, #rrggbb and #rrggbbaa, plus rgb()/rgba()/hsl() literals.
  const colour = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/;
  it("finds no colour literal in app/ outside tokens.css", () => {
    const offenders = sources
      .filter((f) => !f.endsWith("tokens.css"))
      .filter((f) => colour.test(readFileSync(f, "utf8")))
      .map((f) => f.slice(root.length + 1));
    assert.deepEqual(offenders, []);
  });
  it("the check itself catches a hex colour", () => {
    assert.ok(colour.test("color: #3CF5A8;"));
    assert.ok(colour.test("color: #fff;"));
    assert.ok(colour.test("background: rgba(0, 0, 0, 0.5)"));
    assert.ok(!colour.test('href="#main" color: var(--neon);'));
  });
  it("never injects raw HTML", () => {
    const offenders = sources.filter((f) => readFileSync(f, "utf8").includes("dangerouslySetInnerHTML"));
    assert.deepEqual(offenders, []);
  });
});

describe("fonts", () => {
  it("loads IBM Plex from @fontsource, with no remote font URL", () => {
    const layout = readFileSync(join(appDir, "layout.tsx"), "utf8");
    assert.ok(layout.includes("@fontsource/ibm-plex-sans/"));
    assert.ok(layout.includes("@fontsource/ibm-plex-mono/"));
    for (const f of sources) assert.ok(!/fonts\.(googleapis|gstatic)\.com/.test(readFileSync(f, "utf8")), f);
  });
});
