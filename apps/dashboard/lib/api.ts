import { apiTierQuery, type TierFilters } from "./query";
import type { RepoResponse, Tier, TierResponse } from "./types";

export function apiBase(): string {
  return (process.env.API_URL ?? "http://localhost:4000").replace(/\/+$/, "");
}

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; kind: "unreachable" | "bad_request" | "not_found" | "error"; message: string };

const TIMEOUT_MS = 8000;

async function get<T>(path: string): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(`${apiBase()}${path}`, { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    return { ok: false, kind: "unreachable", message: "API unreachable" };
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // a non-JSON body keeps the status-based message below
  }
  if (res.ok) return { ok: true, data: body as T };
  const message =
    body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string"
      ? (body as { error: string }).error
      : `API answered ${res.status}`;
  if (res.status === 400) return { ok: false, kind: "bad_request", message };
  if (res.status === 404) return { ok: false, kind: "not_found", message };
  return { ok: false, kind: "error", message };
}

export function getTier(tier: Tier, filters: TierFilters): Promise<ApiResult<TierResponse>> {
  return get<TierResponse>(`/tiers/${tier}?${apiTierQuery(filters)}`);
}

export function getRepo(id: string): Promise<ApiResult<RepoResponse>> {
  return get<RepoResponse>(`/repos/${encodeURIComponent(id)}`);
}
