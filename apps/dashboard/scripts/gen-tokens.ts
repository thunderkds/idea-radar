import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderTokensCss, type TokensJson } from "../lib/tokens-css";

const source = resolve(__dirname, "../../../docs/design-system/project/tokens.json");
const target = resolve(__dirname, "../app/tokens.css");

writeFileSync(target, renderTokensCss(JSON.parse(readFileSync(source, "utf8")) as TokensJson));
console.log(`wrote ${target}`);
