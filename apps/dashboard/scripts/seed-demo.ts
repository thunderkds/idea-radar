/**
 * Fills a throwaway database with demo data for the dashboard: repos in all three tiers, 90 days of repo_daily,
 * signals from displayable sources and from the hidden `trendshift` source.
 *
 *   createdb dash_demo && DATABASE_URL=postgres://.../dash_demo pnpm db:migrate
 *   DATABASE_URL=postgres://.../dash_demo pnpm --filter @idea-radar/dashboard seed:demo
 *
 * It empties the data tables first, so it refuses any database whose name does not start with `dash_`.
 */
import { createPool } from "../../../packages/db/src/index.js";

/** The database name of `url`; throws unless it starts with `dash_`, because seeding empties the data tables. */
export function demoDbName(url: string): string {
  const dbName = new URL(url).pathname.slice(1);
  if (!dbName.startsWith("dash_")) throw new Error(`refusing to seed "${dbName}": the database name must start with dash_`);
  return dbName;
}

interface Seed {
  id: number;
  name: string;
  description: string | null;
  language: string | null;
  tier: "trending" | "medium" | "lowkey";
  stars: number;
  score: number;
  fake?: boolean;
  topics?: string[];
  stack?: string[];
  signals?: { source: string; type: string; value?: object }[];
  noContent?: boolean;
}

const hand: Seed[] = [
  { id: 1001, name: "mintlab/graphite-cli", description: "A tiny CLI for dark-mode terminals that explains itself.", language: "TypeScript", tier: "lowkey", stars: 87, score: 0.812, topics: ["cli", "terminal"], stack: ["typescript", "node", "vitest"], signals: [{ source: "github_trending", type: "listed" }, { source: "ossinsight", type: "trending", value: { collections: ["Web Framework"] } }, { source: "trendshift", type: "listed" }] },
  { id: 1002, name: "quiet-owl/star-farm", description: "Looks popular. Stars arrive in bursts at 3am.", language: "Python", tier: "lowkey", stars: 143, score: 0.774, fake: true, topics: ["cli"], stack: ["python"], signals: [{ source: "github_trending", type: "listed" }] },
  { id: 1003, name: "nobody/undocumented", description: null, language: null, tier: "lowkey", stars: 12, score: 0.701, stack: [], noContent: true },
  { id: 1004, name: "lowkey-labs/a-repository-with-an-extremely-long-name-that-has-to-wrap-on-a-phone", description: "Description that is long enough to wrap onto several lines on a narrow screen: ".repeat(3).trim(), language: "Rust", tier: "lowkey", stars: 0, score: 0.655, topics: ["rust"], stack: ["rust", "tokio"] },
  { id: 2001, name: "steady/ledger", description: "Plain-text accounting with steady growth.", language: "Go", tier: "medium", stars: 1840, score: 0.58, stack: ["go"], signals: [{ source: "ossinsight", type: "trending", value: { collections: ["Web Framework"] } }] },
  { id: 2002, name: "steady/pixelkit", description: "Pixel-art toolkit.", language: "TypeScript", tier: "medium", stars: 920, score: 0.52, stack: ["typescript", "react"] },
  { id: 3001, name: "hot/agent-runtime", description: "Agent runtime everyone is talking about.", language: "TypeScript", tier: "trending", stars: 15230, score: 0.97, stack: ["typescript", "node"], signals: [{ source: "github_trending", type: "listed" }, { source: "ossinsight", type: "trending", value: { collections: ["Artificial Intelligence"] } }, { source: "trendshift", type: "listed" }] },
  { id: 3002, name: "hot/diffusion-lite", description: "Image generation on a laptop.", language: "Python", tier: "trending", stars: 8120, score: 0.91, stack: ["python", "pytorch"], signals: [{ source: "github_trending", type: "listed" }] },
];

const generated: Seed[] = Array.from({ length: 50 }, (_, i) => ({
  id: 1100 + i,
  name: `demo/lowkey-${String(i + 1).padStart(2, "0")}`,
  description: `Generated lowkey repo number ${i + 1}.`,
  language: ["TypeScript", "Python", "Go", "Rust"][i % 4]!,
  tier: "lowkey" as const,
  stars: 20 + i * 3,
  score: Number((0.64 - i * 0.01).toFixed(3)),
  topics: i % 2 ? ["cli"] : ["web"],
  stack: ["node"],
}));

const seeds = [...hand, ...generated];
const today = new Date().toISOString().slice(0, 10);

function daily(id: number, day: number): number {
  // Deterministic pseudo-random star count; the last 7 days grow faster so the lowkey rule reads true.
  const base = (id * 31 + day * 17) % 6;
  return day >= 83 ? base + 4 : base;
}

export async function seedDemo(url: string): Promise<{ database: string; repos: number; date: string }> {
  const database = demoDbName(url);
  const db = createPool(url);
  try {
    await db.query("TRUNCATE repos, repo_daily, signals, repo_content, repo_scores, sources RESTART IDENTITY");
    for (const [id, name, displayable] of [
      ["github_api", "GitHub API", true],
      ["github_trending", "GitHub Trending", true],
      ["ossinsight", "OSS Insight", true],
      ["gh_archive", "GH Archive", true],
      ["trendshift", "Trendshift", false],
    ] as const) {
      await db.query("INSERT INTO sources (id, name, displayable, last_status) VALUES ($1, $2, $3, 'ok')", [id, name, displayable]);
    }

    for (const s of seeds) {
      await db.query(
        `INSERT INTO repos (repo_id, full_name, description, language, topics, license, stars, forks, created_at, pushed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now() - interval '200 days', now() - interval '2 days')`,
        [s.id, s.name, s.description, s.language, s.topics ?? [], s.id % 3 === 0 ? null : "MIT", s.stars, Math.floor(s.stars / 8)],
      );
      for (let day = 0; day < 90; day++) {
        await db.query(
          "INSERT INTO repo_daily (repo_id, date, stars_new) VALUES ($1, $2::date - $3::int, $4)",
          [s.id, today, 89 - day, daily(s.id, day)],
        );
      }
      const components: Record<string, number> = {
        velocityLift: s.score,
        activity: Math.min(1, s.score + 0.05),
        contributors: 0.5,
        readmeQuality: 0.7,
        issueResponsiveness: 0.4,
      };
      if (s.id === 1001) components.trendshift = 0.9; // hidden source: the API must strip it
      await db.query(
        "INSERT INTO repo_scores (repo_id, date, tier, score, components, fake_star_flag) VALUES ($1, $2, $3, $4, $5, $6)",
        [s.id, today, s.tier, s.score, JSON.stringify(components), s.fake ?? false],
      );
      if (!s.noContent) {
        await db.query("INSERT INTO repo_content (repo_id, readme_md, stack_tags) VALUES ($1, $2, $3)", [
          s.id,
          `# ${s.name}\n\nPlain README text. Markup must stay inert: <script>window.__pwned = true</script> <b>bold?</b>\n\n- one\n- two\n`,
          s.stack ?? [],
        ]);
      }
      for (const [i, sig] of (s.signals ?? []).entries()) {
        await db.query(
          "INSERT INTO signals (repo_id, source, signal_type, value, observed_at) VALUES ($1, $2, $3, $4, now() - ($5 || ' days')::interval)",
          [s.id, sig.source, sig.type, JSON.stringify(sig.value ?? {}), String(i + 1)],
        );
      }
    }
    return { database, repos: seeds.length, date: today };
  } finally {
    await db.end();
  }
}

if (require.main === module) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  seedDemo(url)
    .then((r) => console.log(`seeded ${r.repos} repos into ${r.database} (score date ${r.date})`))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
