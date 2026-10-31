import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderTokensCss, type TokensJson } from "../lib/tokens-css";

export const DEFAULT_SOURCE = resolve(__dirname, "../../../docs/design-system/project/tokens.json");
export const DEFAULT_TARGET = resolve(__dirname, "../app/tokens.css");

/** Reads a tokens.json, writes the matching tokens.css, and returns the CSS. Nothing is written if the JSON is bad. */
export function generateTokens(source = DEFAULT_SOURCE, target = DEFAULT_TARGET): string {
  const css = renderTokensCss(JSON.parse(readFileSync(source, "utf8")) as TokensJson);
  writeFileSync(target, css);
  return css;
}

if (require.main === module) {
  generateTokens();
  console.log(`wrote ${DEFAULT_TARGET}`);
}
