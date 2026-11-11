import { createHash } from "node:crypto";
import type { StoredIdea } from "@idea-radar/db";
import type { IdeaSummary } from "./index-store.js";
import { TOKENS_CSS } from "./tokens-css.js";

/** A string that is already safe HTML. Only `html` and `raw` make one; nothing else is trusted. */
class Safe {
  constructor(readonly value: string) {}
  toString(): string {
    return this.value;
  }
}

const ENTITIES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escape(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ENTITIES[c]!);
}

/** Mark text as safe HTML. Use only for markup this file wrote, never for idea text. */
export function raw(markup: string): Safe {
  return new Safe(markup);
}

type Part = Safe | string | number | null | undefined | Part[];

function render(part: Part): string {
  if (part === null || part === undefined) return "";
  if (part instanceof Safe) return part.value;
  if (Array.isArray(part)) return part.map(render).join("");
  return escape(String(part));
}

/** Tagged template: every `${}` is HTML-escaped unless it is a `Safe` (the result of `html` or `raw`) or an array of them. */
export function html(strings: TemplateStringsArray, ...parts: Part[]): Safe {
  return new Safe(strings.reduce((out, s, i) => out + s + (i < parts.length ? render(parts[i]!) : ""), ""));
}

export type { Safe };

/** The parsed URL when it is absolute http or https, else undefined (javascript:, data:, relative, malformed). */
export function safeHttpUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

// ---- Pages. Every value below goes through `html`, so idea text and query text are escaped by construction. ----

