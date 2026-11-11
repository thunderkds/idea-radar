import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { TOKENS_CSS } from "./tokens-css.js";

interface Named {
  name: string;
  value: string;
}
interface TokensJson {
  color: { tokens: Named[] };
  type: { families: { sans: string; mono: string } };
  spacing: { tokens: Named[] };
  radius: { tokens: Named[] };
  shadow: { tokens: Named[] };
  filter: { tokens: Named[] };
  layout: { tokens: Named[] };
}

/** The same rendering that produced `tokens-css.ts`: every token as a `--name` custom property on :root. */
export function renderTokensCss(tokens: TokensJson): string {
  const lines: string[] = [];
  const add = (group: string, list: Named[]) => {
    lines.push(`  /* ${group} */`);
    for (const t of list) lines.push(`  --${t.name}: ${t.value};`);
  };
  add("color", tokens.color.tokens);
  lines.push("  /* type */");
  lines.push(`  --font-sans: ${tokens.type.families.sans};`);
  lines.push(`  --font-mono: ${tokens.type.families.mono};`);
  add("spacing", tokens.spacing.tokens);
  add("radius", tokens.radius.tokens);
  add("shadow", tokens.shadow.tokens);
  add("filter", tokens.filter.tokens);
  add("layout", tokens.layout.tokens);
  return [":root {", ...lines, "}"].join("\n");
}

test("tokens-css.ts is the Graphite Mint tokens.json rendered as CSS variables (regenerate it if this fails)", () => {
  const json = JSON.parse(
    readFileSync(new URL("../../../docs/design-system/project/tokens.json", import.meta.url), "utf8"),
  ) as TokensJson;
  assert.equal(TOKENS_CSS, renderTokensCss(json));
});
