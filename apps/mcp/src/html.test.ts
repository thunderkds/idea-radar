import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { StoredIdea } from "@idea-radar/db";
import { escape, html as tpl, ideaPage, listPage, loginPage, messagePage, raw, safeHttpUrl } from "./html.js";
import type { ListView } from "./html.js";
import type { IdeaSummary } from "./index-store.js";

test("escape turns & < > \" ' into entities", () => {
  assert.equal(
    escape(`<script>alert("x")</script> & 'y'`),
    "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;",
  );
});

test("html escapes every interpolation unless it is marked raw, and joins arrays", () => {
  const evil = `"><img src=x onerror=alert(1)>`;
  assert.equal(
    String(tpl`<p title="${evil}">${evil}</p>`),
    `<p title="&quot;&gt;&lt;img src=x onerror=alert(1)&gt;">&quot;&gt;&lt;img src=x onerror=alert(1)&gt;</p>`,
  );
  const items = ["a", "<b>"].map((x) => tpl`<li>${x}</li>`);
  assert.equal(String(tpl`<ul>${items}</ul>`), "<ul><li>a</li><li>&lt;b&gt;</li></ul>");
  assert.equal(String(tpl`<i>${raw("<b>ok</b>")}</i>`), "<i><b>ok</b></i>");
  assert.equal(String(tpl`${undefined}${null}${5}`), "5");
});

test("safeHttpUrl accepts http and https only and returns the parsed form", () => {
  assert.equal(safeHttpUrl("https://example.com/a?b=1"), "https://example.com/a?b=1");
  assert.equal(safeHttpUrl("http://example.com"), "http://example.com/");
  for (const bad of [
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    " javascript:alert(1)",
    "data:text/html,<script>1</script>",
    "vbscript:x",
    "file:///etc/passwd",
    "//example.com",
    "/relative",
    "example.com",
    "",
    "https://",
  ])
    assert.equal(safeHttpUrl(bad), undefined, bad);
});

// ---- T039: dashboard redesign. Pages are rendered directly, no server. ----

/** Whitespace inside and between tags is formatting only (Prettier reflows `html` templates), and the stylesheet is not markup: compare without both. */
const flat = (page: string): string =>
  page
    .replace(/<style>[\s\S]*?<\/style>/, "<style></style>")
    .replace(/\s+/g, " ")
    .replace(/ >/g, ">");
const listHtml = (v: ListView): string => flat(listPage(v));
const ideaHtml = (i: StoredIdea): string => flat(ideaPage(i));
const loginHtml = (e?: string): string => flat(loginPage(e));
const messageHtml = (a: string, b: string, c: boolean): string => flat(messagePage(a, b, c));

const idea = (over: Partial<IdeaSummary> = {}): IdeaSummary => ({
  id: "a-idea",
  title: "A idea",
  summary: "A summary.",
  tags: ["rising", "cli"],
  first_seen: "2026-11-01",
  last_seen: "2026-11-09",
  ...over,
});

const view = (over: Partial<ListView> = {}): ListView => ({
  ideas: [idea()],
  q: "",
  tag: "",
  since: "",
  until: "",
  notices: [],
  limit: 50,
  ...over,
});

const stored = (over: Partial<StoredIdea> = {}): StoredIdea =>
  ({
    ...idea(),
    why_now: "Models got cheap.",
    signals: [{ kind: "repo", url: "https://github.com/o/r/issues?x=1", note: "popular" }],
    related_repos: ["owner/name"],
    updated_at: "2026-11-09T10:00:00.000Z",
    ...over,
  }) as StoredIdea;

const heads = (page: string) => [...page.matchAll(/<h2 id="bucket-([a-z-]+)">/g)].map((m) => m[1]);

