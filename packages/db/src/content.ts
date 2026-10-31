import { candidateConfig } from "@idea-radar/core";
import type { Queryable } from "./index.js";

/**
 * Candidate repo ids for `date`, best first (same order as `listCandidates`), whose README and manifests
 * need fetching: no `repo_content` row, or one fetched more than `contentMaxAgeDays` ago.
 * Only repos that have a `repos` row: a repo GitHub could not return metadata for has no content either.
 */
export async function listCandidatesNeedingContent(
  db: Queryable,
  date: string,
  opts: { contentMaxAgeDays?: number } = {},
): Promise<number[]> {
  const res = await db.query<{ repo_id: number }>(
    `SELECT c.repo_id FROM candidates c
     JOIN repos r ON r.repo_id = c.repo_id
     LEFT JOIN repo_content rc ON rc.repo_id = c.repo_id
     WHERE c.date = $1::date
       AND (rc.repo_id IS NULL OR rc.fetched_at < now() - make_interval(days => $2::int))
     ORDER BY c.priority DESC, (c.reason = 'signal') DESC, c.repo_id`,
    [date, opts.contentMaxAgeDays ?? candidateConfig.contentMaxAgeDays],
  );
  return res.rows.map((r) => r.repo_id);
}
