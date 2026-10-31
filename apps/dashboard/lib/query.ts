import type { StarsWindow, Tier } from "./types";

/** The filters the tier page keeps in the URL query. Empty values are dropped. */
export interface TierFilters {
  language?: string;
  topic?: string;
  collection?: string;
  /** Passed through unchecked: the API answers 400 with its own message for a bad value. */
  window?: string;
  cursor?: string;
}

type RawParams = Record<string, string | string[] | undefined>;

const KEYS = ["language", "topic", "collection", "window", "cursor"] as const;

export function parseTierFilters(raw: RawParams): TierFilters {
  const out: TierFilters = {};
  for (const key of KEYS) {
    const v = raw[key];
    const first = Array.isArray(v) ? v[0] : v;
    const trimmed = first?.trim();
    if (trimmed) out[key] = trimmed;
  }
  return out;
}

function toSearch(filters: TierFilters, withCursor: boolean): URLSearchParams {
  const params = new URLSearchParams();
  for (const key of KEYS) {
    if (key === "cursor" && !withCursor) continue;
    const v = filters[key];
    if (v) params.set(key, v);
  }
  return params;
}

/** Query string for `GET /tiers/:tier` (the 7d window is always sent so the row label matches the data). */
export function apiTierQuery(filters: TierFilters): string {
  const params = toSearch({ ...filters, window: filters.window ?? "7d" }, true);
  return params.toString();
}

export function tierPath(tier: Tier): string {
  return `/tiers/${tier}`;
}

/** Link to the page after `cursor`, keeping the filters. */
export function nextPageHref(tier: Tier, filters: TierFilters, cursor: string): string {
  const params = toSearch({ ...filters, cursor }, true);
  return `${tierPath(tier)}?${params.toString()}`;
}

/** Link to the first page of the same filters. */
export function firstPageHref(tier: Tier, filters: TierFilters): string {
  const query = toSearch(filters, false).toString();
  return query ? `${tierPath(tier)}?${query}` : tierPath(tier);
}

export function windowOf(filters: TierFilters): StarsWindow | string {
  return filters.window ?? "7d";
}

/** The tier a pathname belongs to (`/` is the Lowkey landing view); null for other pages. */
export function activeTier(pathname: string): Tier | null {
  if (pathname === "/") return "lowkey";
  const m = pathname.match(/^\/tiers\/(trending|medium|lowkey)\/?$/);
  return m ? (m[1] as Tier) : null;
}