/** Page styles: only `var(--token)` colours; the token block comes from tokens.json. No fonts, images or scripts are loaded. */
const PAGE_CSS = `
*{box-sizing:border-box}
html{color-scheme:dark}
body{margin:0;background:var(--bg);color:var(--text);font:15px/1.55 var(--font-sans);overflow-wrap:anywhere}
a{color:var(--accent)}
a:hover{color:var(--accent-hover)}
:focus-visible{outline:2px solid var(--neon);outline-offset:2px}
.skip{position:absolute;display:inline-flex;align-items:center;min-height:44px;top:var(--space-2);left:var(--space-4);z-index:2;padding:var(--space-2) var(--space-4);color:var(--text-strong);background:var(--bg-sunken);border:1px solid var(--line-strong);border-radius:var(--radius-sm);transform:translateY(-200%)}
.skip:focus{transform:none}
.vh{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);border:0}
.bar{display:flex;align-items:center;justify-content:space-between;gap:var(--space-3);min-height:56px;padding:0 var(--space-4);border-bottom:1px solid var(--line-header)}
.bar form{margin:0}
.brand{font:600 15px var(--font-mono);color:var(--text-strong);text-decoration:none}
main{max-width:var(--content-max);margin:0 auto;padding:var(--space-6) var(--space-4) var(--space-9)}
.eyebrow{margin:0 0 var(--space-2);font:500 12px var(--font-mono);color:var(--neon);text-shadow:var(--glow-text)}
h1{margin:0 0 var(--space-5);font-size:28px;line-height:1.2;letter-spacing:-.01em;font-weight:600;color:var(--text-strong)}
h2{margin:var(--space-7) 0 var(--space-3);font-size:17px;line-height:1.3;font-weight:600;color:var(--text-strong)}
h3{margin:0 0 var(--space-2);font-size:15px;line-height:1.4;font-weight:600;color:var(--text-strong)}
p{margin:0 0 var(--space-3)}
.card{position:relative;border:1px solid var(--line);border-radius:var(--radius-sm);padding:var(--space-4) var(--space-5);margin:0 0 var(--space-3)}
.card-hl{border-color:var(--neon-line);box-shadow:var(--glow-box)}
.card-hl h2{margin-top:0}
.card-hl p:last-child{margin-bottom:0}
.narrow{max-width:420px;margin:var(--space-8) auto}
.muted{color:var(--text-muted)}
.mono{font-family:var(--font-mono);font-size:12px}
.lede{color:var(--text-2)}
.count{font:500 13px var(--font-mono);color:var(--text-muted)}
label{display:block;margin:0 0 var(--space-1);font:500 12px var(--font-mono);color:var(--text-muted)}
input{width:100%;min-width:0;min-height:36px;padding:0 var(--space-3);font:inherit;color:var(--text);background:var(--bg-sunken);border:1px solid var(--line-strong);border-radius:var(--radius-sm)}
input::placeholder{color:var(--text-muted)}
.btn{display:inline-flex;align-items:center;justify-content:center;min-height:36px;padding:0 var(--space-4);font:inherit;color:var(--text);background:transparent;border:1px solid var(--line-strong);border-radius:var(--radius-sm);cursor:pointer;text-decoration:none}
.btn:hover{background:var(--bg-raised);color:var(--text-strong)}
.btn-primary{font-weight:600;color:var(--on-neon);background:var(--neon);border-color:var(--neon);box-shadow:var(--glow-box)}
.btn-primary:hover{color:var(--on-neon);background:var(--neon)}
.notice{margin:0 0 var(--space-4);padding:var(--space-3) var(--space-4);border:1px solid var(--line-strong);border-radius:var(--radius-sm);background:var(--bg-sunken)}
.notice-error{color:var(--danger);border-color:var(--danger)}
.notice-warn{color:var(--warn);border-color:var(--warn-line)}
.field{margin:0 0 var(--space-4)}
.hint{margin:var(--space-1) 0 0;font-size:13px}
.toolbar{margin:0 0 var(--space-4)}
.search{display:flex;gap:var(--space-2)}
.search input{flex:1}
details{margin-top:var(--space-2)}
summary{display:inline-flex;align-items:center;gap:var(--space-2);min-height:36px;padding:0 var(--space-3);font:500 13px var(--font-mono);color:var(--text-2);border:1px solid var(--line-strong);border-radius:var(--radius-sm);cursor:pointer;list-style:none}
summary::-webkit-details-marker{display:none}
summary::after{content:"+"}
details[open]>summary::after{content:"-"}
summary:hover{color:var(--text-strong);background:var(--bg-raised)}
.filters{display:grid;gap:0 var(--space-3);grid-template-columns:repeat(2,minmax(0,1fr));margin-top:var(--space-3);padding:var(--space-4);border:1px solid var(--line);border-radius:var(--radius-sm)}
.filters .tag,.filters .actions{grid-column:1/-1}
.filters .field{margin:0 0 var(--space-3)}
.filters .actions{margin:0}
@media (min-width:720px){
  .filters{grid-template-columns:repeat(3,minmax(0,1fr))}
  .filters .tag{grid-column:auto}
}
.active{display:flex;flex-wrap:wrap;align-items:center;gap:var(--space-2);margin:0 0 var(--space-4)}
.chip-x::after{content:"\\00d7";margin-left:var(--space-2)}
.reset{border-color:transparent;text-decoration:underline}
.ideas{list-style:none;margin:0;padding:0}
.bucket h2{margin:var(--space-6) 0 var(--space-3);font:600 14px var(--font-mono);color:var(--text-strong)}
.bucket h2 .count{margin-left:var(--space-1)}
.idea:hover{background:var(--bg-raised);border-color:var(--line-strong)}
.idea h3 a{color:var(--text-strong);text-decoration:none}
.idea h3 a::after{content:"";position:absolute;inset:0;border-radius:var(--radius-sm)}
.idea:hover h3 a{color:var(--accent)}
.idea h3 a:focus-visible{outline:0}
.idea h3 a:focus-visible::after{outline:2px solid var(--neon);outline-offset:2px}
.clamp{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;line-clamp:2;overflow:hidden;margin:0;color:var(--text-2)}
.meta{display:flex;flex-wrap:wrap;align-items:center;gap:var(--space-2);margin-top:var(--space-3)}
.meta .when{margin-left:auto}
.chip{position:relative;z-index:1;display:inline-block;padding:0 var(--space-2);font:12px/20px var(--font-mono);color:var(--text-2);text-decoration:none;border:1px solid var(--line-strong);border-radius:var(--radius-xs)}
.chip:hover{color:var(--text-strong);background:var(--bg-raised)}
.back{display:inline-block;margin:0 0 var(--space-4)}
.stamp{margin:var(--space-3) 0 var(--space-6)}
.signals{list-style:none;margin:0;padding:0}
.signals li{padding:var(--space-3) 0;border-bottom:1px solid var(--line-subtle)}
.signals li:last-child{border-bottom:0}
.signals p{margin:var(--space-1) 0}
@media (max-width:719px){
  main{padding-top:var(--space-5)}
  body{font-size:16px}
  input,.btn,summary{min-height:44px}
  .brand,.back,.signals a,.chip{display:inline-flex;align-items:center;min-height:44px}
  .chip{justify-content:center;min-width:44px;padding:0 var(--space-3)}
  .idea{padding-top:0}
  .idea h3 a{display:flex;align-items:center;min-height:44px;padding:var(--space-2) 0}
}
`;

const CSS = `${TOKENS_CSS}${PAGE_CSS}`;

/** Built outside the `html` tag on purpose: a CSP hash covers the element text exactly, and Prettier reformats whitespace inside `html` templates. */
const STYLE_TAG = `<style>${CSS}</style>`;

