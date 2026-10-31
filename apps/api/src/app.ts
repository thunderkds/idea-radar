import { createHash, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { ConsensusQuery, Queryable, RescrapeTarget, StarsWindow, TierQuery } from "@idea-radar/db";
import { getRepoDetail, listConsensus, listDisplayableSources, listTier, requestRescrape } from "@idea-radar/db";
import type { Tier } from "@idea-radar/core";

/**
 * API for the dashboard (HUN-156). `createApi(db)` returns a plain Node request handler so
 * tests can serve it on port 0; `index.ts` only owns the pool, the server and the listener.
 * Data-access SQL lives in packages/db/src/api.ts. Every route is GET-only except `POST /rescrape` (T027),
 * which needs `ADMIN_TOKEN`; with no token configured that route answers 404.
 */
const TIERS: Tier[] = ["trending", "medium", "lowkey"];
const WINDOWS: StarsWindow[] = ["7d", "30d"];
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const MAX_TEXT = 200;
const MAX_BODY_BYTES = 4096;

class BadRequest extends Error {}

function encodeCursor(scoreText: string, repoId: number): string {
  return Buffer.from(JSON.stringify({ score: scoreText, repoId })).toString("base64url");
}

function decodeCursor(raw: string): NonNullable<TierQuery["after"]> {
  try {
    const v = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as { score?: unknown; repoId?: unknown };
    if (typeof v.score === "string" && /^-?\d+(\.\d+)?$/.test(v.score) && Number.isSafeInteger(v.repoId)) {
      return { score: v.score, repoId: v.repoId as number };
    }
  } catch {
    // fall through to the error below
  }
  throw new BadRequest("cursor: not a cursor returned by this API");
}

function encodeConsensusCursor(count: number, firstSeen: string, repoId: number): string {
  return Buffer.from(JSON.stringify({ count, firstSeen, repoId })).toString("base64url");
}

// A timestamptz as Postgres prints it, e.g. 2026-10-29 10:00:00.123456+00 (checked here so a forged cursor is a 400, not a 500).
const TIMESTAMPTZ_TEXT = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d{1,6})?[+-]\d{2}(:?\d{2})?$/;

function decodeConsensusCursor(raw: string): NonNullable<ConsensusQuery["after"]> {
  try {
    const v = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as { count?: unknown; firstSeen?: unknown; repoId?: unknown };
    if (
      Number.isSafeInteger(v.count) &&
      typeof v.firstSeen === "string" &&
      TIMESTAMPTZ_TEXT.test(v.firstSeen) &&
      Number.isSafeInteger(v.repoId)
    ) {
      return { count: v.count as number, firstSeen: v.firstSeen, repoId: v.repoId as number };
    }
  } catch {
    // fall through to the error below
  }
  throw new BadRequest("cursor: not a cursor returned by this API");
}

function parseLimit(params: URLSearchParams): number {
  const rawLimit = params.get("limit");
  if (rawLimit === null) return DEFAULT_LIMIT;
  const limit = /^\d+$/.test(rawLimit) ? Number(rawLimit) : NaN;
  if (!(limit >= 1 && limit <= MAX_LIMIT)) throw new BadRequest(`limit: must be an integer from 1 to ${MAX_LIMIT}`);
  return limit;
}

function text(params: URLSearchParams, name: string): string | undefined {
  const v = params.get(name);
  if (v === null) return undefined;
  if (v.trim() === "" || v.length > MAX_TEXT) throw new BadRequest(`${name}: must be 1-${MAX_TEXT} characters`);
  return v;
}

/** Parse and validate the `/tiers/:tier` query string; throws BadRequest naming the bad parameter. */
function parseTierQuery(tier: Tier, params: URLSearchParams): TierQuery {
  const window = params.get("window") ?? "7d";
  if (!WINDOWS.includes(window as StarsWindow)) throw new BadRequest("window: must be 7d or 30d");

  const cursor = params.get("cursor");
  return {
    tier,
    language: text(params, "language"),
    topic: text(params, "topic"),
    collection: text(params, "collection"),
    window: window as StarsWindow,
    limit: parseLimit(params),
    after: cursor === null ? undefined : decodeCursor(cursor),
  };
}

export interface ApiOptions {
  /** Bearer token that `POST /rescrape` requires. Unset or blank: the route answers 404. */
  adminToken?: string;
}

/** The JSON body of a request, at most `MAX_BODY_BYTES`; the rest of a longer body is read and dropped so the 400 can be sent. */
function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size <= MAX_BODY_BYTES) chunks.push(chunk);
    });
    req.on("error", reject);
    req.on("end", () => {
      if (size > MAX_BODY_BYTES) return reject(new BadRequest(`body: must be at most ${MAX_BODY_BYTES} bytes`));
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new BadRequest("body: must be JSON"));
      }
    });
  });
}

