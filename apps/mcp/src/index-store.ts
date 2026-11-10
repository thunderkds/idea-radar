import type { MergedIdea } from "@idea-radar/ideas";

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

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

export interface StoreStats {
  ideas: number;
  files: number;
  skipped: number;
}

export interface IdeaStore {
  stats: StoreStats;
  list(filter: ListFilter): IdeaSummary[];
  search(query: string, limit: number): IdeaSummary[];
  get(id: string): MergedIdea | undefined;
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

function summarize(i: MergedIdea): IdeaSummary {
  return {
    id: i.id,
    title: i.title,
    summary: i.summary,
    tags: i.tags,
    first_seen: i.first_seen,
    last_seen: i.last_seen,
  };
}

/** Build the in-memory index once at boot; every method is a read over it. */
export function createStore(ideas: MergedIdea[], files: number, skipped: number): IdeaStore {
  // Newest last_seen first, ties by id (plain code-unit order, as in the loader).
  const sorted = [...ideas].sort((a, b) =>
    a.last_seen < b.last_seen ? 1 : a.last_seen > b.last_seen ? -1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
  const entries = sorted.map((idea) => ({
    idea,
    summary: summarize(idea),
    tags: idea.tags.map((t) => t.toLowerCase()),
    title: idea.title.toLowerCase(),
    rest: [idea.summary, idea.tags.join(" "), idea.why_now ?? ""].join("\n").toLowerCase(),
  }));
  const byId = new Map(ideas.map((i) => [i.id, i]));

  return {
    stats: { ideas: ideas.length, files, skipped },
    list({ tag, since, until, limit }) {
      const wanted = tag?.toLowerCase();
      const out: IdeaSummary[] = [];
      for (const e of entries) {
        if (out.length >= limit) break;
        if (wanted !== undefined && !e.tags.includes(wanted)) continue;
        if (since !== undefined && e.idea.last_seen < since) continue;
        if (until !== undefined && e.idea.last_seen > until) continue;
        out.push(e.summary);
      }
      return out;
    },
    search(query, limit) {
      const q = query.toLowerCase();
      const inTitle: IdeaSummary[] = [];
      const elsewhere: IdeaSummary[] = [];
      for (const e of entries) {
        if (e.title.includes(q)) inTitle.push(e.summary);
        else if (e.rest.includes(q)) elsewhere.push(e.summary);
      }
      return [...inTitle, ...elsewhere].slice(0, limit);
    },
    get: (id) => byId.get(id),
  };
}