/** Sent with every page: the one inline `<style>` is allowed by its hash, and nothing else may load. */
export const PAGE_CSP = [
  "default-src 'none'",
  `style-src 'sha256-${createHash("sha256").update(CSS).digest("base64")}'`,
  "form-action 'self'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join("; ");

function layout(title: string, body: Safe, signedIn: boolean): string {
  return String(
    html`<!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <meta name="robots" content="noindex" />
          <title>${title} - idea-radar</title>
          ${raw(STYLE_TAG)}
        </head>
        <body>
          <a class="skip" href="#main">Skip to content</a>
          <header class="bar">
            <a class="brand" href="/">idea-radar</a>
            ${signedIn ? html`<form method="post" action="/logout"><button class="btn" type="submit">Log out</button></form>` : ""}
          </header>
          <main id="main">${body}</main>
        </body>
      </html> `,
  );
}

export function loginPage(error?: string): string {
  return layout(
    "Log in",
    html`<div class="narrow">
      <p class="eyebrow">&gt; idea radar</p>
      <h1>Log in</h1>
      ${error === undefined ? "" : html`<p class="notice notice-error" role="alert">${error}</p>`}
      <form method="post" action="/login">
        <div class="field">
          <label for="token">dashboard token</label>
          <input
            id="token"
            name="token"
            type="password"
            autocomplete="current-password"
            aria-describedby="token-hint"
            required
            autofocus
          />
          <p class="hint muted" id="token-hint">The dashboard token, set as DASHBOARD_TOKEN on the server.</p>
        </div>
        <button class="btn btn-primary" type="submit">Log in</button>
      </form>
    </div>`,
    false,
  );
}

export function messagePage(title: string, message: string, signedIn: boolean): string {
  return layout(
    title,
    html`<h1>${title}</h1>
      <p class="lede">${message}</p>
      <p><a class="btn" href="/">Back to the list</a></p>`,
    signedIn,
  );
}

const chip = (tag: string) => html`<a class="chip" href="/?tag=${encodeURIComponent(tag)}">${tag}</a>`;

/** The section an idea is listed under: its first tag when that is a known bucket, else `other`. */
const BUCKETS = ["rising", "medium", "low-key"] as const;
const bucketOf = (tags: string[]): string => BUCKETS.find((b) => b === tags[0]) ?? "other";

/** A card shows at most this many tag chips; the rest is a `+N` count. */
const CARD_CHIPS = 3;

export interface ListView {
  ideas: IdeaSummary[];
  /** The filter values as typed, already cut to a sane length; shown back in the form. */
  q: string;
  tag: string;
  since: string;
  until: string;
  notices: string[];
  /** The page holds only this many ideas; say so when it is full. */
  limit: number;
}

type FilterKey = "q" | "tag" | "since" | "until";
const FILTER_LABEL: Record<FilterKey, string> = { q: "search", tag: "tag", since: "since", until: "until" };

/** The list URL with every active filter except `omit`. */
function listHref(v: ListView, omit?: FilterKey): string {
  const params = new URLSearchParams();
  for (const key of ["q", "tag", "since", "until"] as const) if (key !== omit && v[key] !== "") params.set(key, v[key]);
  const query = params.toString();
  return query === "" ? "/" : `/?${query}`;
}

function toolbar(v: ListView) {
  const narrowed = v.tag !== "" || v.since !== "" || v.until !== "";
  return html`<form class="toolbar" method="get" action="/">
    <div class="search">
      <label class="vh" for="q">search</label>
      <input id="q" name="q" type="search" maxlength="200" value="${v.q}" placeholder="Search ideas" />
      <button class="btn" type="submit">Search</button>
    </div>
    ${raw(narrowed ? "<details open>" : "<details>")}
      <summary>Filters</summary>
      <div class="filters">
        <div class="field tag">
          <label for="tag">tag</label>
          <input id="tag" name="tag" type="text" maxlength="100" value="${v.tag}" />
        </div>
        <div class="field">
          <label for="since">since</label>
          <input id="since" type="date" name="since" value="${v.since}" />
        </div>
        <div class="field">
          <label for="until">until</label>
          <input id="until" type="date" name="until" value="${v.until}" />
        </div>
        <div class="actions">
          <button class="btn btn-primary" type="submit">Apply</button>
        </div>
      </div>
    </details>
  </form>`;
}

function activeFilters(v: ListView) {
  const keys = (["q", "tag", "since", "until"] as const).filter((k) => v[k] !== "");
  if (keys.length === 0) return "";
  return html`<div class="active" role="group" aria-label="Active filters">
    ${keys.map(
      (k) =>
        html`<a class="chip chip-x" href="${listHref(v, k)}"
          ><span class="vh">remove </span>${FILTER_LABEL[k]}: ${v[k]}</a
        >`,
    )}
    <a class="chip reset" href="/">Reset</a>
  </div>`;
}

function card(i: IdeaSummary, bucket: string) {
  const shown = bucket === "other" ? i.tags : i.tags.slice(1);
  const more = shown.length - CARD_CHIPS;
  return html`<li class="card idea">
    <h3><a href="/ideas/${encodeURIComponent(i.id)}">${i.title}</a></h3>
    <p class="clamp">${i.summary}</p>
    <div class="meta">
      ${shown.slice(0, CARD_CHIPS).map(chip)}${more > 0 ? html`<span class="mono muted">+${more}</span>` : ""}
      <span class="mono muted when">last seen ${i.last_seen}</span>
    </div>
  </li>`;
}

function sections(ideas: IdeaSummary[]) {
  return [...BUCKETS, "other"].map((bucket) => {
    const group = ideas.filter((i) => bucketOf(i.tags) === bucket);
    if (group.length === 0) return "";
    return html`<section class="bucket" aria-labelledby="bucket-${bucket}">
      <h2 id="bucket-${bucket}">${bucket} <span class="count">${group.length}</span></h2>
      <ul class="ideas">
        ${group.map((i) => card(i, bucket))}
      </ul>
    </section>`;
  });
}

export function listPage(v: ListView): string {
  const filtered = v.q !== "" || v.tag !== "" || v.since !== "" || v.until !== "";
  const n = v.ideas.length;
  return layout(
    "Ideas",
    html`<p class="eyebrow">&gt; newest ideas</p>
      <h1>Ideas</h1>
      ${v.notices.map((m) => html`<p class="notice notice-warn" role="alert">${m}</p>`)} ${toolbar(v)}
      ${activeFilters(v)}
      ${
        n === 0
          ? html`<p class="notice">${filtered ? "No ideas match." : "No ideas yet."}</p>`
          : html`<p class="mono muted">
                ${n}
                ${n === 1 ? "idea" : "ideas"}${n >= v.limit ? `, the newest ${v.limit}: use the filters or search to find others` : ""}
              </p>
              ${sections(v.ideas)}`
      }`,
    true,
  );
}

const LINK_TEXT_MAX = 60;

/** `host/path` of a safe URL, cut with an ellipsis; the full URL stays in `href` and `title`. */
function linkText(href: string): string {
  const url = new URL(href);
  const text = `${url.host}${url.pathname === "/" ? "" : url.pathname}`;
  return text.length > LINK_TEXT_MAX ? `${text.slice(0, LINK_TEXT_MAX)}…` : text;
}

function signalItem(s: StoredIdea["signals"][number]) {
  const href = safeHttpUrl(s.url);
  return html`<li>
    <span class="mono muted">${s.kind}</span>
    <p>${s.note}</p>
    ${
      href === undefined
        ? html`<span class="mono muted">${s.url}</span>`
        : html`<a href="${href}" title="${href}" rel="noopener noreferrer nofollow" target="_blank"
            >${linkText(href)}</a
          >`
    }
  </li>`;
}

const REPO_SEGMENT = /^[A-Za-z0-9._-]+$/;

/** A related repo is a link only when it is `owner/name` with safe, non-dot-only segments. */
function repoItem(repo: string) {
  const [owner, name, ...rest] = repo.split("/");
  const ok =
    owner !== undefined &&
    name !== undefined &&
    rest.length === 0 &&
    [owner, name].every((p) => REPO_SEGMENT.test(p) && !/^\.+$/.test(p));
  return html`<li class="mono">
    ${
      ok
        ? html`<a href="https://github.com/${owner}/${name}" rel="noopener noreferrer nofollow" target="_blank"
            >${repo}</a
          >`
        : repo
    }
  </li>`;
}

export function ideaPage(idea: StoredIdea): string {
  const bucket = bucketOf(idea.tags);
  return layout(
    idea.title,
    html`<a class="back" href="/">&larr; All ideas</a>
      <p class="eyebrow">&gt; ${bucket === "other" ? "idea" : bucket}</p>
      <h1>${idea.title}</h1>
      <p class="lede">${idea.summary}</p>
      <div class="meta">${idea.tags.map(chip)}</div>
      <p class="mono muted stamp">first seen ${idea.first_seen} &middot; last seen ${idea.last_seen}</p>
      ${
        idea.why_now === undefined
          ? ""
          : html`<section class="card card-hl">
              <h2>Why now</h2>
              <p>${idea.why_now}</p>
            </section>`
      }
      <section>
        <h2>Signals (${idea.signals.length})</h2>
        ${
          idea.signals.length === 0
            ? html`<p class="muted">No signals.</p>`
            : html`<ul class="signals">
                ${idea.signals.map(signalItem)}
              </ul>`
        }
      </section>
      <section>
        <h2>Related repos (${idea.related_repos.length})</h2>
        ${
          idea.related_repos.length === 0
            ? html`<p class="muted">None.</p>`
            : html`<ul class="signals">
                ${idea.related_repos.map(repoItem)}
              </ul>`
        }
      </section>`,
    true,
  );
}
