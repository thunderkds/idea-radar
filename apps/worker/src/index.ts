import { pathToFileURL } from "node:url";
import { buildRegistry } from "@idea-radar/connectors";
import * as db from "@idea-radar/db";
import { buildCaps, buildHandlers } from "./handlers.js";
import { runWorker } from "./runner.js";

export { runWorker } from "./runner.js";

async function main(): Promise<void> {
  const once = process.argv.includes("--once");
  const pool = db.createPool(); // throws "DATABASE_URL is not set" without it
  const abort = new AbortController();
  for (const sig of ["SIGINT", "SIGTERM"] as const) process.once(sig, () => abort.abort());

  try {
    const client = await pool.connect();
    try {
      for (const file of await db.applyMigrations(client)) console.log(`applied ${file}`);
    } finally {
      client.release();
    }
    const connectors = buildRegistry();
    // syncSources (HUN-143) may not be merged yet; skip it until it is.
    const syncSources = (db as unknown as Record<string, unknown>).syncSources;
    if (typeof syncSources === "function") await syncSources(pool, connectors);

    await runWorker({
      db: pool,
      handlers: buildHandlers({ connectors, log: (line) => console.log(line) }),
      caps: buildCaps(connectors),
      once,
      signal: abort.signal,
      log: (line) => console.log(line),
    });
  } finally {
    await pool.end();
  }
}

// Only run when started as a program, so tests can import `runWorker`.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((err) => {
    console.error(`worker failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
