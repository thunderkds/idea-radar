import type { Repo, SourceConnector, Signal } from "@idea-radar/core";

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

export interface ResolveNamesResult {
  /** Keyed by the name as requested, even if GitHub followed a rename redirect. */
  resolved: Map<string, Repo>;
  notFound: string[];
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
const LOW_BUDGET_FRACTION = 0.1;
const ENDPOINT = "https://api.github.com/graphql";
const NAME_RE = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;

const REPO_FIELDS = `
  databaseId nameWithOwner description stargazerCount forkCount isArchived
  primaryLanguage { name }
  licenseInfo { spdxId }
  repositoryTopics(first: 20) { nodes { topic { name } } }
  createdAt pushedAt`;
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
