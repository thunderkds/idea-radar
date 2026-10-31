// Precision@50 of the lowkey ranking of a scoring date against a hand-labelled CSV (T010, HUN-150).
// Usage: pnpm precision -- --date YYYY-MM-DD --labels labels.csv [--k 50]
// Reads DATABASE_URL. The label column takes good/bad (also 1/0, yes/no); empty means not labelled.
import { readFileSync } from "node:fs";
import { createPool, parseLabels, precisionAtK } from "../packages/db/src/index.ts";
import { parseArgs } from "./cli-args.ts";

const args = parseArgs(process.argv.slice(2));
const date = args.date;
const file = args.labels;
if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !file) {
  console.error("usage: pnpm precision -- --date YYYY-MM-DD --labels file.csv [--k 50]");
  process.exit(2);
}

const pool = createPool();
try {
  const k = args.k ? Number(args.k) : 50;
  const r = await precisionAtK(pool, date, parseLabels(readFileSync(file, "utf8")), k);
  const value = r.precision === null ? "n/a (none of the top rows is labelled)" : r.precision.toFixed(3);
  console.log(`precision@${r.k} = ${value} (${r.good} good of ${r.labelled} labelled)`);
  console.log(`labelled ${r.labelled} of the ${r.topCount} top-scored lowkey rows of ${date}`);
} finally {
  await pool.end();
}
