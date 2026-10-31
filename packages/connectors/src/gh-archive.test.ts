import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { Readable } from "node:stream";
import {
  DayAggregator,
  GhArchiveConnector,
  backfillDaysFromEnv,
  hourUrl,
  ingestDays,
  rollup,
  streamNdjsonGz,
  type DailyRollupRow,
  type GhArchiveEvent,
  type RollupStore,
  type StreamStats,
} from "./gh-archive.js";

const fixturePath = new URL("./fixtures/gh-archive/events.ndjson", import.meta.url);
const fixtureGz = () => gzipSync(readFileSync(fixturePath));

const freshStats = (): StreamStats => ({ lines: 0, malformed: 0 });

async function collect<T>(it: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const x of it) out.push(x);
  return out;
}

function ev(
  type: string,
  repoId: number,
  actorId: number,
  createdAt: string,
  action?: string,
): GhArchiveEvent {
  return {
    type,
    actor: { id: actorId, login: `u${actorId}` },
    repo: { id: repoId, name: `o/r${repoId}` },
    created_at: createdAt,
    ...(action ? { payload: { action } } : {}),
  };
}

/** In-memory RollupStore with replace-by-(repoId,date) semantics, like T002's upsertRepoDaily. */
class FakeStore implements RollupStore {
  cursor: string | null;
  rows = new Map<string, DailyRollupRow>();
  writes: DailyRollupRow[][] = [];
  cursorSets: string[] = [];
  constructor(cursor: string | null = null) {
    this.cursor = cursor;
  }
  async getCursor() {
    return this.cursor;
  }
  async setCursor(date: string) {
    this.cursor = date;
    this.cursorSets.push(date);
  }
  async writeDaily(rows: DailyRollupRow[]) {
    this.writes.push(rows);
    for (const r of rows) this.rows.set(`${r.repoId}|${r.date}`, r);
  }
}

/** Fake dump host: records requested URLs, serves a per-URL gzip body (default: empty hour). */
function fakeFetch(bodies: Record<string, string> = {}, statusFor: (url: string) => number = () => 200) {
  const urls: string[] = [];
  const impl = async (url: string) => {
    urls.push(url);
    const status = statusFor(url);
    if (status !== 200) return new Response(null, { status });
    return new Response(gzipSync(Buffer.from(bodies[url] ?? "")));
  };
  return { impl, urls };
}

const line = (e: GhArchiveEvent) => JSON.stringify(e);

// AC 1
test("hourUrl: UTC, hour not zero-padded", () => {
  assert.equal(
    hourUrl(new Date("2026-10-30T00:15:00Z")),
    "https://data.gharchive.org/2026-10-30-0.json.gz",
  );
  assert.equal(
    hourUrl(new Date("2026-10-30T23:59:59Z")),
    "https://data.gharchive.org/2026-10-30-23.json.gz",
  );
  assert.equal(
    hourUrl(new Date("2026-03-05T07:00:00Z")),
    "https://data.gharchive.org/2026-03-05-7.json.gz",
  );
});

// AC 2, 3
test("streamNdjsonGz: gunzips the fixture, parses per line, counts malformed, reads last line without newline", async () => {
  const stats = freshStats();
  const events = await collect(streamNdjsonGz(Readable.from([fixtureGz()]), stats));
  assert.equal(stats.lines, 12);
  assert.equal(stats.malformed, 1);
  assert.equal(events.length, 11);
  assert.equal((events[10] as GhArchiveEvent).type, "CreateEvent"); // the last line has no trailing newline
});

test("streamNdjsonGz: works when the gzip arrives in tiny chunks", async () => {
  const gz = fixtureGz();
  const chunks: Buffer[] = [];
  for (let i = 0; i < gz.length; i += 7) chunks.push(gz.subarray(i, i + 7));
  const stats = freshStats();
  const events = await collect(streamNdjsonGz(Readable.from(chunks), stats));
  assert.equal(events.length, 11);
  assert.equal(stats.malformed, 1);
});

