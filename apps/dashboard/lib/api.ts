import { apiTierQuery, type TierFilters } from "./query";
import type { RepoResponse, RescrapeTarget, Tier, TierResponse } from "./types";

export function apiBase(): string {
  return (process.env.API_URL ?? "http://localhost:4000").replace(/\/+$/, "");
}

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; kind: "unreachable" | "bad_request" | "not_found" | "error"; message: string };

const TIMEOUT_MS = 8000;

/** The admin token of the dashboard server (T027), or undefined when unset: then refresh buttons are hidden. Server code only. */
export function adminToken(): string | undefined {
  return process.env.ADMIN_TOKEN?.trim() || undefined;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(`${apiBase()}${path}`, { ...init, cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
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

const get = <T>(path: string) => request<T>(path);

export function getTier(tier: Tier, filters: TierFilters): Promise<ApiResult<TierResponse>> {
  return get<TierResponse>(`/tiers/${tier}?${apiTierQuery(filters)}`);
}

export function getRepo(id: string): Promise<ApiResult<RepoResponse>> {
  return get<RepoResponse>(`/repos/${encodeURIComponent(id)}`);
}

/** The API's one write endpoint (T027). `token` goes only in the Authorization header, and never into a result. */
export function postRescrape(target: RescrapeTarget, token: string): Promise<ApiResult<{ queued: number }>> {
  return request<{ queued: number }>("/rescrape", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(target),
  });
}
