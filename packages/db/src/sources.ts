import type { SourceConnector } from "@idea-radar/core";
import type { Queryable } from "./index.js";

/**
 * Make the `sources` table match the code registry (HUN-143, gaps A10 and A19). Code wins: `name`,
 * `enabled`, `displayable` and `license_note` are overwritten on every call. The run state
 * (`last_run_at`, `last_status`, `last_error`) is never touched. A source row with no connector in
 * `connectors` is disabled, not deleted, so its history stays.
 */
export async function syncSources(
  db: Queryable,
  connectors: Pick<SourceConnector, "id" | "name" | "enabled" | "displayable" | "licenseNote">[],
): Promise<void> {
  const ids = connectors.map((c) => c.id);
  if (ids.length > 0) {
    await db.query(
      `INSERT INTO sources (id, name, enabled, displayable, license_note)
       SELECT * FROM unnest($1::text[], $2::text[], $3::boolean[], $4::boolean[], $5::text[])
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, enabled = EXCLUDED.enabled,
         displayable = EXCLUDED.displayable, license_note = EXCLUDED.license_note`,
      [
        ids,
        connectors.map((c) => c.name),
        connectors.map((c) => c.enabled),
        connectors.map((c) => c.displayable),
        connectors.map((c) => c.licenseNote),
      ],
    );
  }
  await db.query("UPDATE sources SET enabled = FALSE WHERE enabled AND id <> ALL($1::text[])", [ids]);
}
