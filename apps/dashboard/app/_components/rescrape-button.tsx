"use client";

import { useState, useTransition } from "react";
import { formatDateTime } from "../../lib/format";
import type { RescrapeResult, RescrapeTarget } from "../../lib/types";
import { rescrapeAction } from "./rescrape-action";

/** The line shown under a refresh button: when it was queued, or why it failed. */
export function rescrapeStatus(result: RescrapeResult): { text: string; error: boolean } {
  if (!result.ok) return { text: `Refresh failed: ${result.message}`, error: true };
  const when = formatDateTime(result.at) ?? result.at;
  return { text: result.queued > 1 ? `Refresh queued for ${result.queued} repos ${when}` : `Refresh queued ${when}`, error: false };
}

/** Run the refresh; a thrown error (the dashboard server is down or restarting) becomes a failed result instead of crashing the page. */
export async function runRescrape(
  run: (target: RescrapeTarget) => Promise<RescrapeResult>,
  target: RescrapeTarget,
): Promise<RescrapeResult> {
  try {
    return await run(target);
  } catch {
    return { ok: false, message: "Could not reach the dashboard server" };
  }
}

/** A secondary button that asks the dashboard server to refresh a repo or an idea group (T027). */
export function RescrapeButton({ label, target }: { label: string; target: RescrapeTarget }) {
  const [result, setResult] = useState<RescrapeResult | null>(null);
  const [pending, startTransition] = useTransition();
  const status = result ? rescrapeStatus(result) : null;
  return (
    <div className="rescrape">
      <button
        type="button"
        className="gm-btn gm-btn--secondary gm-btn--sm"
        disabled={pending}
        aria-busy={pending}
        onClick={() => startTransition(async () => setResult(await runRescrape(rescrapeAction, target)))}
      >
        {pending ? "Refreshing…" : label}
      </button>
      <p className={`rescrape__status${status?.error ? " rescrape__status--error" : ""}`} role="status">
        {status?.text}
      </p>
    </div>
  );
}
