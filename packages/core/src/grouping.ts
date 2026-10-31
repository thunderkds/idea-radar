import { groupingConfig } from "./scoring.js";

/** Lowercased, trimmed, unique topics that are not generic. */
function specificTopics(topics: readonly string[]): string[] {
  const out = new Set<string>();
  for (const raw of topics) {
    const topic = raw.trim().toLowerCase();
    if (!topic) continue;
    if (groupingConfig.genericTopics.includes(topic) || groupingConfig.genericTopicPattern.test(topic)) continue;
    out.add(topic);
  }
  return [...out];
}

/** Fixed order, most specific first: more hyphen-separated parts, then longer, then alphabetical. */
function bySpecificity(a: string, b: string): number {
  return b.split("-").length - a.split("-").length || b.length - a.length || (a < b ? -1 : a > b ? 1 : 0);
}

/** The first framework tag, else the first language tag, in alphabetical order; null when there is none. */
function primaryStackTag(stackTags: readonly string[]): string | null {
  const tags = [...new Set(stackTags.map((t) => t.trim().toLowerCase()).filter(Boolean))].sort();
  return tags.find((t) => !groupingConfig.languageStackTags.includes(t)) ?? tags[0] ?? null;
}

/**
 * The idea-group key of a repo (T026): its `topicsInKey` most specific GitHub topics, sorted, plus the primary
 * stack tag, e.g. `rag+vector-database|fastapi`. Repos of one idea get one key whatever the order or case of their
 * topics. Null when no specific topic is left: a stack alone is not an idea, so such a repo is in no group.
 * This is the one place that decides what "same idea" means; v2 may swap in README similarity here.
 */
export function ideaGroupKey(topics: readonly string[], stackTags: readonly string[]): string | null {
  const kept = specificTopics(topics).sort(bySpecificity).slice(0, groupingConfig.topicsInKey).sort();
  if (kept.length === 0) return null;
  return `${kept.join("+")}|${primaryStackTag(stackTags) ?? ""}`;
}
