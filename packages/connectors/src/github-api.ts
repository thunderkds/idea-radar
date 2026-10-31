import { fakeStarConfig } from "@idea-radar/core";
import type { Repo, SourceConnector, Signal, StargazerAccount } from "@idea-radar/core";
import { deriveStackTags, MANIFEST_FILES } from "./stack-tags.js";

export interface GithubRepoNode {
  databaseId: number;
  nameWithOwner: string;
  description: string | null;
  stargazerCount: number;
  forkCount: number;
  isArchived: boolean;
  primaryLanguage: { name: string } | null;
  licenseInfo: { spdxId: string } | null;
  repositoryTopics: { nodes: { topic: { name: string } }[] };
  createdAt: string;
  pushedAt: string | null;
}

export interface GithubApiOptions {
  /** Injected in tests; defaults to global `fetch`. */
  fetchImpl?: typeof fetch;
  /** Injected in tests; defaults to `Date.now`. */
  now?: () => number;
  /** Injected in tests; defaults to a `setTimeout` promise. */
  sleep?: (ms: number) => Promise<void>;
  endpoint?: string;
}

export interface FetchByIdsResult {
  repos: Repo[];
  /** Ids that could not be fetched (bad id, deleted, private); caller may fall back to `resolveNames`. */
  missing: number[];
}

/**
 * One `repo_content` row as fetched. Same shape as `RepoContent` in `@idea-radar/db`
 * (connectors do not depend on db); `fetchedAt` is left to the database default.
 */
export interface FetchedRepoContent {
  repoId: number;
  readmeMd: string | null;
  manifests: Record<string, string>;
  fileTreeSummary: { entries: { name: string; type: string }[]; total: number };
  stackTags: string[];
}

export interface FetchContentResult {
  contents: FetchedRepoContent[];
  /** Ids that could not be fetched (bad id, deleted, private). */
  missing: number[];
}

export interface ResolveNamesResult {
  /** Keyed by the name as requested, even if GitHub followed a rename redirect. */
  resolved: Map<string, Repo>;
  notFound: string[];
}

type ContentNode = Record<string, unknown> & { databaseId: number };

interface StargazerNode {
  stargazers?: {
    edges: ({
      starredAt: string;
      node: {
        createdAt: string;
        repositories: { totalCount: number };
        followers: { totalCount: number };
        contributionsCollection: { contributionCalendar: { totalContributions: number } };
      } | null;
    } | null)[];
  };
}

interface RateLimitInfo {
  cost: number;
  remaining: number;
  limit: number;
  resetAt: string;
}

interface GraphqlError {
  type?: string;
  message?: string;
}

const BATCH_SIZE = 100;
/** Repos per content query: each repo carries 14 `object()` lookups, so a batch is small. */
const CONTENT_BATCH_SIZE = 10;
const README_MAX_BYTES = 100 * 1024;
const MANIFEST_MAX_BYTES = 50 * 1024;
/** Top-level entries kept in `file_tree_summary`; `total` still counts all of them. */
const TREE_MAX_ENTRIES = 200;
/** README file names tried in order at the repo root; the first one present wins. */
const README_FILES = ["README.md", "readme.md", "README.markdown", "README.rst", "README.txt", "README"];
const LOW_BUDGET_FRACTION = 0.1;
const ENDPOINT = "https://api.github.com/graphql";
const NAME_RE = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;

const REPO_FIELDS = `
  databaseId nameWithOwner description stargazerCount forkCount isArchived
  primaryLanguage { name }
  licenseInfo { spdxId }
  repositoryTopics(first: 20) { nodes { topic { name } } }
  createdAt pushedAt`;
const blob = (path: string) => `object(expression: "HEAD:${path}") { ... on Blob { text } }`;
const CONTENT_FIELDS = `
  databaseId
  tree: object(expression: "HEAD:") { ... on Tree { entries { name type } } }
  ${README_FILES.map((f, i) => `r${i}: ${blob(f)}`).join("\n  ")}
  ${MANIFEST_FILES.map((f, i) => `m${i}: ${blob(f)}`).join("\n  ")}`;
/** GraphQL `first:` limit; one query returns at most this many stargazers. */
const STARGAZER_PAGE_MAX = 100;
const STARGAZER_FIELDS = `
  stargazers(first: $n, orderBy: {field: STARRED_AT, direction: DESC}) {
    edges {
      starredAt
      node {
        createdAt
        repositories(privacy: PUBLIC) { totalCount }
        followers { totalCount }
        contributionsCollection { contributionCalendar { totalContributions } }
      }
    }
  }`;
