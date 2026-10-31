import type { SourceConnector } from "@idea-radar/core";
import { GithubApiConnector } from "./github-api.js";
import { GhArchiveConnector } from "./gh-archive.js";
import { GithubTrendingConnector } from "./github-trending.js";
import { OssInsightConnector } from "./ossinsight.js";
import { TrendshiftConnector } from "./trendshift.js";
import { GithubExplorerConnector } from "./github-explorer.js";

export {
  GithubApiConnector,
  GhArchiveConnector,
  GithubTrendingConnector,
  OssInsightConnector,
  TrendshiftConnector,
  GithubExplorerConnector,
};

const flag = (v: string | undefined, fallback: boolean) =>
  v === undefined ? fallback : v.toLowerCase() === "true";

/** Build the connector registry from environment variables. */
export function buildRegistry(env: NodeJS.ProcessEnv = process.env): SourceConnector[] {
  return [
    new GithubApiConnector(env.GITHUB_TOKEN),
    new GhArchiveConnector(env.GHARCHIVE_MODE === "bigquery" ? "bigquery" : "dumps"),
    new GithubTrendingConnector(),
    new OssInsightConnector(flag(env.OSSINSIGHT_ENABLED, true)),
    new TrendshiftConnector(
      env.TRENDSHIFT_API_KEY,
      flag(env.TRENDSHIFT_ENABLED, false) && Boolean(env.TRENDSHIFT_API_KEY),
    ),
    new GithubExplorerConnector(flag(env.GITHUB_EXPLORER_ENABLED, false)),
  ];
}
