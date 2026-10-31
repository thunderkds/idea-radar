import type { SourceConnector, Signal } from "@idea-radar/core";

export interface TrendingEntry {
  fullName: string;
  rank: number;
  period: "daily" | "weekly" | "monthly";
  language: string | null;
  starsInPeriod: number | null;
}

export class TrendingParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TrendingParseError";
  }
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'" };

function decodeEntities(text: string): string {
  return text.replace(/&(amp|lt|gt|quot|apos|#39);/g, (_, e: string) => ENTITIES[e] ?? _);
}

/**
 * Parse one trending page into ranked entries (rank = position on the page).
 * Throws TrendingParseError when no repo row parses, so a GitHub HTML change
 * fails the run instead of silently yielding nothing.
 */
export function parseTrendingHtml(
  html: string,
  ctx: { period: TrendingEntry["period"]; language?: string | null },
): TrendingEntry[] {
  const entries: TrendingEntry[] = [];
  const rows = html.matchAll(/<article\b[^>]*\bBox-row\b[^>]*>([\s\S]*?)<\/article>/g);
  for (const [, row] of rows) {
    const h2 = /<h2\b[^>]*>([\s\S]*?)<\/h2>/.exec(row ?? "");
    const href = h2 && /<a\b[^>]*\bhref="\/([^"/?#]+)\/([^"/?#]+)"/.exec(h2[1] ?? "");
    if (!href) continue;
    const fullName = decodeEntities(`${href[1]}/${href[2]}`).replace(/\s+/g, "");
    const lang = /itemprop="programmingLanguage"[^>]*>([^<]*)</.exec(row ?? "");
    const stars = /([\d,]+)\s+stars?\s+(?:today|this week|this month)/.exec(row ?? "");
    entries.push({
      fullName,
      rank: entries.length + 1,
      period: ctx.period,
      language: lang?.[1] ? decodeEntities(lang[1].trim()) || null : null,
      starsInPeriod: stars?.[1] ? Number(stars[1].replace(/,/g, "")) : null,
    });
  }
  if (entries.length === 0) {
    throw new TrendingParseError(
      `No trending repo rows parsed (period=${ctx.period}, language=${ctx.language ?? "all"}); GitHub HTML may have changed`,
    );
  }
  return entries;
}

type FetchImpl = (url: string, init?: { headers?: Record<string, string> }) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

/**
 * Daily scrape of github.com/trending. Brittle by nature: keep parsing isolated
 * and fail loudly so the Ops view shows breakage.
 * Linear: HUN-147
 */
export class GithubTrendingConnector implements SourceConnector<TrendingEntry> {
  readonly id = "github_trending";
  readonly name = "GitHub Trending page";
  readonly enabled = true;
  readonly licenseNote = "Public page; store rank only";
  readonly displayable = true;
  readonly rateLimit = { perHour: 60, concurrency: 1 };
  readonly schedule = "daily" as const;

  constructor(
    readonly languages: (string | null)[] = [null, "typescript", "python", "go", "rust"],
    readonly periods: TrendingEntry["period"][] = ["daily", "weekly", "monthly"],
    private readonly fetchImpl: FetchImpl = (url, init) => fetch(url, init),
  ) {}

  async *fetch(_since: Date): AsyncIterable<TrendingEntry> {
    // Sequential loop: rateLimit.concurrency is 1.
    for (const language of this.languages) {
      for (const period of this.periods) {
        const path = language === null ? "" : `/${encodeURIComponent(language)}`;
        const url = `https://github.com/trending${path}?since=${period}`;
        const res = await this.fetchImpl(url, {
          headers: { "User-Agent": "idea-radar/0.1 (+https://github.com/thunderkds/idea-radar)" },
        });
        if (res.status !== 200) {
          throw new Error(`GitHub Trending request failed: ${url} responded ${res.status}`);
        }
        yield* parseTrendingHtml(await res.text(), { period, language });
      }
    }
  }

  normalize(item: TrendingEntry): Signal[] {
    return [
      {
        repoId: 0, // resolved from fullName during ingest
        fullName: item.fullName,
        source: this.id,
        signalType: "listed",
        value: {
          rank: item.rank,
          period: item.period,
          language: item.language,
          starsInPeriod: item.starsInPeriod,
        },
        observedAt: new Date(),
      },
    ];
  }
}
