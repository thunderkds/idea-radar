export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 500;

/** Escape `\`, `%` and `_` so the text matches literally inside a LIKE pattern (backslash is LIKE's default escape). */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** A whole number in 1..MAX_LIMIT; anything that is not a number becomes DEFAULT_LIMIT. */
export function clampLimit(limit: number): number {
  if (!Number.isFinite(limit)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.trunc(limit)));
}

/** The string when it is a real calendar date written YYYY-MM-DD, else null. */
export function validDateOrNull(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value ? null : value;
}
