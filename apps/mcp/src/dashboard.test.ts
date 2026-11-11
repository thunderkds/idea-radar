import assert from "node:assert/strict";
import type { Server } from "node:http";
import { after, before, describe, test } from "node:test";
import type { StoredIdea } from "@idea-radar/db";
import type { IdeaStore, IdeaSummary, ListFilter } from "./index-store.js";
import { SESSION_TTL_SECONDS, createSession } from "./session.js";
import { createHttpServer } from "./server.js";

const READ = "r-test-token-that-is-long-enough-1234";
const WRITE = "w-test-token-that-is-long-enough-1234";
const DASH = "d-test-token-that-is-long-enough-1234";

const servers: Server[] = [];
after(() => {
  for (const s of servers) s.close();
});

function summary(over: Partial<IdeaSummary> = {}): IdeaSummary {
  return {
    id: "markdown-notes",
    title: "Markdown notes",
    summary: "Notes in plain markdown.",
    tags: ["notes", "ai"],
    first_seen: "2026-11-01",
    last_seen: "2026-11-09",
    ...over,
  };
}

function full(over: Partial<StoredIdea> = {}): StoredIdea {
  return {
    ...summary(),
    why_now: "Models got cheap.",
    signals: [{ kind: "repo", url: "https://github.com/o/r", note: "popular" }],
    related_repos: ["o/r"],
    updated_at: "2026-11-09T10:00:00.000Z",
    ...over,
  } as StoredIdea;
}

/** A store with no database; it records what the dashboard asked for. */
function stub(over: Partial<IdeaStore> = {}) {
  const calls = { list: [] as ListFilter[], search: [] as { query: string; limit: number }[], get: [] as string[] };
  const store: IdeaStore = {
    list: (f) => {
      calls.list.push(f);
      return Promise.resolve([summary()]);
    },
    search: (query, limit) => {
      calls.search.push({ query, limit });
      return Promise.resolve([summary({ id: "found", title: "Found one" })]);
    },
    get: (id) => {
      calls.get.push(id);
      return Promise.resolve(id === "markdown-notes" ? full() : undefined);
    },
    submit: () => Promise.resolve({ ok: true as const, saved: 1, date: "2026-11-10" }),
    ping: () => Promise.resolve(),
    ...over,
  };
  return { store, calls };
}

async function start(store: IdeaStore, log: (l: string) => void = () => {}): Promise<string> {
  const server = createHttpServer(store, { read: READ, write: WRITE, dashboard: DASH }, log);
  servers.push(server);
  await new Promise<void>((resolveListen) => server.listen(0, () => resolveListen()));
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}

const manual = { redirect: "manual" as const };
const goodCookie = () => `ir_session=${createSession(DASH, Date.now())}`;
const form = (token: string) => ({
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ token }).toString(),
  ...manual,
});
const authed = (path: string, url: string) => fetch(`${url}${path}`, { headers: { cookie: goodCookie() }, ...manual });

