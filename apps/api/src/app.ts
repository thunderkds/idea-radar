import type { IncomingMessage, ServerResponse } from "node:http";
import type { ConsensusQuery, Queryable, StarsWindow, TierQuery } from "@idea-radar/db";
import { getRepoDetail, listConsensus, listDisplayableSources, listTier } from "@idea-radar/db";
import type { Tier } from "@idea-radar/core";

/**
 * Read-only API for the dashboard (HUN-156). `createApi(db)` returns a plain Node request handler so
 * tests can serve it on port 0; `index.ts` only owns the pool, the server and the listener.
 * Data-access SQL lives in packages/db/src/api.ts.
 */
const TIERS: Tier[] = ["trending", "medium", "lowkey"];
const WINDOWS: StarsWindow[] = ["7d", "30d"];
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const MAX_TEXT = 200;

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

export function createApi(db: Queryable): (req: IncomingMessage, res: ServerResponse) => void {
  return (req, res) => {
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    handle(db, req)
      .then(([status, body]) => send(status, body))
      .catch((err: unknown) => {
        if (err instanceof BadRequest) return send(400, { error: err.message });
        console.error("api error", err);
        send(500, { error: "internal error" });
      });
  };
}

async function handle(db: Queryable, req: IncomingMessage): Promise<[number, unknown]> {
  if (req.method !== "GET") return [405, { error: "method not allowed" }];
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = url.pathname;

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
