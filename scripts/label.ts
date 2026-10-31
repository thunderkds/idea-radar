// Export about 200 lowkey rows of a scoring date to CSV for hand-labelling (T010, HUN-150).
// Usage: pnpm label -- --date YYYY-MM-DD --out labels.csv [--limit 200] [--top 50] [--seed 42]
// Reads DATABASE_URL. Fill the `label` column with good / bad, then run `pnpm precision`.
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { createPool, labelSheetCsv, sampleLowkeyForLabelling, type Queryable } from "../packages/db/src/index.ts";
import { parseArgs } from "./cli-args.ts";

export const LABEL_USAGE = "usage: pnpm label -- --date YYYY-MM-DD --out file.csv [--limit 200] [--top 50] [--seed 42]";

export interface LabelOptions {
  date: string;
  out: string;
  limit?: number;
  top?: number;
  seed?: number;
}

/** Options from the command line, or null when `--date` or `--out` is missing or malformed (print usage). */
export function parseLabelArgs(argv: string[]): LabelOptions | null {
  const args = parseArgs(argv);
  const { date, out } = args;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !out) return null;
  return {
    date,
    out,
    limit: args.limit ? Number(args.limit) : undefined,
    top: args.top ? Number(args.top) : undefined,
    seed: args.seed ? Number(args.seed) : undefined,
  };
}

/** Sample the lowkey rows of `opts.date`, write the label sheet to `opts.out`, return the summary line. */
export async function runLabel(db: Queryable, opts: LabelOptions): Promise<string> {
  const rows = await sampleLowkeyForLabelling(db, opts.date, { limit: opts.limit, top: opts.top, seed: opts.seed });
  writeFileSync(opts.out, labelSheetCsv(rows));
  return `wrote ${rows.length} lowkey rows of ${opts.date} to ${opts.out}`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const opts = parseLabelArgs(process.argv.slice(2));
  if (!opts) {
    console.error(LABEL_USAGE);
    process.exit(2);
  }
  const pool = createPool();
  try {
    console.log(await runLabel(pool, opts));
  } finally {
    await pool.end();
  }
}