describe("login and session (FR-010)", () => {
  let url: string;
  before(async () => {
    url = await start(stub().store);
  });

  test("GET / without a cookie is 303 to /login", async () => {
    const res = await fetch(`${url}/`, manual);
    assert.equal(res.status, 303);
    assert.equal(res.headers.get("location"), "/login");
  });

  test("GET /login shows a token form that posts to /login", async () => {
    const res = await fetch(`${url}/login`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /^text\/html/);
    const body = await res.text();
    assert.match(body, /<form[^>]*method="post"[^>]*action="\/login"/);
    assert.match(body, /<input[^>]*name="token"[^>]*>/);
    assert.match(body, /<input[^>]*type="password"[^>]*>/);
  });

  test("the right token sets an HttpOnly SameSite=Lax cookie that is an HMAC, not the token, and redirects to /", async () => {
    const res = await fetch(`${url}/login`, form(DASH));
    assert.equal(res.status, 303);
    assert.equal(res.headers.get("location"), "/");
    const cookie = res.headers.get("set-cookie") ?? "";
    assert.match(cookie, /^ir_session=\d+\.[0-9a-f]{64};/);
    assert.match(cookie, /; HttpOnly/);
    assert.match(cookie, /; SameSite=Lax/);
    assert.match(cookie, /; Path=\//);
    assert.match(cookie, new RegExp(`; Max-Age=${SESSION_TTL_SECONDS}`));
    assert.doesNotMatch(cookie, /; Secure/);
    assert.ok(!cookie.includes(DASH));
    const home = await fetch(`${url}/`, { headers: { cookie: cookie.split(";")[0]! }, ...manual });
    assert.equal(home.status, 200);
    assert.match(await home.text(), /Markdown notes/);
  });

  test("the cookie is Secure behind an HTTPS proxy", async () => {
    const res = await fetch(`${url}/login`, {
      ...form(DASH),
      headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-proto": "https" },
    });
    assert.match(res.headers.get("set-cookie") ?? "", /; Secure/);
  });

  test("a wrong, empty or missing token is 401 with a 'Wrong token' message, the form, and no cookie", async () => {
    for (const body of [form("nope"), form(""), { ...form(""), body: "" }, form(`${DASH} `), form(READ), form(WRITE)]) {
      const res = await fetch(`${url}/login`, body);
      assert.equal(res.status, 401);
      assert.equal(res.headers.get("set-cookie"), null);
      const text = await res.text();
      assert.match(text, /Wrong token/);
      assert.match(text, /<input[^>]*name="token"/);
    }
  });

  test("an expired, tampered, rotated-token or garbage cookie is redirected to /login", async () => {
    const [exp, mac] = createSession(DASH, Date.now()).split(".") as [string, string];
    const expired = createSession(DASH, Date.now() - (SESSION_TTL_SECONDS + 5) * 1000);
    const cookies = [
      expired,
      `${Number(exp) + 99999}.${mac}`,
      createSession(`${DASH}-old`, Date.now()),
      "garbage",
      DASH,
    ];
    for (const value of cookies) {
      const res = await fetch(`${url}/`, { headers: { cookie: `ir_session=${value}` }, ...manual });
      assert.equal(res.status, 303, value);
      assert.equal(res.headers.get("location"), "/login");
    }
  });

  test("POST /logout clears the cookie and goes to /login", async () => {
    const res = await fetch(`${url}/logout`, { method: "POST", headers: { cookie: goodCookie() }, ...manual });
    assert.equal(res.status, 303);
    assert.equal(res.headers.get("location"), "/login");
    const cookie = res.headers.get("set-cookie") ?? "";
    assert.match(cookie, /^ir_session=;/);
    assert.match(cookie, /Max-Age=0/);
    assert.match(cookie, /HttpOnly/);
  });

  test("a cross-site POST to /login or /logout is 403 and sets nothing", async () => {
    const evil: Record<string, string>[] = [
      { origin: "https://evil.example" },
      { origin: "null" },
      { "sec-fetch-site": "cross-site" },
      { "sec-fetch-site": "same-site" },
    ];
    for (const extra of evil) {
      const login = await fetch(`${url}/login`, {
        ...form(DASH),
        headers: { "content-type": "application/x-www-form-urlencoded", ...extra },
      });
      assert.equal(login.status, 403, JSON.stringify(extra));
      assert.equal(login.headers.get("set-cookie"), null);
      const logout = await fetch(`${url}/logout`, {
        method: "POST",
        headers: { cookie: goodCookie(), ...extra },
        ...manual,
      });
      assert.equal(logout.status, 403, JSON.stringify(extra));
      assert.equal(logout.headers.get("set-cookie"), null);
    }
  });

  test("a same-origin POST (Origin = Host, or Sec-Fetch-Site same-origin) is accepted", async () => {
    for (const extra of [{ origin: url }, { "sec-fetch-site": "same-origin" }] as Record<string, string>[]) {
      const res = await fetch(`${url}/login`, {
        ...form(DASH),
        headers: { "content-type": "application/x-www-form-urlencoded", ...extra },
      });
      assert.equal(res.status, 303, JSON.stringify(extra));
    }
  });

  test("the dashboard cookie never grants MCP access", async () => {
    const res = await fetch(`${url}/mcp`, {
      method: "POST",
      headers: {
        cookie: goodCookie(),
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: "{}",
    });
    assert.equal(res.status, 401);
  });

  test("/health and unknown paths are unchanged", async () => {
    assert.deepEqual(await (await fetch(`${url}/health`)).json(), { ok: true });
    assert.equal((await fetch(`${url}/nope`)).status, 404);
  });

  test("pages are not cached, not framed, and allow only their own inline style: no scripts, no external loads", async () => {
    for (const res of [await fetch(`${url}/login`), await authed("/", url)]) {
      assert.equal(res.headers.get("cache-control"), "no-store");
      assert.equal(res.headers.get("x-content-type-options"), "nosniff");
      const csp = res.headers.get("content-security-policy") ?? "";
      assert.match(csp, /default-src 'none'/);
      assert.match(csp, /style-src 'sha256-[A-Za-z0-9+/=]+'/);
      assert.match(csp, /frame-ancestors 'none'/);
      assert.doesNotMatch(csp, /script-src|unsafe/);
      const body = await res.text();
      assert.doesNotMatch(body, /<script|<link|<img|@import|url\(|https?:\/\/(?!github\.com)/i);
    }
  });
});

describe("idea list (AC3, AC5, UX rows)", () => {
  test("newest ideas first from the store, limit 50, showing title, summary, tags and last_seen", async () => {
    const { store, calls } = stub();
    const url = await start(store);
    const res = await authed("/", url);
    assert.equal(res.status, 200);
    const body = await res.text();
    assert.equal(calls.list.length, 1);
    assert.equal(calls.list[0]?.limit, 50);
    assert.match(body, /<a href="\/ideas\/markdown-notes"[^>]*>Markdown notes<\/a>/);
    assert.match(body, /Notes in plain markdown\./);
    assert.match(body, /notes/);
    assert.match(body, /2026-11-09/);
  });

  test("idea text is HTML-escaped: <script>, quotes, ampersands", async () => {
    const evil = summary({
      id: `x"><script>1</script>`,
      title: `<script>alert(1)</script>`,
      summary: `"double" 'single' & <b>bold</b>`,
      tags: [`<i>tag</i>`, `a"b`],
    });
    const url = await start(stub({ list: () => Promise.resolve([evil]) }).store);
    const body = await (await authed("/", url)).text();
    assert.match(body, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.match(body, /&quot;double&quot; &#39;single&#39; &amp; &lt;b&gt;bold&lt;\/b&gt;/);
    assert.match(body, /&lt;i&gt;tag&lt;\/i&gt;/);
    assert.doesNotMatch(body, /<script|<b>|<i>/);
    assert.doesNotMatch(body, /href="\/ideas\/x"/);
    assert.match(body, /href="\/ideas\/x%22%3E%3Cscript%3E1%3C%2Fscript%3E"/);
  });

  test("an empty store says 'No ideas yet'", async () => {
    const url = await start(stub({ list: () => Promise.resolve([]) }).store);
    const body = await (await authed("/", url)).text();
    assert.match(body, /No ideas yet/);
  });

  test("a database error is an HTML 500 with no detail, and is logged", async () => {
    const lines: string[] = [];
    const url = await start(stub({ list: () => Promise.reject(new Error("secret db detail")) }).store, (l) =>
      lines.push(l),
    );
    const res = await authed("/", url);
    assert.equal(res.status, 500);
    const body = await res.text();
    assert.doesNotMatch(body, /secret db detail/);
    assert.match(body, /<html/);
    assert.ok(lines.some((l) => l.includes("secret db detail")));
  });
});
