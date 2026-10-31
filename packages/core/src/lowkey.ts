import { lowkeyNormalisation, type LowkeyComponent } from "./scoring.js";

/** Plain inputs for the five lowkey components. Counts are numbers; the README is its Markdown text. */
export interface LowkeyInput {
  /** Stars gained in the last 7 days. */
  starsLast7d: number;
  /** Stars gained in the prior 83 days (the repo's own baseline window). */
  priorStars: number;
  /** The repo has at least one `repo_daily` row in the baseline window; false means its baseline rate is unknown. */
  hasPriorHistory: boolean;
  /** Push events in the last 30 days. */
  pushes30d: number;
  /** Pull requests opened in the last 30 days. */
  prsOpened30d: number;
  /** Issues opened in the last 30 days. */
  issuesOpened30d: number;
  /** Largest daily distinct-contributor count in the last 30 days. */
  contributors: number;
  /** README Markdown; null / undefined when there is none. */
  readme?: string | null;
  /** Share (0..1) of recent issues that got a maintainer reply. No source supplies it yet, so callers omit it. */
  issueResponseRate?: number;
}

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

/** 7-day daily star rate vs the repo's own prior daily rate: 0 when flat, 1 at `fullLift` times the baseline. */
export function velocityLift(input: Pick<LowkeyInput, "starsLast7d" | "priorStars" | "hasPriorHistory">): number {
  const n = lowkeyNormalisation.velocityLift;
  if (!input.hasPriorHistory) return n.noHistory;
  const baseline = Math.max(input.priorStars / 83, n.baselineFloorStarsPerDay);
  const lift = input.starsLast7d / 7 / baseline;
  return clamp01((lift - 1) / (n.fullLift - 1));
}

/** Pushes + PRs opened + issues opened in 30 days, as a share of `fullEvents30d`. */
export function activity(input: Pick<LowkeyInput, "pushes30d" | "prsOpened30d" | "issuesOpened30d">): number {
  const events = input.pushes30d + input.prsOpened30d + input.issuesOpened30d;
  return clamp01(events / lowkeyNormalisation.activity.fullEvents30d);
}

/** Distinct contributors as a share of `fullContributors`. */
export function contributors(input: Pick<LowkeyInput, "contributors">): number {
  return clamp01(input.contributors / lowkeyNormalisation.contributors.fullContributors);
}

/** Markdown heading texts, skipping fenced code blocks (a `# comment` in a shell block is not a heading). */
function headings(markdown: string): string[] {
  const out: string[] = [];
  let fence: string | null = null;
  for (const line of markdown.split(/\r?\n/)) {
    const f = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (f) {
      if (fence === null) fence = f[1]![0]!;
      else if (f[1]![0] === fence) fence = null;
      continue;
    }
    if (fence !== null) continue;
    const h = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
    if (h) out.push(h[1]!);
  }
  return out;
}

/** README length, heading count, and an install and a usage heading; an empty README scores 0. */
export function readmeQuality(readme: string | null | undefined): number {
  const text = (readme ?? "").trim();
  if (text === "") return 0;
  const n = lowkeyNormalisation.readme;
  const hs = headings(text);
  const parts =
    n.weights.length * clamp01(text.length / n.fullChars) +
    n.weights.headings * clamp01(hs.length / n.fullHeadings) +
    n.weights.install * Number(hs.some((h) => n.installHeading.test(h))) +
    n.weights.usage * Number(hs.some((h) => n.usageHeading.test(h)));
  return clamp01(parts);
}

/** Share of recent issues with a maintainer reply; 0 when the input is missing (no data source yet). */
export function issueResponsiveness(rate?: number): number {
  return rate === undefined ? 0 : clamp01(rate);
}

/** The five lowkey components, each 0..1; feed them to `lowkeyScore`. */
export function lowkeyComponents(input: LowkeyInput): Record<LowkeyComponent, number> {
  return {
    velocityLift: velocityLift(input),
    activity: activity(input),
    contributors: contributors(input),
    readmeQuality: readmeQuality(input.readme),
    issueResponsiveness: issueResponsiveness(input.issueResponseRate),
  };
}
