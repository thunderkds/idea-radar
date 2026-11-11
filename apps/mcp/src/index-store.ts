import { getIdea, listIdeas, logRejected, saveSubmission, searchIdeas } from "@idea-radar/db";
import type { createPool, StoredIdea } from "@idea-radar/db";
import { validateIdeaFile } from "@idea-radar/ideas";

type Pool = ReturnType<typeof createPool>;

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;
/** At most this many field errors are written to the run log, each cut to MAX_ERROR_CHARS. */
export const MAX_ERRORS = 50;
/** The caller (the routine) gets fewer: the first errors name the fix, and every extra line costs tokens on a resend. */
export const MAX_ANSWER_ERRORS = 10;
const MAX_ERROR_CHARS = 300;

/** The short form that list and search return; `get` returns the full idea. */
export interface IdeaSummary {
  id: string;
  title: string;
  summary: string;
  tags: string[];
  first_seen: string;
  last_seen: string;
}

export interface ListFilter {
  tag?: string;
  /** Inclusive, YYYY-MM-DD, compared with `last_seen`. */
  since?: string;
  until?: string;
  limit: number;
}

export type SubmitOutcome = { ok: true; saved: number; date: string } | { ok: false; errors: string[] };

export interface IdeaStore {
  list(filter: ListFilter): Promise<IdeaSummary[]>;
  search(query: string, limit: number): Promise<IdeaSummary[]>;
  get(id: string): Promise<StoredIdea | undefined>;
  /** Validate one submission against the schema and save it; a rejected call is written to the run log. */
  submit(payload: unknown): Promise<SubmitOutcome>;
  /** Resolves when the database answers a trivial query; rejects otherwise. */
  ping(): Promise<void>;
}

/** Default 20, whole numbers, clamped to 1-100. */
export function clampLimit(limit: number | undefined): number {
  if (limit === undefined || Number.isNaN(limit)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(limit)));
}

/** True for a real calendar date written as YYYY-MM-DD. */
export function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function summarize(i: StoredIdea): IdeaSummary {
  return {
    id: i.id,
    title: i.title,
    summary: i.summary,
    tags: i.tags,
    first_seen: i.first_seen,
    last_seen: i.last_seen,
  };
}

const clip = (line: string): string => (line.length > MAX_ERROR_CHARS ? `${line.slice(0, MAX_ERROR_CHARS)}...` : line);

/** At most `max` lines, each clipped, with a last line counting what was left out. */
function capErrors(errors: string[], max: number): string[] {
  const shown = errors.slice(0, max).map(clip);
  return errors.length > max ? [...shown, `... and ${errors.length - max} more errors`] : shown;
}

/** The store over Postgres. Callers pass already-cleaned input (see tools.ts); a database error rejects. */
export function createStore(pool: Pool): IdeaStore {
  /** Never fails: the run log is a record, and a failed log must not hide the real error from the caller. */
  const record = async (payload: unknown, error: string): Promise<void> => {
    const body = typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>) : {};
    try {
      await logRejected(pool, { date: body.date, routine: body.routine, error });
    } catch {
      /* the database is unreachable; the caller already gets an error */
    }
  };

  return {
    async list({ tag, since, until, limit }) {
      return (await listIdeas(pool, { tag, since, until, limit })).map(summarize);
    },
    async search(query, limit) {
      return (await searchIdeas(pool, query, limit)).map(summarize);
    },
    async get(id) {
      return (await getIdea(pool, id)) ?? undefined;
    },
    async submit(payload) {
      const checked = validateIdeaFile(payload, "submission");
      if (!checked.ok) {
        await record(payload, capErrors(checked.errors, MAX_ERRORS).join("\n"));
        return { ok: false, errors: capErrors(checked.errors, MAX_ANSWER_ERRORS) };
      }
      try {
        await saveSubmission(pool, checked.file);
        return { ok: true, saved: checked.file.ideas.length, date: checked.file.date };
      } catch (err) {
        // The message comes from Postgres; it is cut short and never carries the payload into the log on purpose.
        await record(payload, `save failed: ${clip(err instanceof Error ? err.message : String(err))}`);
        return { ok: false, errors: ["the database could not save this submission; nothing was written"] };
      }
    },
    async ping() {
      await pool.query("SELECT 1");
    },
  };
}
