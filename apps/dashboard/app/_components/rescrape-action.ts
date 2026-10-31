"use server";

import { adminToken, postRescrape } from "../../lib/api";
import type { RescrapeResult, RescrapeTarget } from "../../lib/types";

/** The same rules as the API's POST /rescrape, because the browser can send this action anything. */
function validTarget(t: unknown): t is RescrapeTarget {
  if (typeof t !== "object" || t === null || Array.isArray(t)) return false;
  const { repoId, groupKey } = t as Record<string, unknown>;
  if ((repoId === undefined) === (groupKey === undefined)) return false;
  if (repoId !== undefined) return typeof repoId === "number" && Number.isSafeInteger(repoId) && repoId >= 1;
  return typeof groupKey === "string" && groupKey.trim() !== "" && groupKey.length <= 200;
}

/**
 * Server action behind the refresh buttons (T027). It runs on the dashboard server, adds the Authorization header there,
 * and returns only a result, so `ADMIN_TOKEN` never reaches the browser bundle or the HTML.
 */
export async function rescrapeAction(target: RescrapeTarget): Promise<RescrapeResult> {
  const token = adminToken();
  if (!token) return { ok: false, message: "Refresh is not enabled on this dashboard" };
  if (!validTarget(target)) return { ok: false, message: "Invalid refresh request" };
  const res = await postRescrape(target, token);
  if (!res.ok) return { ok: false, message: res.message };
  return { ok: true, queued: res.data.queued, at: new Date().toISOString() };
}
