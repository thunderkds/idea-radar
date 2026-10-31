import type { Queryable } from "./index.js";

/** One lowkey row of a scoring date, as exported for hand-labelling. */
export interface LowkeyRow {
  repoId: number;
  fullName: string;
  score: number;
}

export interface PrecisionResult {
  k: number;
  /** Lowkey rows found for the date among the top `k` (less than `k` when the date has fewer). */
  topCount: number;
  /** Of those, how many have a good or bad label. */
  labelled: number;
  good: number;
  /** good / labelled; null when nothing in the top `k` is labelled. */
  precision: number | null;
}

export const CSV_HEADER = ["repo_id", "full_name", "score", "url", "label"] as const;

/** Every lowkey row of `date`, best score first (ties by repo_id). */
async function lowkeyRows(db: Queryable, date: string, limit?: number): Promise<LowkeyRow[]> {
  const { rows } = await db.query<{ repo_id: number; full_name: string; score: number }>(
    `SELECT s.repo_id, r.full_name, s.score
     FROM repo_scores s JOIN repos r USING (repo_id)
     WHERE s.date = $1::date AND s.tier = 'lowkey'
     ORDER BY s.score DESC, s.repo_id ASC
     LIMIT $2`,
    [date, limit ?? null],
  );
  return rows.map((r) => ({ repoId: r.repo_id, fullName: r.full_name, score: r.score }));
}

/** Small seeded PRNG (mulberry32) so the same date and seed always give the same sample. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * About `limit` lowkey rows of `date` to label by hand: the `top` best-scored rows plus a seeded random
 * sample of the rest, shuffled together so the labeller cannot read the rank from the order.
 */
export async function sampleLowkeyForLabelling(
  db: Queryable,
  date: string,
  opts: { limit?: number; top?: number; seed?: number } = {},
): Promise<LowkeyRow[]> {
  const limit = opts.limit ?? 200;
  const top = Math.min(opts.top ?? 50, limit);
  const random = rng(opts.seed ?? 42);
  const all = await lowkeyRows(db, date);
  const rest = shuffle(all.slice(top), random).slice(0, Math.max(limit - top, 0));
  return shuffle([...all.slice(0, top), ...rest], random);
}

function csvField(v: string | number): string {
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV text for the labelling sheet; `label` is left empty. */
export function labelSheetCsv(rows: LowkeyRow[]): string {
  const lines = [CSV_HEADER.join(",")];
  for (const r of rows) {
    const url = `https://github.com/${r.fullName}`;
    lines.push([r.repoId, r.fullName, r.score, url, ""].map(csvField).join(","));
  }
  return `${lines.join("\n")}\n`;
}

/** Parse CSV (RFC 4180 quoting) into rows of fields. Blank lines are skipped. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((f) => f !== "")) rows.push(row);
  return rows;
}

const GOOD = new Set(["1", "y", "yes", "good", "true"]);
const BAD = new Set(["0", "n", "no", "bad", "false"]);

/**
 * Labels by `repo_id` from a filled-in sheet: true = good, false = bad. An empty label is left out
 * (not labelled). An unknown label throws, so a typo cannot silently shrink the labelled set.
 */
export function parseLabels(csv: string): Map<number, boolean> {
  const [header, ...rows] = parseCsv(csv);
  if (!header) throw new Error("label file is empty");
  const col = (name: string) => {
    const i = header.map((h) => h.trim()).indexOf(name);
    if (i < 0) throw new Error(`label file has no "${name}" column`);
    return i;
  };
  const idCol = col("repo_id");
  const labelCol = col("label");
  const out = new Map<number, boolean>();
  rows.forEach((r, n) => {
    const raw = (r[labelCol] ?? "").trim().toLowerCase();
    if (raw === "") return;
    const repoId = Number(r[idCol]);
    if (!Number.isSafeInteger(repoId)) throw new Error(`label file row ${n + 2}: bad repo_id "${r[idCol]}"`);
    if (GOOD.has(raw)) out.set(repoId, true);
    else if (BAD.has(raw)) out.set(repoId, false);
    else throw new Error(`label file row ${n + 2}: unknown label "${r[labelCol]}" (use good/bad, 1/0, yes/no)`);
  });
  return out;
}

/** Precision@k of the lowkey ranking of `date`: the good share of the labelled rows among the top `k`. */
export async function precisionAtK(
  db: Queryable,
  date: string,
  labels: Map<number, boolean>,
  k = 50,
): Promise<PrecisionResult> {
  const top = await lowkeyRows(db, date, k);
  const labelled = top.filter((r) => labels.has(r.repoId));
  const good = labelled.filter((r) => labels.get(r.repoId)).length;
  return {
    k,
    topCount: top.length,
    labelled: labelled.length,
    good,
    precision: labelled.length === 0 ? null : good / labelled.length,
  };
}
