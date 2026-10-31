import { buildRegistry } from "@idea-radar/connectors";
import type { ConnectorRunResult, SourceConnector } from "@idea-radar/core";

/**
 * Minimal scheduler. GH Archive runs hourly; everything else daily; scoring
 * daily after ingestion. Swap for a queue-backed runner in HUN-144.
 */
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

async function runConnector(c: SourceConnector, since: Date): Promise<ConnectorRunResult> {
  const startedAt = new Date();
  let signalsWritten = 0;
  try {
    for await (const item of c.fetch(since)) {
      const signals = c.normalize(item);
      // TODO(HUN-142): resolve fullName → repoId and insert into `signals`.
      signalsWritten += signals.length;
    }
    return { connectorId: c.id, startedAt, finishedAt: new Date(), signalsWritten, status: "ok" };
  } catch (err) {
    return {
      connectorId: c.id,
      startedAt,
      finishedAt: new Date(),
      signalsWritten,
      status: "error",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function tick(schedule: "hourly" | "daily"): Promise<void> {
  const since = new Date(Date.now() - (schedule === "hourly" ? HOUR : DAY));
  const connectors = buildRegistry().filter((c) => c.enabled && c.schedule === schedule);
  for (const c of connectors) {
    const result = await runConnector(c, since);
    console.log(JSON.stringify(result));
  }
  if (schedule === "daily") {
    // TODO(HUN-149): run tier classification + lowkey scoring into repo_scores.
  }
}

const once = process.argv.includes("--once");
await tick("hourly");
await tick("daily");
if (!once) {
  setInterval(() => void tick("hourly"), HOUR);
  setInterval(() => void tick("daily"), DAY);
}