const RATE_LIMIT_FIELDS = "rateLimit { cost remaining limit resetAt }";

/**
 * GitHub's legacy global node id for a repository: base64("010:Repository<id>").
 * GitHub still accepts it as input to `nodes(ids:)`. Returns null for ids that cannot be encoded.
 */
export function toNodeId(repoId: number): string | null {
  if (!Number.isSafeInteger(repoId) || repoId <= 0) return null;
  return Buffer.from(`010:Repository${repoId}`).toString("base64");
}

export function toRepo(node: GithubRepoNode): Repo {
  return {
    repoId: node.databaseId,
    fullName: node.nameWithOwner,
    description: node.description,
    language: node.primaryLanguage?.name ?? null,
    topics: node.repositoryTopics.nodes.map((n) => n.topic.name),
    license: node.licenseInfo?.spdxId ?? null,
    stars: node.stargazerCount,
    forks: node.forkCount,
    archived: node.isArchived,
    createdAt: new Date(node.createdAt),
    pushedAt: node.pushedAt === null ? null : new Date(node.pushedAt),
  };
}

/** Text of an `object() { ... on Blob { text } }` alias; null when absent, binary or empty. */
function blobText(node: Record<string, unknown>, alias: string, maxBytes: number): string | null {
  const text = (node[alias] as { text?: string | null } | null | undefined)?.text;
  if (typeof text !== "string") return null;
  // Postgres TEXT and JSONB reject NUL characters.
  const clean = text.replaceAll("\u0000", "");
  if (clean.trim() === "") return null;
  if (Buffer.byteLength(clean) <= maxBytes) return clean;
  return Buffer.from(clean).subarray(0, maxBytes).toString("utf8").replace(/\uFFFD$/, "");
}