describe("list page toolbar and filters (T039 AC1, AC2)", () => {
  test("one GET form: search input, a Filters details with tag, since, until (type=date) and the submit button", () => {
    const page = listHtml(view());
    assert.equal((page.match(/<form[^>]*method="get"/g) ?? []).length, 1);
    assert.match(page, /<input[^>]*name="q"[^>]*type="search"|<input[^>]*type="search"[^>]*name="q"/);
    const details = /<details[^>]*>([\s\S]*?)<\/details>/.exec(page);
    assert.ok(details, "has a details element");
    assert.match(details[1]!, /<summary[^>]*>\s*Filters/);
    assert.match(details[1]!, /name="tag"/);
    assert.match(details[1]!, /<input[^>]*type="date"[^>]*name="since"|<input[^>]*name="since"[^>]*type="date"/);
    assert.match(details[1]!, /<input[^>]*type="date"[^>]*name="until"|<input[^>]*name="until"[^>]*type="date"/);
    assert.match(details[1]!, /<button[^>]*type="submit"/);
    assert.doesNotMatch(details[1]!, /name="q"/);
  });

  test("details is closed with no filter (and with only q), open when tag, since or until is set; no chips and no Reset when none", () => {
    const none = listHtml(view());
    assert.match(none, /<details(?![^>]*\bopen\b)[^>]*>/);
    assert.doesNotMatch(none, /class="chip chip-x"|Reset/);
    assert.match(listHtml(view({ q: "x" })), /<details(?![^>]*\bopen\b)[^>]*>/);
    for (const over of [{ tag: "cli" }, { since: "2026-11-01" }, { until: "2026-11-02" }])
      assert.match(listHtml(view(over)), /<details[^>]* open[ >]/, JSON.stringify(over));
  });

  test("an active filter is a removable chip that drops only its own parameter; Reset clears all", () => {
    const page = listHtml(view({ tag: "cli", since: "2026-11-01" }));
    assert.equal((page.match(/class="chip chip-x"/g) ?? []).length, 2);
    assert.match(page, /<a class="chip chip-x" href="\/\?since=2026-11-01">/);
    assert.match(page, /<a class="chip chip-x" href="\/\?tag=cli">/);
    assert.match(page, /<a class="chip reset" href="\/">Reset<\/a>/);
    const all = listHtml(view({ q: "a b&c", tag: "t", since: "2026-11-01", until: "2026-11-30" }));
    assert.equal((all.match(/class="chip chip-x"/g) ?? []).length, 4);
    assert.match(all, /<a class="chip chip-x" href="\/\?tag=t&amp;since=2026-11-01&amp;until=2026-11-30">/);
    assert.match(all, /<a class="chip chip-x" href="\/\?q=a\+b%26c&amp;tag=t&amp;since=2026-11-01">/);
  });

  test("filter values are escaped in the chips and the inputs", () => {
    const evil = `"><script>alert(1)</script>`;
    const page = listHtml(view({ q: evil, tag: evil, since: evil, until: evil }));
    assert.doesNotMatch(page, /<script|"><script/);
    assert.match(page, /&quot;&gt;&lt;script&gt;/);
    assert.match(page, /href="\/\?[^"]*%22%3E%3Cscript%3E/);
  });
});

