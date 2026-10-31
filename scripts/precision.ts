// Precision@50 of the lowkey ranking of a scoring date against a hand-labelled CSV (T010, HUN-150).
// Usage: pnpm precision -- --date YYYY-MM-DD --labels labels.csv [--k 50]
// Reads DATABASE_URL. The label column takes good/bad (also 1/0, yes/no); empty means not labelled.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import {
  createPool,
  parseLabels,
  precisionAtK,
  type PrecisionResult,
  type Queryable,
} from "../packages/db/src/index.ts";
import { parseArgs } from "./cli-args.ts";

export const PRECISION_USAGE = "usage: pnpm precision -- --date YYYY-MM-DD --labels file.csv [--k 50]";

export interface PrecisionOptions {
  date: string;
  labels: string;
  k: number;
}

/** Options from the command line, or null when `--date` or `--labels` is missing or malformed (print usage). */
export function parsePrecisionArgs(argv: string[]): PrecisionOptions | null {
  const args = parseArgs(argv);
  const { date, labels } = args;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !labels) return null;
  return { date, labels, k: args.k ? Number(args.k) : 50 };
}

/** The two report lines for a precision result. */
export function formatPrecision(r: PrecisionResult, date: string): string[] {
  const value = r.precision === null ? "n/a (none of the top rows is labelled)" : r.precision.toFixed(3);
  return [
    `precision@${r.k} = ${value} (${r.good} good of ${r.labelled} labelled)`,
    `labelled ${r.labelled} of the ${r.topCount} top-scored lowkey rows of ${date}`,
  ];
}

/** Read the label file and report precision@k of the lowkey ranking of `opts.date`. */
export async function runPrecision(db: Queryable, opts: PrecisionOptions): Promise<string[]> {
  const r = await precisionAtK(db, opts.date, parseLabels(readFileSync(opts.labels, "utf8")), opts.k);
  return formatPrecision(r, opts.date);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const opts = parsePrecisionArgs(process.argv.slice(2));
  if (!opts) {
    console.error(PRECISION_USAGE);
    process.exit(2);
  }
  const pool = createPool();
  try {
    for (const line of await runPrecision(pool, opts)) console.log(line);
  } finally {
    await pool.end();
  }
}
