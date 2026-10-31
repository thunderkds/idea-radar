// Export about 200 lowkey rows of a scoring date to CSV for hand-labelling (T010, HUN-150).
// Usage: pnpm label -- --date YYYY-MM-DD --out labels.csv [--limit 200] [--top 50] [--seed 42]
// Reads DATABASE_URL. Fill the `label` column with good / bad, then run `pnpm precision`.
import { writeFileSync } from "node:fs";
import { createPool, labelSheetCsv, sampleLowkeyForLabelling } from "../packages/db/src/index.ts";
import { parseArgs } from "./cli-args.ts";

const args = parseArgs(process.argv.slice(2));
const date = args.date;
const out = args.out;
if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !out) {
  console.error("usage: pnpm label -- --date YYYY-MM-DD --out file.csv [--limit 200] [--top 50] [--seed 42]");
  process.exit(2);
}

const pool = createPool();
try {
  const rows = await sampleLowkeyForLabelling(pool, date, {
    limit: args.limit ? Number(args.limit) : undefined,
    top: args.top ? Number(args.top) : undefined,
    seed: args.seed ? Number(args.seed) : undefined,
  });
  writeFileSync(out, labelSheetCsv(rows));
  console.log(`wrote ${rows.length} lowkey rows of ${date} to ${out}`);
} finally {
  await pool.end();
}
