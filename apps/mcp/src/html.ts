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
.bar{display:flex;align-items:center;justify-content:space-between;gap:var(--space-3);min-height:56px;padding:0 var(--space-4);border-bottom:1px solid var(--line-header)}
.bar form{margin:0}
.brand{font:600 15px var(--font-mono);color:var(--text-strong);text-decoration:none}
main{max-width:var(--content-max);margin:0 auto;padding:var(--space-6) var(--space-4) var(--space-9)}
.eyebrow{margin:0 0 var(--space-2);font:500 12px var(--font-mono);color:var(--neon);text-shadow:var(--glow-text)}
h1{margin:0 0 var(--space-5);font-size:28px;line-height:1.2;letter-spacing:-.01em;font-weight:600;color:var(--text-strong)}
h2{margin:0 0 var(--space-2);font-size:15px;line-height:1.4;font-weight:600;color:var(--text-strong)}
h3{margin:var(--space-6) 0 var(--space-2);font:500 12px var(--font-mono);color:var(--text-muted)}
p{margin:0 0 var(--space-3)}
.card{border:1px solid var(--line);border-radius:var(--radius-sm);padding:var(--space-4) var(--space-5);margin:0 0 var(--space-3)}
.narrow{max-width:420px;margin:var(--space-8) auto}
.muted{color:var(--text-muted)}
.mono{font-family:var(--font-mono);font-size:12px}
.lede{color:var(--text-2)}
label{display:block;margin:0 0 var(--space-1);font:500 12px var(--font-mono);color:var(--text-muted)}
input{width:100%;min-height:36px;padding:0 var(--space-3);font:inherit;color:var(--text);background:var(--bg-sunken);border:1px solid var(--line-strong);border-radius:var(--radius-sm)}
.btn{display:inline-flex;align-items:center;justify-content:center;min-height:36px;padding:0 var(--space-4);font:inherit;color:var(--text);background:transparent;border:1px solid var(--line-strong);border-radius:var(--radius-sm);cursor:pointer;text-decoration:none}
.btn:hover{background:var(--bg-raised);color:var(--text-strong)}
.btn-primary{font-weight:600;color:var(--on-neon);background:var(--neon);border-color:var(--neon);box-shadow:var(--glow-box)}
.btn-primary:hover{color:var(--on-neon);background:var(--neon)}
.notice{margin:0 0 var(--space-4);padding:var(--space-3) var(--space-4);border:1px solid var(--line-strong);border-radius:var(--radius-sm);background:var(--bg-sunken)}
.notice-error{color:var(--danger);border-color:var(--danger)}
.notice-warn{color:var(--warn);border-color:var(--warn-line)}
.field{margin:0 0 var(--space-4)}
.filters{display:grid;gap:0 var(--space-3);grid-template-columns:1fr 1fr}
.filters .wide,.filters .tag{grid-column:1/-1}
.filters .field{margin:0 0 var(--space-3)}
.actions{display:flex;gap:var(--space-3)}
@media (min-width:720px){
  .filters{grid-template-columns:repeat(3,1fr)}
  .filters .tag{grid-column:auto}
}
.ideas{list-style:none;margin:0;padding:0}
.meta{display:flex;flex-wrap:wrap;align-items:center;gap:var(--space-2);margin-top:var(--space-3)}
.chip{display:inline-block;padding:0 var(--space-2);font:12px/20px var(--font-mono);color:var(--text-2);text-decoration:none;border:1px solid var(--line-strong);border-radius:var(--radius-xs)}
.chip:hover{color:var(--text-strong);background:var(--bg-raised)}
.meta+p{margin-top:var(--space-3)}
.back{display:inline-block;margin:0 0 var(--space-4)}
.signals{list-style:none;margin:0;padding:0}
.signals li{padding:var(--space-3) 0;border-bottom:1px solid var(--line-subtle)}
.signals li:last-child{border-bottom:0}
@media (max-width:719px){
  main{padding-top:var(--space-5)}
  body{font-size:16px}
  input,.btn{min-height:44px}
  .brand,.back,h2 a,.signals a,.chip{display:inline-flex;align-items:center;min-height:44px}
  h2 a{display:flex}
  .chip{justify-content:center;min-width:44px;padding:0 var(--space-3)}
}
`;

const CSS = `${TOKENS_CSS}${PAGE_CSS}`;

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
          <style>
            ${raw(CSS)}
          </style>
        </head>
        <body>
          <header class="bar">
            <a class="brand" href="/">idea-radar</a>
            ${signedIn ? html`<form method="post" action="/logout"><button class="btn" type="submit">Log out</button></form>` : ""}
          </header>
          <main>${body}</main>
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
          <input id="token" name="token" type="password" autocomplete="current-password" required />
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
      <p><a href="/">Back to the list</a></p>`,
    signedIn,
  );
}

