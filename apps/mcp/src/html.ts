import { createHash } from "node:crypto";
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
.ideas{list-style:none;margin:0;padding:0}
.meta{display:flex;flex-wrap:wrap;align-items:center;gap:var(--space-2);margin-top:var(--space-3)}
.chip{display:inline-block;padding:0 var(--space-2);font:12px/20px var(--font-mono);color:var(--text-2);text-decoration:none;border:1px solid var(--line-strong);border-radius:var(--radius-xs)}
.chip:hover{color:var(--text-strong);background:var(--bg-raised)}
.back{display:inline-block;margin:0 0 var(--space-4)}
.signals{list-style:none;margin:0;padding:0}
.signals li{padding:var(--space-3) 0;border-bottom:1px solid var(--line-subtle)}
.signals li:last-child{border-bottom:0}
@media (max-width:719px){
  main{padding-top:var(--space-5)}
  input,.btn{min-height:44px}
  .chip{line-height:28px}
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

export function listPage(ideas: IdeaSummary[]): string {
  return layout(
    "Ideas",
    html`<p class="eyebrow">&gt; newest ideas</p>
      <h1>Ideas</h1>
      ${
        ideas.length === 0
          ? html`<p class="notice">No ideas yet.</p>`
          : html`<ul class="ideas">
              ${ideas.map(
                (i) =>
                  html`<li class="card">
                    <h2><a href="/ideas/${encodeURIComponent(i.id)}">${i.title}</a></h2>
                    <p>${i.summary}</p>
                    <div class="meta">${i.tags.map(chip)}<span class="mono muted">last seen ${i.last_seen}</span></div>
                  </li>`,
              )}
            </ul>`
      }`,
    true,
  );
}
