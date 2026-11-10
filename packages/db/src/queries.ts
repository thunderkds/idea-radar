import type { Idea } from "@idea-radar/ideas";
import type pg from "pg";
import { clampLimit, escapeLike } from "./util.js";

/** An idea as stored: the submission's fields plus the merge bookkeeping (dates are YYYY-MM-DD, `updated_at` ISO-8601). */
export interface StoredIdea extends Idea {
  first_seen: string;
  last_seen: string;
  updated_at: string;
}

export interface ListOptions {
  /** Exact tag, compared lowercase. */
  tag?: string;
  /** Only ideas whose `last_seen` is on or after this date (YYYY-MM-DD). */
  since?: string;
  /** Only ideas whose `last_seen` is on or before this date (YYYY-MM-DD). */
  until?: string;
  /** Clamped to 1..500. */
  limit: number;
}

export interface Stats {
  ideas: number;
  runs: number;
  /** ISO-8601 time of the latest run (ok or rejected), or null. */
  last_run: string | null;
}

// Dates are cast to text so they stay YYYY-MM-DD strings (the pg driver would make them local-time Date objects).
const COLUMNS = `id, title, summary, why_now, tags, signals, related_repos,
  first_seen::text AS first_seen, last_seen::text AS last_seen, updated_at`;

interface Row extends Omit<StoredIdea, "why_now" | "updated_at"> {
  why_now: string | null;
  updated_at: Date;
}

function toIdea(row: Row): StoredIdea {
  const { why_now, updated_at, ...rest } = row;
  return { ...rest, ...(why_now === null ? {} : { why_now }), updated_at: updated_at.toISOString() };
}

/** Newest `last_seen` first, ties by id. Optional tag and date-range filters. Invalid date text is a Postgres error. */
export async function listIdeas(pool: pg.Pool, opts: ListOptions): Promise<StoredIdea[]> {
  const res = await pool.query<Row>(
    `SELECT ${COLUMNS} FROM ideas
      WHERE ($1::text IS NULL OR $1::text = ANY(tags))
        AND ($2::date IS NULL OR last_seen >= $2::date)
        AND ($3::date IS NULL OR last_seen <= $3::date)
      ORDER BY last_seen DESC, id
      LIMIT $4`,
    [opts.tag?.toLowerCase() ?? null, opts.since ?? null, opts.until ?? null, clampLimit(opts.limit)],
  );
  return res.rows.map(toIdea);
}

/**
 * Case-insensitive substring match over title, summary, tags and why_now. `%`, `_` and `\` in the query are
 * literal text. Title matches come first, then newest `last_seen`. A blank query matches nothing.
 */
export async function searchIdeas(pool: pg.Pool, query: string, limit: number): Promise<StoredIdea[]> {
  const text = query.trim();
  if (text === "") return [];
  const res = await pool.query<Row>(
    `SELECT ${COLUMNS} FROM ideas
      WHERE search_text LIKE '%' || lower($1::text) || '%'
      ORDER BY (lower(title) LIKE '%' || lower($1::text) || '%') DESC, last_seen DESC, id
      LIMIT $2`,
    [escapeLike(text), clampLimit(limit)],
  );
  return res.rows.map(toIdea);
}

export async function getIdea(pool: pg.Pool, id: string): Promise<StoredIdea | null> {
  const res = await pool.query<Row>(`SELECT ${COLUMNS} FROM ideas WHERE id = $1`, [id]);
  return res.rows[0] ? toIdea(res.rows[0]) : null;
}

export async function stats(pool: pg.Pool): Promise<Stats> {
  const res = await pool.query<{ ideas: string; runs: string; last_run: Date | null }>(
    "SELECT (SELECT count(*) FROM ideas) AS ideas, (SELECT count(*) FROM runs) AS runs, (SELECT max(received_at) FROM runs) AS last_run",
  );
  const r = res.rows[0];
  return { ideas: Number(r.ideas), runs: Number(r.runs), last_run: r.last_run ? r.last_run.toISOString() : null };
}
