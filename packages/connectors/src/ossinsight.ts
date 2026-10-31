import type { SourceConnector, Signal } from "@idea-radar/core";

export interface OssInsightTrendingRow {
  repo_id: number | string;
  repo_name: string;
  primary_language?: string | null;
  stars?: number | string;
  total_score?: number | string;
  collection_names?: string | null;
  /** Added by `fetch`: collection_names merged with collection membership. */
  collections?: string[];
}

/** The run produced no data (empty rows, or the API says its data is unavailable). */
export class OssInsightEmptyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OssInsightEmptyError";
  }
}

const BASE = "https://api.ossinsight.io/v1";

type FetchImpl = (url: string, init?: { headers?: Record<string, string> }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

interface DataQuality {
  status?: unknown;
  reason?: unknown;
  message?: unknown;
}

/** Describe the API's own `data_quality` block, so an empty result says why. */
function describeQuality(body: unknown): string {
  const dq = (body as { data_quality?: DataQuality } | null)?.data_quality;
  if (!dq || typeof dq !== "object") return "no data_quality in response";
  const detail = [dq.reason, dq.message].filter((x): x is string => typeof x === "string" && x !== "");
  return `data_quality.status=${String(dq.status)}${detail.length ? `: ${detail.join(" ")}` : ""}`;
}

const isUnavailable = (body: unknown) =>
  (body as { data_quality?: DataQuality } | null)?.data_quality?.status === "unavailable";

const asRecord = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

/**
 * Optional. Public API, no key, 600 requests/hour per IP.
 * Gives trending by period/language and curated collections (category tags).
 * Fails loudly: non-200, unexpected shape and empty data all throw, so the Ops view never shows
 * a healthy source with no data. Collections are fetched once per run, before any row is yielded.
 * Linear: HUN-152
 */
export class OssInsightConnector implements SourceConnector<OssInsightTrendingRow> {
  readonly id = "ossinsight";
  readonly name = "OSS Insight";
  readonly licenseNote = "Public API; check ossinsight.io terms before display";
  readonly displayable = true;
  readonly rateLimit = { perHour: 600, concurrency: 2 };
  readonly schedule = "daily" as const;

  constructor(
    readonly enabled = true,
    readonly periods: readonly string[] = ["past_24_hours", "past_week", "past_month"],
    private readonly fetchImpl: FetchImpl = (url, init) => fetch(url, init),
  ) {}

  async *fetch(_since: Date): AsyncIterable<OssInsightTrendingRow> {
    // Sequential: one request at a time, within rateLimit.concurrency. `used` is this run's budget.
    let used = 0;
    const get = async (url: string): Promise<{ rows: unknown[]; body: unknown }> => {
      if (used >= this.rateLimit.perHour) {
        throw new Error(`OSS Insight request budget of ${this.rateLimit.perHour}/hour reached before ${url}`);
      }
      used++;
      const res = await this.fetchImpl(url, { headers: { accept: "application/json" } });
      if (res.status !== 200) throw new Error(`OSS Insight request failed: ${url} responded ${res.status}`);
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        throw new Error(`OSS Insight ${url}: response is not JSON`);
      }
      const rows = asRecord(asRecord(body)?.data)?.rows;
      if (!Array.isArray(rows)) throw new Error(`OSS Insight ${url}: unexpected response shape (no data.rows array)`);
      return { rows, body };
    };

    // 1. Trending rows. Any period with rows is enough; all-empty is an error.
    const trending: OssInsightTrendingRow[] = [];
    const emptyReasons: string[] = [];
    for (const period of this.periods) {
      const url = `${BASE}/trends/repos/?period=${period}`;
      const { rows, body } = await get(url);
      if (rows.length === 0) emptyReasons.push(`${period}: ${describeQuality(body)}`);
      for (const row of rows) {
        const r = asRecord(row);
        if (!r || !Number.isFinite(Number(r.repo_id)) || typeof r.repo_name !== "string") {
          throw new Error(`OSS Insight ${url}: unexpected response shape (row without repo_id/repo_name)`);
        }
        trending.push(r as unknown as OssInsightTrendingRow);
      }
    }
    if (trending.length === 0) {
      throw new OssInsightEmptyError(
        `OSS Insight trends/repos returned 0 rows for periods [${this.periods.join(", ")}]; ${emptyReasons.join(" | ")}`,
      );
    }

    // 2. Collections, once per run. Any failure fails the run before a row is yielded.
    const { rows: list } = await get(`${BASE}/collections/`);
    if (list.length === 0) throw new OssInsightEmptyError("OSS Insight collections list is empty");
    if (used + list.length > this.rateLimit.perHour) {
      throw new Error(
        `OSS Insight request budget: ${list.length} collections need ${used + list.length} requests, over ${this.rateLimit.perHour}/hour`,
      );
    }
    const byRepo = new Map<number, string[]>();
    for (const c of list) {
      const rec = asRecord(c);
      if (!rec || rec.id == null || typeof rec.name !== "string") {
        throw new Error("OSS Insight collections list: unexpected response shape (row without id/name)");
      }
      const url = `${BASE}/collections/${encodeURIComponent(String(rec.id))}/repos/`;
      const { rows: members, body } = await get(url);
      if (members.length === 0 && isUnavailable(body)) {
        throw new OssInsightEmptyError(`OSS Insight ${url}: no rows; ${describeQuality(body)}`);
      }
      for (const m of members) {
        const id = Number(asRecord(m)?.repo_id);
        if (!Number.isFinite(id)) throw new Error(`OSS Insight collection ${String(rec.id)}: member without repo_id`);
        byRepo.set(id, [...(byRepo.get(id) ?? []), rec.name]);
      }
    }

    // 3. Emit rows with merged tags.
    for (const row of trending) {
      const own = row.collection_names?.split(",").map((s) => s.trim()) ?? [];
      const tags = new Set([...own, ...(byRepo.get(Number(row.repo_id)) ?? [])].filter((s) => s !== ""));
      yield { ...row, collections: [...tags] };
    }
  }

  normalize(item: OssInsightTrendingRow): Signal[] {
    return [
      {
        repoId: Number(item.repo_id),
        fullName: item.repo_name,
        source: this.id,
        signalType: "trending",
        value: {
          score: item.total_score != null ? Number(item.total_score) : null,
          language: item.primary_language ?? null,
          collections:
            item.collections ?? item.collection_names?.split(",").map((s) => s.trim()).filter((s) => s !== "") ?? [],
        },
        observedAt: new Date(),
      },
    ];
  }
}