const chip = (tag: string) => html`<a class="chip" href="/?tag=${encodeURIComponent(tag)}">${tag}</a>`;

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

function filterForm(v: ListView) {
  const active = v.q !== "" || v.tag !== "" || v.since !== "" || v.until !== "";
  return html`<form class="filters card" method="get" action="/">
    <div class="field wide">
      <label for="q">search</label>
      <input id="q" name="q" type="search" maxlength="200" value="${v.q}" />
    </div>
    <div class="field tag">
      <label for="tag">tag</label>
      <input id="tag" name="tag" type="text" maxlength="100" value="${v.tag}" />
    </div>
    <div class="field">
      <label for="since">since</label>
      <input
        id="since"
        name="since"
        type="text"
        inputmode="numeric"
        placeholder="YYYY-MM-DD"
        maxlength="10"
        value="${v.since}"
      />
    </div>
    <div class="field">
      <label for="until">until</label>
      <input
        id="until"
        name="until"
        type="text"
        inputmode="numeric"
        placeholder="YYYY-MM-DD"
        maxlength="10"
        value="${v.until}"
      />
    </div>
    <div class="actions wide">
      <button class="btn btn-primary" type="submit">Apply</button>
      ${active ? html`<a class="btn" href="/">Reset</a>` : ""}
    </div>
  </form>`;
}

export function listPage(v: ListView): string {
  const filtered = v.q !== "" || v.tag !== "" || v.since !== "" || v.until !== "";
  const n = v.ideas.length;
  return layout(
    "Ideas",
    html`<p class="eyebrow">&gt; newest ideas</p>
      <h1>Ideas</h1>
      ${v.notices.map((m) => html`<p class="notice notice-warn" role="alert">${m}</p>`)} ${filterForm(v)}
      ${
        n === 0
          ? html`<p class="notice">${filtered ? "No ideas match." : "No ideas yet."}</p>`
          : html`<p class="mono muted">
                ${n}
                ${n === 1 ? "idea" : "ideas"}${n >= v.limit ? `, the newest ${v.limit}: use the filters or search to find others` : ""}
              </p>
              <ul class="ideas">
                ${v.ideas.map(
                  (i) =>
                    html`<li class="card">
                      <h2><a href="/ideas/${encodeURIComponent(i.id)}">${i.title}</a></h2>
                      <p>${i.summary}</p>
                      <div class="meta">
                        ${i.tags.map(chip)}<span class="mono muted">last seen ${i.last_seen}</span>
                      </div>
                    </li>`,
                )}
              </ul>`
      }`,
    true,
  );
}

function signalItem(s: StoredIdea["signals"][number]) {
  const href = safeHttpUrl(s.url);
  return html`<li>
    <span class="mono muted">${s.kind}</span>
    <p>${s.note}</p>
    ${
      href === undefined
        ? html`<span class="mono muted">${s.url}</span>`
        : html`<a href="${href}" rel="noopener noreferrer nofollow" target="_blank">${s.url}</a>`
    }
  </li>`;
}

export function ideaPage(idea: StoredIdea): string {
  return layout(
    idea.title,
    html`<a class="back" href="/">&larr; All ideas</a>
      <h1>${idea.title}</h1>
      <p class="lede">${idea.summary}</p>
      <div class="meta">${idea.tags.map(chip)}</div>
      <p class="mono muted">first seen ${idea.first_seen} &middot; last seen ${idea.last_seen}</p>
      ${
        idea.why_now === undefined
          ? ""
          : html`<h3>why now</h3>
              <p>${idea.why_now}</p>`
      }
      <h3>signals</h3>
      ${
        idea.signals.length === 0
          ? html`<p class="muted">No signals.</p>`
          : html`<ul class="signals">
              ${idea.signals.map(signalItem)}
            </ul>`
      }
      <h3>related repos</h3>
      ${
        idea.related_repos.length === 0
          ? html`<p class="muted">None.</p>`
          : html`<ul class="signals">
              ${idea.related_repos.map((r) => html`<li class="mono">${r}</li>`)}
            </ul>`
      }`,
    true,
  );
}
