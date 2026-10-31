/** Display helpers. Every one returns null for a missing value so the caller shows "no data", never 0. */

function isNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

const COUNT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export function formatCount(v: number | null | undefined): string | null {
  return isNumber(v) ? COUNT.format(v) : null;
}

/** Stars gained in a window: "+12". */
export function formatGained(v: number | null | undefined): string | null {
  const text = formatCount(v);
  return text === null ? null : `${(v as number) > 0 ? "+" : ""}${text}`;
}

/** Scores and score components are small decimals; three places keep them comparable. */
export function formatScore(v: number | null | undefined): string | null {
  return isNumber(v) ? v.toFixed(3) : null;
}

/** ISO timestamp or YYYY-MM-DD to YYYY-MM-DD in UTC; null for anything that is not a date. */
export function formatDate(v: string | null | undefined): string | null {
  if (typeof v !== "string" || v === "") return null;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
}

/** ISO timestamp to "YYYY-MM-DD HH:MM UTC"; null for anything that is not a date. */
export function formatDateTime(v: string | null | undefined): string | null {
  if (typeof v !== "string" || v === "") return null;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : `${new Date(t).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

/** Text value (language, license, ...) or null when empty. */
export function formatText(v: string | null | undefined): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}