/** Exactly one of `{ repoId }` (a positive safe integer) or `{ groupKey }` (1-MAX_TEXT characters). */
function parseRescrapeTarget(body: unknown): RescrapeTarget {
  if (typeof body !== "object" || body === null || Array.isArray(body)) throw new BadRequest("body: must be a JSON object");
  const { repoId, groupKey } = body as Record<string, unknown>;
  if ((repoId === undefined) === (groupKey === undefined)) throw new BadRequest("body: give exactly one of repoId or groupKey");
  if (repoId !== undefined) {
    if (typeof repoId !== "number" || !Number.isSafeInteger(repoId) || repoId < 1) throw new BadRequest("repoId: must be a positive integer");
    return { repoId };
  }
  if (typeof groupKey !== "string" || groupKey.trim() === "" || groupKey.length > MAX_TEXT) throw new BadRequest(`groupKey: must be 1-${MAX_TEXT} characters`);
  return { groupKey };
}

/** Constant-time check of `Authorization: Bearer <token>`: both sides are hashed first, so the compared buffers have equal length. */
function bearerMatches(header: string | undefined, expected: string): boolean {
  const given = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  return timingSafeEqual(createHash("sha256").update(given).digest(), createHash("sha256").update(expected).digest());
}

export function createApi(db: Queryable, options: ApiOptions = {}): (req: IncomingMessage, res: ServerResponse) => void {
  const adminToken = options.adminToken?.trim() || undefined;
  return (req, res) => {
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    handle(db, req, adminToken)
      .then(([status, body]) => send(status, body))
      .catch((err: unknown) => {
        if (err instanceof BadRequest) return send(400, { error: err.message });
        console.error("api error", err);
        send(500, { error: "internal error" });
      });
  };
}

async function handle(db: Queryable, req: IncomingMessage, adminToken: string | undefined): Promise<[number, unknown]> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = url.pathname;

  if (path === "/rescrape") {
    if (adminToken === undefined) return [404, { error: "not found" }];
    if (req.method !== "POST") return [405, { error: "method not allowed" }];
    if (!bearerMatches(req.headers.authorization, adminToken)) return [401, { error: "unauthorized" }];
    const target = parseRescrapeTarget(await readJsonBody(req));
    const queued = await requestRescrape(db, target, new Date());
    return queued > 0 ? [202, { queued }] : [404, { error: "repo or group is not tracked" }];
  }

  if (req.method !== "GET") return [405, { error: "method not allowed" }];

  if (path === "/health") {
    try {
      await db.query("SELECT 1");
      return [200, { ok: true }];
    } catch {
      return [503, { ok: false }];
    }
  }

  const tierMatch = path.match(/^\/tiers\/([^/]+)$/);
  if (tierMatch) {
    const tier = tierMatch[1] as Tier;
    if (!TIERS.includes(tier)) return [404, { error: "unknown tier" }];
    const page = await listTier(db, parseTierQuery(tier, url.searchParams));
    const last = page.items[page.items.length - 1];
    return [
      200,
      {
        tier,
        date: page.date,
        items: page.items.map(({ scoreText: _scoreText, ...item }) => item),
        nextCursor: page.hasMore && last ? encodeCursor(last.scoreText, last.repoId) : null,
      },
    ];
  }

  const repoMatch = path.match(/^\/repos\/([^/]+)$/);
  if (repoMatch) {
    const id = repoMatch[1]!;
    if (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id))) throw new BadRequest("id: must be a numeric repo id");
    const detail = await getRepoDetail(db, Number(id));
    return detail ? [200, detail] : [404, { error: "repo not found" }];
  }

  if (path === "/ops/sources") return [200, { items: await listDisplayableSources(db) }];

  if (path === "/topics/rising") return [200, { items: [] }]; // TODO(HUN-158): rising topics over 7/30 days

  if (path === "/consensus") {
    const cursor = url.searchParams.get("cursor");
    const page = await listConsensus(db, {
      limit: parseLimit(url.searchParams),
      after: cursor === null ? undefined : decodeConsensusCursor(cursor),
    });
    const last = page.items[page.items.length - 1];
    return [
      200,
      {
        date: page.date,
        items: page.items.map(({ firstSeenText: _firstSeenText, ...item }) => item),
        nextCursor: page.hasMore && last ? encodeConsensusCursor(last.consensusCount, last.firstSeenText, last.repoId) : null,
      },
    ];
  }

  return [404, { error: "not found" }];
}
