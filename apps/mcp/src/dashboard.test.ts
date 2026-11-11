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

describe("filters and search (AC3)", () => {
  test("tag, since and until go to the store; the form keeps them", async () => {
    const { store, calls } = stub();
    const url = await start(store);
    const body = await (await authed("/?tag=Notes&since=2026-11-01&until=2026-11-09", url)).text();
    assert.deepEqual(calls.list, [{ tag: "Notes", since: "2026-11-01", until: "2026-11-09", limit: 50 }]);
    assert.equal(calls.search.length, 0);
    assert.match(body, /name="tag"[^>]*value="Notes"/);
    assert.match(body, /name="since"[^>]*value="2026-11-01"/);
    assert.match(body, /name="until"[^>]*value="2026-11-09"/);
  });

  test("a bad date is ignored with a visible notice, and the list still shows", async () => {
    const { store, calls } = stub();
    const url = await start(store);
    const body = await (await authed("/?since=yesterday&until=2026-02-30", url)).text();
    assert.equal(calls.list[0]?.since, undefined);
    assert.equal(calls.list[0]?.until, undefined);
    assert.match(body, /since: write the date as YYYY-MM-DD/);
    assert.match(body, /until: write the date as YYYY-MM-DD/);
    assert.match(body, /Markdown notes/);
  });

  test("a search uses the store's search (same as the MCP search_ideas), keeps the query in the box and lists matches", async () => {
    const { store, calls } = stub();
    const url = await start(store);
    const body = await (await authed("/?q=markdown", url)).text();
    assert.deepEqual(calls.search, [{ query: "markdown", limit: 100 }]);
    assert.equal(calls.list.length, 0);
    assert.match(body, /name="q"[^>]*value="markdown"/);
    assert.match(body, /Found one/);
  });

  test("search results are narrowed by the tag and date filters", async () => {
    const hits = [
      summary({ id: "a", title: "A", tags: ["ai"], last_seen: "2026-11-09" }),
      summary({ id: "b", title: "B", tags: ["web"], last_seen: "2026-11-09" }),
      summary({ id: "c", title: "C", tags: ["ai"], last_seen: "2026-10-01" }),
    ];
    const url = await start(stub({ search: () => Promise.resolve(hits) }).store);
    const body = await (await authed("/?q=x&tag=AI&since=2026-11-01", url)).text();
    assert.match(body, />A<\/a>/);
    assert.doesNotMatch(body, />B<\/a>/);
    assert.doesNotMatch(body, />C<\/a>/);
  });

  test("no match says so; a blank or over-long query is ignored with a notice (blank: silently)", async () => {
    const { store, calls } = stub({ search: () => Promise.resolve([]) });
    const url = await start(store);
    assert.match(await (await authed("/?q=zzz", url)).text(), /No ideas match/);
    await (await authed("/?q=%20%20", url)).text();
    assert.equal(calls.list.length, 1);
    const long = await (await authed(`/?q=${"x".repeat(201)}`, url)).text();
    assert.match(long, /search: at most 200 characters/);
    assert.equal(calls.list.length, 2);
  });

  test("query parameters are echoed escaped, in the form and in the messages", async () => {
    const url = await start(stub().store);
    const evil = encodeURIComponent(`"><script>alert(1)</script>`);
    const body = await (await authed(`/?q=${evil}&tag=${evil}&since=${evil}`, url)).text();
    assert.doesNotMatch(body, /<script|"><script/);
    assert.match(body, /&quot;&gt;&lt;script&gt;/);
  });

  test("a NUL in a parameter never reaches the store", async () => {
    const { store, calls } = stub();
    const url = await start(store);
    await (await authed("/?tag=a%00b&q=c%00d", url)).text();
    assert.equal(calls.search[0]?.query, "cd");
    await (await authed("/?tag=a%00b", url)).text();
    assert.equal(calls.list[0]?.tag, "ab");
  });

  test("tag chips on the list link to that tag's filter", async () => {
    const url = await start(stub().store);
    const body = await (await authed("/", url)).text();
    assert.match(body, /<a class="chip" href="\/\?tag=notes">notes<\/a>/);
  });
});

describe("idea page (AC4, AC5)", () => {
  test("shows why_now, signals as safe links, related repos, first and last seen, and a back link", async () => {
    const { store, calls } = stub();
    const url = await start(store);
    const res = await authed("/ideas/markdown-notes", url);
    assert.equal(res.status, 200);
    const body = await res.text();
    assert.deepEqual(calls.get, ["markdown-notes"]);
    assert.match(body, /<h1>Markdown notes<\/h1>/);
    assert.match(body, /Models got cheap\./);
    assert.match(
      body,
      /<a href="https:\/\/github\.com\/o\/r" rel="noopener noreferrer nofollow" target="_blank">https:\/\/github\.com\/o\/r<\/a>/,
    );
    assert.match(body, /popular/);
    assert.match(body, /o\/r/);
    assert.match(body, /2026-11-01/);
    assert.match(body, /2026-11-09/);
    assert.match(body, /<a class="back" href="\/">/);
  });

  test("a javascript:, data: or relative signal url is text, never a link; every field is escaped", async () => {
    const evil = full({
      title: `<script>alert(1)</script>`,
      summary: `"q" 'q' & <b>`,
      why_now: `<img src=x onerror=alert(1)>`,
      tags: [`<u>t</u>`],
      related_repos: [`<s>o/r</s>`],
      signals: [
        { kind: "repo", url: "javascript:alert(1)", note: `"><script>1</script>` },
        { kind: "<k>" as never, url: "data:text/html,<script>1</script>", note: "n'&" },
        { kind: "repo", url: "/relative", note: "n" },
        { kind: "repo", url: `https://example.com/?a="b"&c='d'<e>`, note: "ok" },
      ],
    });
    const url = await start(stub({ get: () => Promise.resolve(evil) }).store);
    const body = await (await authed("/ideas/x", url)).text();
    assert.doesNotMatch(body, /<script|<img|<b>|<u>|<s>|<k>/);
    assert.doesNotMatch(body, /href="javascript|href="data:|href="\/relative/i);
    assert.equal((body.match(/target="_blank"/g) ?? []).length, 1);
    assert.match(body, /javascript:alert\(1\)/);
    assert.match(body, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.match(body, /href="https:\/\/example\.com\/\?a=%22b%22&amp;c=%27d%27%3Ce%3E"/);
  });

  test("an idea with no why_now, signals or repos still renders", async () => {
    const bare = { ...full({ signals: [], related_repos: [] }) } as Partial<StoredIdea>;
    delete bare.why_now;
    const url = await start(stub({ get: () => Promise.resolve(bare as StoredIdea) }).store);
    assert.equal((await authed("/ideas/x", url)).status, 200);
  });

  test("an unknown id is an HTML 404 with a way back; an id with a bad escape is 404 too", async () => {
    const url = await start(stub().store);
    for (const path of ["/ideas/nope", "/ideas/%E0%A4%A", "/ideas/a%00b"]) {
      const res = await authed(path, url);
      assert.equal(res.status, 404, path);
      assert.match(res.headers.get("content-type") ?? "", /^text\/html/);
      assert.match(await res.text(), /Idea not found[\s\S]*href="\/"/);
    }
  });

  test("without a cookie the idea page is a redirect to /login and the store is not asked", async () => {
    const { store, calls } = stub();
    const url = await start(store);
    const res = await fetch(`${url}/ideas/markdown-notes`, manual);
    assert.equal(res.status, 303);
    assert.equal(res.headers.get("location"), "/login");
    assert.equal(calls.get.length, 0);
  });

  test("only GET is allowed on / and /ideas/:id", async () => {
    const url = await start(stub().store);
    for (const path of ["/", "/ideas/markdown-notes"]) {
      const res = await fetch(`${url}${path}`, { method: "POST", headers: { cookie: goodCookie() }, ...manual });
      assert.equal(res.status, 405);
      assert.equal(res.headers.get("allow"), "GET");
    }
  });
});
