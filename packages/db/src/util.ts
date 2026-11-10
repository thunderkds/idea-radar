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

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Throw unless the URL points at this machine. The integration suite runs
 * `DROP TABLE IF EXISTS ideas, runs, schema_migrations`, so it must never reach a real database.
 * Fails closed: an unparsable URL throws, and so does a `host`/`hostaddr` query parameter (pg lets it
 * override the authority). The message names the host, never the password or the full URL.
 */
export function assertLoopbackDatabaseUrl(url: string): void {
  const refusal = (host: string): Error =>
    new Error(
      `TEST_DATABASE_URL host "${host}" is not loopback (localhost, 127.0.0.1, [::1]). ` +
        "The integration suite drops tables ideas, runs, schema_migrations, so it only runs against a local database.",
    );
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw refusal("(unparsable URL)");
  }
  if (!LOOPBACK_HOSTS.has(parsed.hostname)) throw refusal(parsed.hostname);
  if (parsed.searchParams.has("host") || parsed.searchParams.has("hostaddr")) {
    throw refusal(`${parsed.hostname} with a host/hostaddr query parameter`);
  }
}