describe("list page sections and cards (T039 AC3, AC4, AC12)", () => {
  test("ideas are grouped rising, medium, low-key, other, with counts; empty sections are not rendered; order inside is kept", () => {
    const page = listHtml(
      view({
        ideas: [
          idea({ id: "z1", title: "Z1", tags: ["zzz"] }),
          idea({ id: "l1", title: "L1", tags: ["low-key", "x"] }),
          idea({ id: "r1", title: "R1", tags: ["rising"] }),
          idea({ id: "r2", title: "R2", tags: ["rising"] }),
          idea({ id: "n1", title: "N1", tags: [] }),
          idea({ id: "n2", title: "N2", tags: ["x", "rising"] }),
        ],
      }),
    );
    assert.deepEqual(heads(page), ["rising", "low-key", "other"]);
    assert.match(page, /<h2 id="bucket-rising">rising <span class="count">2<\/span><\/h2>/);
    assert.match(page, /<h2 id="bucket-low-key">low-key <span class="count">1<\/span><\/h2>/);
    assert.match(page, /<h2 id="bucket-other">other <span class="count">3<\/span><\/h2>/);
    assert.ok(page.indexOf(">R1<") < page.indexOf(">R2<"));
    assert.ok(page.indexOf(">Z1<") < page.indexOf(">N1<") && page.indexOf(">N1<") < page.indexOf(">N2<"));
    assert.doesNotMatch(page, /bucket-medium/);
  });

  test("a card has one title link (the stretched link), a clamped summary, last seen; chips are separate links", () => {
    const page = listHtml(view({ ideas: [idea({ tags: ["medium", "ai"] })] }));
    assert.equal((page.match(/<a href="\/ideas\//g) ?? []).length, 1);
    assert.match(page, /<h3><a href="\/ideas\/a-idea">A idea<\/a><\/h3>/);
    assert.match(page, /<p class="clamp">A summary\.<\/p>/);
    assert.match(page, /last seen 2026-11-09/);
    assert.match(page, /<a class="chip" href="\/\?tag=ai">ai<\/a>/);
  });

  test("at most 3 chips and a +N, the bucket tag omitted when the section names it", () => {
    const six = ["a", "b", "c", "d", "e"];
    const other = listHtml(view({ ideas: [idea({ tags: six })] }));
    assert.equal((other.match(/<a class="chip" href="\/\?tag=/g) ?? []).length, 3);
    assert.match(other, />\+2<\//);
    const bucket = listHtml(view({ ideas: [idea({ tags: ["rising", ...six] })] }));
    assert.doesNotMatch(bucket, /tag=rising/);
    assert.equal((bucket.match(/<a class="chip" href="\/\?tag=/g) ?? []).length, 3);
    assert.match(bucket, />\+2<\//);
    const few = listHtml(view({ ideas: [idea({ tags: ["rising", "a", "b", "c"] })] }));
    assert.equal((few.match(/<a class="chip" href="\/\?tag=/g) ?? []).length, 3);
    assert.doesNotMatch(few, />\+\d/);
    const late = listHtml(view({ ideas: [idea({ tags: ["x", "rising"] })] }));
    assert.match(late, /tag=rising/);
    assert.match(late, /bucket-other/);
  });

  test("an idea with no tags renders in other with no chips", () => {
    const page = listHtml(view({ ideas: [idea({ tags: [] })] }));
    assert.match(page, /bucket-other/);
    assert.doesNotMatch(page, /<a class="chip" /);
  });

  test("empty states, the count line with the limit note, and notices still show", () => {
    assert.match(listHtml(view({ ideas: [] })), /No ideas yet\./);
    assert.match(listHtml(view({ ideas: [], q: "x" })), /No ideas match\./);
    const full = listHtml(view({ ideas: [idea()], limit: 1, notices: ["since: write the date as YYYY-MM-DD"] }));
    assert.match(full, /1 idea, the newest 1: use the filters or search to find others/);
    assert.match(full, /role="alert">since: write the date as YYYY-MM-DD/);
    assert.match(full, /bucket-rising/);
  });
});

describe("idea page (T039 AC5, AC6, AC7)", () => {
  test("eyebrow with the bucket, h2 headings with counts, a highlighted why-now card, every tag, the back link", () => {
    const page = ideaHtml(stored({ tags: ["medium", "a", "b", "c", "d"] }));
    assert.match(page, /<p class="eyebrow">&gt; medium<\/p>/);
    assert.match(page, /<h2>Why now<\/h2>/);
    assert.match(page, /<section class="card card-hl">/);
    assert.match(page, /<h2>Signals \(1\)<\/h2>/);
    assert.match(page, /<h2>Related repos \(1\)<\/h2>/);
    for (const t of ["medium", "a", "b", "c", "d"])
      assert.match(page, new RegExp(`<a class="chip" href="/\\?tag=${t}">`));
    assert.match(page, /<a class="back" href="\/">/);
    assert.match(ideaHtml(stored({ tags: ["zzz"] })), /<p class="eyebrow">&gt; idea<\/p>/);
  });

  test("a signal shows kind, note and a host/path link with the full url as href and title", () => {
    const page = ideaHtml(stored());
    assert.match(page, /<span class="mono muted">repo<\/span>/);
    assert.match(page, /popular/);
    assert.match(
      page,
      /<a href="https:\/\/github\.com\/o\/r\/issues\?x=1" title="https:\/\/github\.com\/o\/r\/issues\?x=1" rel="noopener noreferrer nofollow" target="_blank">github\.com\/o\/r\/issues<\/a>/,
    );
  });

  test("a long link text is cut to 60 characters with an ellipsis; the href stays whole", () => {
    const long = `https://example.com/${"a".repeat(100)}?q=1`;
    const page = ideaHtml(stored({ signals: [{ kind: "repo", url: long, note: "n" }] }));
    assert.match(page, new RegExp(`>example\\.com/a{${60 - "example.com/".length}}…</a>`));
    assert.ok(page.includes(`href="${long}"`));
  });

  test("a non-http(s) signal url is plain muted text, never a link", () => {
    const page = ideaHtml(stored({ signals: [{ kind: "repo", url: "javascript:alert(1)", note: "n" }] }));
    assert.doesNotMatch(page, /href="javascript|target="_blank"[^>]*>javascript/);
    assert.match(page, /<span class="mono muted">javascript:alert\(1\)<\/span>/);
    assert.equal((page.match(/target="_blank"/g) ?? []).length, 1 /* the owner/name repo only */);
  });

  test("owner/name repos link to github.com; anything else is plain text", () => {
    const page = ideaHtml(
      stored({ related_repos: ["owner/name", "../x", "a/..", "./b", "a/b/c", "<s>/x", "o/r.js-x_1"] }),
    );
    assert.match(
      page,
      /<a href="https:\/\/github\.com\/owner\/name" rel="noopener noreferrer nofollow" target="_blank">owner\/name<\/a>/,
    );
    assert.match(page, /href="https:\/\/github\.com\/o\/r\.js-x_1"/);
    assert.equal((page.match(/github\.com\/[^"]*"/g) ?? []).filter((m) => !m.includes("o/r")).length, 1);
    for (const bad of ["../x", "a/..", "./b", "a/b/c"]) assert.ok(page.includes(`> ${bad} <`), bad);
    assert.match(page, /&lt;s&gt;\/x/);
    assert.doesNotMatch(page, /<s>/);
  });

  test("no why_now means no highlighted card; empty signals and repos still render", () => {
    const bare = stored({ signals: [], related_repos: [] }) as Partial<StoredIdea>;
    delete bare.why_now;
    const page = ideaHtml(bare as StoredIdea);
    assert.doesNotMatch(page, /card-hl|Why now/);
    assert.match(page, /Signals \(0\)/);
    assert.match(page, /No signals\./);
  });
});

describe("login, message and every page (T039 AC8, AC9)", () => {
  test("the login token field is focused with a hint; the error stays an alert", () => {
    const page = loginHtml("Wrong token");
    assert.match(page, /<input[^>]*id="token"[^>]*autofocus/);
    assert.match(page, /aria-describedby="token-hint"/);
    assert.match(page, /id="token-hint"/);
    assert.match(page, /<p class="notice notice-error" role="alert">Wrong token<\/p>/);
  });

  test("every page has a skip link to <main id=main>, one style element, no script and no style attribute", () => {
    const pages = [loginHtml(), messageHtml("T", "m", true), listHtml(view()), ideaHtml(stored())];
    for (const page of pages) {
      assert.match(page, /<a class="skip" href="#main">/);
      assert.match(page, /<main id="main">/);
      assert.equal((page.match(/<style>/g) ?? []).length, 1);
      assert.doesNotMatch(page, /<script|\sstyle=/i);
    }
  });
});