test("streamNdjsonGz: a corrupt gzip body rejects", async () => {
  await assert.rejects(
    collect(streamNdjsonGz(Readable.from([Buffer.from("not gzip at all")]), freshStats())),
  );
});

// AC 1 of Success Criteria, AC 4, 5, 9
test("rollup: fixture yields exact RepoDaily rows (split at UTC midnight, contributors, starsMaxHour)", async () => {
  const stats = freshStats();
  const events = (await collect(
    streamNdjsonGz(Readable.from([fixtureGz()]), stats),
  )) as GhArchiveEvent[];
  const rows = rollup(events);
  const expected: DailyRollupRow[] = [
    {
      repoId: 100, date: "2026-10-30",
      starsNew: 3, forksNew: 1, pushes: 1, issuesOpened: 0, prsOpened: 0,
      distinctActors: 4, contributors: 1, starsMaxHour: 2,
    },
    {
      repoId: 200, date: "2026-10-30",
      starsNew: 0, forksNew: 0, pushes: 0, issuesOpened: 1, prsOpened: 1,
      distinctActors: 3, contributors: 1, starsMaxHour: 0,
    },
    {
      repoId: 200, date: "2026-10-31",
      starsNew: 1, forksNew: 0, pushes: 0, issuesOpened: 0, prsOpened: 0,
      distinctActors: 1, contributors: 0, starsMaxHour: 1,
    },
    {
      repoId: 300, date: "2026-10-31",
      starsNew: 0, forksNew: 0, pushes: 0, issuesOpened: 0, prsOpened: 1,
      distinctActors: 1, contributors: 1, starsMaxHour: 0,
    },
  ];
  assert.deepEqual(rows, expected);
});