/** Build the `repo_content` row for one `nodes(ids:)` result. */
export function toRepoContent(node: Record<string, unknown> & { databaseId: number }): FetchedRepoContent {
  let readmeMd: string | null = null;
  for (let i = 0; i < README_FILES.length && readmeMd === null; i++) {
    readmeMd = blobText(node, `r${i}`, README_MAX_BYTES);
  }
  const manifests: Record<string, string> = {};
  MANIFEST_FILES.forEach((file, i) => {
    const text = blobText(node, `m${i}`, MANIFEST_MAX_BYTES);
    if (text !== null) manifests[file] = text;
  });
  const entries = (node.tree as { entries?: { name: string; type: string }[] } | null)?.entries ?? [];
  return {
    repoId: node.databaseId,
    readmeMd,
    manifests,
    fileTreeSummary: {
      entries: entries.slice(0, TREE_MAX_ENTRIES).map((e) => ({ name: e.name, type: e.type })),
      total: entries.length,
    },
    stackTags: deriveStackTags(manifests),
  };
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Canonical metadata source. GraphQL-first: 5,000 points/hr per token,
 * max 2,000 points/min, max 100 concurrent requests (shared with REST).
 * Linear: HUN-145
 *
 * Metadata goes to `repos` (via `toRepo`), never to `signals`: `normalize` returns [] and
 * `fetch(since)` yields nothing. The worker calls `fetchByIds` / `resolveNames` directly.
 */
export class GithubApiConnector implements SourceConnector<GithubRepoNode> {
  readonly id = "github_api";
  readonly name = "GitHub API";
  readonly licenseNote = "GitHub API terms; canonical metadata";
  readonly displayable = true;
  readonly rateLimit = { perHour: 5000, concurrency: 10 };
  readonly schedule = "daily" as const;

  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly endpoint: string;

  // Request-throttling state only; no candidate ids are held here.
  private lastRateLimit: RateLimitInfo | null = null;
  private pause: Promise<void> | null = null;
  private inFlight = 0;
  private readonly slotWaiters: (() => void)[] = [];

  constructor(
    private readonly token: string | undefined,
    readonly enabled = Boolean(token),
    options: GithubApiOptions = {},
  ) {
    this.fetchImpl = options.fetchImpl ?? ((...args) => fetch(...args));
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.endpoint = options.endpoint ?? ENDPOINT;
  }

  /** GitHub API work is pulled by id/name (`fetchByIds`, `resolveNames`), not by time. */
  async *fetch(_since: Date): AsyncIterable<GithubRepoNode> {
    return;
  }

  /** Metadata goes to `repos` through `toRepo`; emitting signals would inflate consensus_count. */
  normalize(_item: GithubRepoNode): Signal[] {
    return [];
  }

  toRepo(node: GithubRepoNode): Repo {
    return toRepo(node);
  }

  /** Fetch metadata for numeric repo ids, ≤100 per GraphQL query. */
  async fetchByIds(ids: number[]): Promise<FetchByIdsResult> {
    const missing: number[] = [];
    const encodable: { id: number; nodeId: string }[] = [];
    for (const id of ids) {
      const nodeId = toNodeId(id);
      if (nodeId === null) missing.push(id);
      else encodable.push({ id, nodeId });
    }

    const query = `query($ids: [ID!]!) { nodes(ids: $ids) { ... on Repository {${REPO_FIELDS} } } ${RATE_LIMIT_FIELDS} }`;
    const batches = await Promise.all(
      chunk(encodable, BATCH_SIZE).map(async (batch) => {
        const data = await this.request<{ nodes: (GithubRepoNode | null)[] }>(query, {
          ids: batch.map((b) => b.nodeId),
        });
        const repos: Repo[] = [];
        const gone: number[] = [];
        batch.forEach((b, i) => {
          const node = data.nodes[i];
          if (node && typeof node.databaseId === "number") repos.push(toRepo(node));
          else gone.push(b.id);
        });
        return { repos, gone };
      }),
    );
    return {
      repos: batches.flatMap((b) => b.repos),
      missing: [...missing, ...batches.flatMap((b) => b.gone)],
    };
  }

  /**
   * Fetch README, root manifests and the top-level tree for numeric repo ids, ≤10 per GraphQL query,
   * through the same rate-limit state as `fetchByIds`. README is capped at 100 KB, each manifest at
   * 50 KB; absent files are left out. `stackTags` come from the manifests.
   */
  async fetchContent(ids: number[]): Promise<FetchContentResult> {
    const missing: number[] = [];
    const encodable: { id: number; nodeId: string }[] = [];
    for (const id of ids) {
      const nodeId = toNodeId(id);
      if (nodeId === null) missing.push(id);
      else encodable.push({ id, nodeId });
    }

    const query = `query($ids: [ID!]!) { nodes(ids: $ids) { ... on Repository {${CONTENT_FIELDS} } } ${RATE_LIMIT_FIELDS} }`;
    const batches = await Promise.all(
      chunk(encodable, CONTENT_BATCH_SIZE).map(async (batch) => {
        const data = await this.request<{ nodes: (ContentNode | null)[] }>(query, {
          ids: batch.map((b) => b.nodeId),
        });
        const contents: FetchedRepoContent[] = [];
        const gone: number[] = [];
        batch.forEach((b, i) => {
          const node = data.nodes[i];
          if (node && typeof node.databaseId === "number") contents.push(toRepoContent(node));
          else gone.push(b.id);
        });
        return { contents, gone };
      }),
    );
    return {
      contents: batches.flatMap((b) => b.contents),
      missing: [...missing, ...batches.flatMap((b) => b.gone)],
    };
  }

  /**
   * Fake-star sample (HUN-151): the newest `n` stargazers of one repo (default `fakeStarConfig.sampleSize`,
   * at most 100) in a single query through the shared rate-limit state. Deleted accounts are left out.
   * Returns [] for a missing repo or an id that cannot be encoded.
   */
  async sampleStargazers(repoId: number, n: number = fakeStarConfig.sampleSize): Promise<StargazerAccount[]> {
    const nodeId = toNodeId(repoId);
    if (nodeId === null) return [];
    const first = Math.max(1, Math.min(Math.floor(n), STARGAZER_PAGE_MAX));
    const query = `query($ids: [ID!]!, $n: Int!) { nodes(ids: $ids) { ... on Repository {${STARGAZER_FIELDS} } } ${RATE_LIMIT_FIELDS} }`;
    const data = await this.request<{ nodes: (StargazerNode | null)[] }>(query, { ids: [nodeId], n: first });
    const accounts: StargazerAccount[] = [];
    for (const edge of data.nodes[0]?.stargazers?.edges ?? []) {
      if (!edge?.node) continue;
      accounts.push({
        starredAt: edge.starredAt,
        createdAt: edge.node.createdAt,
        publicRepos: edge.node.repositories.totalCount,
        followers: edge.node.followers.totalCount,
        contributions: edge.node.contributionsCollection.contributionCalendar.totalContributions,
      });
    }
    return accounts;
  }

  /** Resolve `owner/name` strings to canonical repos, ≤100 per GraphQL query. */
  async resolveNames(fullNames: string[]): Promise<ResolveNamesResult> {
    const resolved = new Map<string, Repo>();
    const notFound: string[] = [];
    const valid: string[] = [];
    for (const name of new Set(fullNames)) {
      if (NAME_RE.test(name)) valid.push(name);
      else notFound.push(name);
    }

    await Promise.all(
      chunk(valid, BATCH_SIZE).map(async (batch) => {
        const vars: Record<string, string> = {};
        const decls: string[] = [];
        const fields = batch.map((name, i) => {
          const [owner, repo] = name.split("/") as [string, string];
          vars[`o${i}`] = owner;
          vars[`n${i}`] = repo;
          decls.push(`$o${i}: String!`, `$n${i}: String!`);
          return `r${i}: repository(owner: $o${i}, name: $n${i}) {${REPO_FIELDS} }`;
        });
        const query = `query(${decls.join(", ")}) { ${fields.join("\n")} ${RATE_LIMIT_FIELDS} }`;
        const data = await this.request<Record<string, GithubRepoNode | null>>(query, vars);
        batch.forEach((name, i) => {
          const node = data[`r${i}`];
          if (node && typeof node.databaseId === "number") resolved.set(name, toRepo(node));
          else notFound.push(name);
        });
      }),
    );
    return { resolved, notFound };
  }

  private async request<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    if (!this.token) throw new Error("GitHub API connector has no token");
    await this.acquireSlot();
    try {
      await this.waitForBudget();
      return await this.post<T>(query, variables);
    } finally {
      this.releaseSlot();
    }
  }

  private async post<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    let res: Response;
    try {
      res = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: {
          authorization: `bearer ${this.token}`,
          "content-type": "application/json",
          "user-agent": "idea-radar",
        },
        body: JSON.stringify({ query, variables }),
      });
    } catch (err) {
      throw new Error(`GitHub API request failed: ${this.redact(String(err))}`);
    }
    if (!res.ok) throw new Error(`GitHub API HTTP ${res.status}`);

    const body = (await res.json()) as {
      data?: (T & { rateLimit?: RateLimitInfo }) | null;
      errors?: GraphqlError[];
    };
    if (body.data?.rateLimit) this.lastRateLimit = body.data.rateLimit;
    // Missing repos come back as null plus a NOT_FOUND error; the caller reports those, so tolerate them.
    const fatal = (body.errors ?? []).filter((e) => e.type !== "NOT_FOUND");
    if (fatal.length > 0 || !body.data) {
      const msg = fatal.map((e) => e.message ?? "unknown error").join("; ") || "no data";
      throw new Error(`GitHub GraphQL error: ${this.redact(msg)}`);
    }
    return body.data;
  }

  /** Once remaining < 10% of limit, hold every caller until `resetAt`. A past `resetAt` means no wait. */
  private async waitForBudget(): Promise<void> {
    for (;;) {
      if (this.pause) {
        await this.pause;
        continue;
      }
      const rl = this.lastRateLimit;
      if (!rl || rl.remaining >= rl.limit * LOW_BUDGET_FRACTION) return;
      const waitMs = Date.parse(rl.resetAt) - this.now();
      if (waitMs <= 0) {
        this.lastRateLimit = null;
        return;
      }
      this.pause = this.sleep(waitMs).finally(() => {
        this.lastRateLimit = null;
        this.pause = null;
      });
    }
  }

  private async acquireSlot(): Promise<void> {
    while (this.inFlight >= this.rateLimit.concurrency) {
      await new Promise<void>((resolve) => this.slotWaiters.push(resolve));
    }
    this.inFlight++;
  }

  private releaseSlot(): void {
    this.inFlight--;
    this.slotWaiters.shift()?.();
  }

  private redact(text: string): string {
    return this.token ? text.split(this.token).join("[redacted]") : text;
  }
}