test("rollup: only 'opened' issues/PRs count; non-kept types are ignored; repeated actor counted once", () => {
  const rows = rollup([
    ev("IssuesEvent", 1, 1, "2026-10-30T01:00:00Z", "closed"),
    ev("IssuesEvent", 1, 1, "2026-10-30T01:00:00Z", "opened"),
    ev("PullRequestEvent", 1, 1, "2026-10-30T01:00:00Z", "closed"),
    ev("PushEvent", 1, 1, "2026-10-30T02:00:00Z"),
    ev("PushEvent", 1, 1, "2026-10-30T03:00:00Z"),
    ev("IssueCommentEvent", 1, 2, "2026-10-30T03:00:00Z"),
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.issuesOpened, 1);
  assert.equal(rows[0]!.prsOpened, 0);
  assert.equal(rows[0]!.pushes, 2);
  assert.equal(rows[0]!.distinctActors, 1);
  assert.equal(rows[0]!.contributors, 1);
});

// edge: missing ids
test("DayAggregator: events missing repo.id, actor.id or a valid created_at are invalid, not thrown", () => {
  const agg = new DayAggregator();
  const noRepo = { type: "WatchEvent", actor: { id: 1, login: "a" }, created_at: "2026-10-30T01:00:00Z" };
  const noActor = { type: "WatchEvent", repo: { id: 1, name: "o/r" }, created_at: "2026-10-30T01:00:00Z" };
  const badDate = ev("WatchEvent", 1, 1, "yesterday");
  assert.equal(agg.add(noRepo as unknown as GhArchiveEvent), "invalid");
  assert.equal(agg.add(noActor as unknown as GhArchiveEvent), "invalid");
  assert.equal(agg.add(badDate), "invalid");
  assert.equal(agg.add(ev("CreateEvent", 1, 1, "2026-10-30T01:00:00Z")), "ignored");
  assert.equal(agg.add(ev("WatchEvent", 1, 1, "2026-10-30T01:00:00Z")), "kept");
  assert.equal(agg.rows().length, 1);
});

// AC 10
test("backfillDaysFromEnv: default 1, parses a positive integer, falls back on junk", () => {
  assert.equal(backfillDaysFromEnv({}), 1);
  assert.equal(backfillDaysFromEnv({ GHARCHIVE_BACKFILL_DAYS: "7" }), 7);
  assert.equal(backfillDaysFromEnv({ GHARCHIVE_BACKFILL_DAYS: "0" }), 1);
  assert.equal(backfillDaysFromEnv({ GHARCHIVE_BACKFILL_DAYS: "abc" }), 1);
});

// AC 6, Success Criteria 2, 3
test("ingestDays: backfills each completed day after the cursor in order, then a rerun is a no-op", async () => {
  const store = new FakeStore("2026-10-28");
  const host = fakeFetch();
  const now = new Date("2026-10-31T02:00:00Z");

  const first = await ingestDays(store, { now, fetchImpl: host.impl });
  assert.deepEqual(first.daysProcessed, ["2026-10-29", "2026-10-30"]);
  assert.equal(first.hoursProcessed, 48);
  assert.equal(host.urls.length, 48);
  assert.equal(host.urls[0], "https://data.gharchive.org/2026-10-29-0.json.gz");
  assert.equal(host.urls[23], "https://data.gharchive.org/2026-10-29-23.json.gz");
  assert.equal(host.urls[24], "https://data.gharchive.org/2026-10-30-0.json.gz");
  assert.equal(host.urls[47], "https://data.gharchive.org/2026-10-30-23.json.gz");
  assert.deepEqual(store.cursorSets, ["2026-10-29", "2026-10-30"]);
  assert.equal(store.cursor, "2026-10-30");

  const second = await ingestDays(store, { now, fetchImpl: host.impl });
  assert.deepEqual(second.daysProcessed, []);
  assert.equal(second.hoursProcessed, 0);
  assert.equal(host.urls.length, 48); // no new fetches
});

test("ingestDays: a day is complete only once its hour 23 dump can exist (now >= day+1 01:00 UTC)", async () => {
  const store = new FakeStore("2026-10-29");
  const host = fakeFetch();
  const r = await ingestDays(store, { now: new Date("2026-10-31T00:59:59Z"), fetchImpl: host.impl });
  assert.deepEqual(r.daysProcessed, []);
  assert.equal(host.urls.length, 0);

  const r2 = await ingestDays(store, { now: new Date("2026-10-31T01:00:00Z"), fetchImpl: host.impl });
  assert.deepEqual(r2.daysProcessed, ["2026-10-30"]);
});

// AC 7
test("ingestDays: distinct_actors is exact across the 24 hours of a day and written once", async () => {
  const day = "2026-10-30";
  const bodies: Record<string, string> = {
    [`https://data.gharchive.org/${day}-3.json.gz`]: [
      line(ev("WatchEvent", 1, 10, `${day}T03:10:00Z`)),
      line(ev("WatchEvent", 1, 11, `${day}T03:20:00Z`)),
    ].join("\n"),
    [`https://data.gharchive.org/${day}-20.json.gz`]: [
      line(ev("WatchEvent", 1, 10, `${day}T20:10:00Z`)), // same actor as hour 3
      line(ev("PushEvent", 1, 12, `${day}T20:11:00Z`)),
    ].join("\n"),
  };
  const store = new FakeStore("2026-10-29");
  const host = fakeFetch(bodies);
  const r = await ingestDays(store, { now: new Date("2026-10-31T05:00:00Z"), fetchImpl: host.impl });

  assert.equal(store.writes.length, 1);
  assert.equal(store.writes[0]!.length, 1);
  const row = store.writes[0]![0]!;
  assert.equal(row.distinctActors, 3); // 10, 11, 12 — actor 10 counted once
  assert.equal(row.starsNew, 3);
  assert.equal(row.starsMaxHour, 2);
  assert.equal(row.contributors, 1);
  assert.equal(r.kept, 4);
});

test("ingestDays: events whose created_at falls outside the ingested day are dropped (no partial overwrite of a neighbouring day)", async () => {
  const day = "2026-10-30";
  const bodies = {
    [`https://data.gharchive.org/${day}-0.json.gz`]: [
      line(ev("WatchEvent", 1, 1, "2026-10-29T23:59:59Z")), // late arrival belonging to the previous day
      line(ev("WatchEvent", 1, 2, `${day}T00:00:05Z`)),
    ].join("\n"),
  };
  const store = new FakeStore("2026-10-29");
  const r = await ingestDays(store, {
    now: new Date("2026-10-31T05:00:00Z"),
    fetchImpl: fakeFetch(bodies).impl,
  });
  assert.deepEqual([...store.rows.keys()], [`1|${day}`]);
  assert.equal(store.rows.get(`1|${day}`)!.starsNew, 1);
  assert.equal(r.outOfDay, 1);
});

test("ingestDays: malformed lines are reported in the result, not thrown", async () => {
  const day = "2026-10-30";
  const bodies = { [`https://data.gharchive.org/${day}-1.json.gz`]: `{broken\n${line(ev("WatchEvent", 1, 1, `${day}T01:00:00Z`))}` };
  const store = new FakeStore("2026-10-29");
  const r = await ingestDays(store, {
    now: new Date("2026-10-31T05:00:00Z"),
    fetchImpl: fakeFetch(bodies).impl,
  });
  assert.equal(r.malformed, 1);
  assert.equal(store.rows.size, 1);
});

// AC 8
test("ingestDays: 404 for an hour stops the run; that day is not written and the cursor does not advance past it", async () => {
  const store = new FakeStore("2026-10-28");
  const host = fakeFetch({}, (url) => (url.includes("2026-10-30-5.json.gz") ? 404 : 200));
  const r = await ingestDays(store, { now: new Date("2026-10-31T05:00:00Z"), fetchImpl: host.impl });
  assert.deepEqual(r.daysProcessed, ["2026-10-29"]);
  assert.equal(r.stoppedAt, "https://data.gharchive.org/2026-10-30-5.json.gz");
  assert.equal(store.cursor, "2026-10-29");
  assert.equal(store.writes.length, 0); // both days empty -> nothing to write; the 404 day never reached writeDaily
  assert.equal(host.urls.length, 24 + 6); // stopped right after the 404
});

test("ingestDays: a non-404 HTTP error throws and leaves the cursor untouched", async () => {
  const store = new FakeStore("2026-10-29");
  const host = fakeFetch({}, () => 500);
  await assert.rejects(
    ingestDays(store, { now: new Date("2026-10-31T05:00:00Z"), fetchImpl: host.impl }),
    /500/,
  );
  assert.equal(store.cursor, "2026-10-29");
});

// AC 10
test("ingestDays: first run (no cursor) ingests only yesterday by default, N most recent days with backfillDays", async () => {
  const now = new Date("2026-10-31T05:00:00Z");

  const s1 = new FakeStore(null);
  const r1 = await ingestDays(s1, { now, fetchImpl: fakeFetch().impl });
  assert.deepEqual(r1.daysProcessed, ["2026-10-30"]);

  const s2 = new FakeStore(null);
  const r2 = await ingestDays(s2, { now, fetchImpl: fakeFetch().impl, backfillDays: 3 });
  assert.deepEqual(r2.daysProcessed, ["2026-10-28", "2026-10-29", "2026-10-30"]);
  assert.equal(s2.cursor, "2026-10-30");
});

test("GhArchiveConnector.ingest delegates to ingestDays and reads GHARCHIVE_BACKFILL_DAYS", async () => {
  const store = new FakeStore(null);
  const r = await new GhArchiveConnector().ingest(store, {
    now: new Date("2026-10-31T05:00:00Z"),
    fetchImpl: fakeFetch().impl,
    env: { GHARCHIVE_BACKFILL_DAYS: "2" },
  });
  assert.deepEqual(r.daysProcessed, ["2026-10-29", "2026-10-30"]);
});

// Optional live smoke: one past hour, streamed. Never runs in CI.
test(
  "live: stream one real past hour",
  { skip: process.env.GHARCHIVE_LIVE !== "1" },
  async () => {
    const res = await fetch(hourUrl(new Date("2026-01-15T12:00:00Z")));
    assert.equal(res.status, 200);
    const stats = freshStats();
    const agg = new DayAggregator();
    for await (const e of streamNdjsonGz(Readable.fromWeb(res.body as never), stats)) {
      agg.add(e as GhArchiveEvent);
    }
    assert.ok(stats.lines > 1000);
    assert.ok(agg.rows().length > 0);
  },
);
