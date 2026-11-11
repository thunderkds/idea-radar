# TASK_REVIEW — T035: Token-gated dashboard pages in apps/mcp

> Sibling of `tasks/TASK_GUIDE_T035.md`. Everything here is **filled by the reviewer at Stage
> 4/5** — it is deliberately NOT in the guide, because the implementing agent re-reads the guide on
> every turn and never fills these two sections.
>
> Consumers resolve each section **guide first, this file second** (`.claude/hooks/lib/guide_sections.py`):
> a legacy guide that still carries these sections inline keeps working unchanged, and a stray
> review file can never override an inline section.

---

<!-- Optional: the final report, only for a task run in auto mode (the user's `[auto]` or `[admin]` tag; with `[admin]`, the `Not done:` line names `merge (admin: after the auto verify pass)`,
`docs/claude-md/tracks.md` `## Auto mode`). To use it, copy the block below out of this comment, to this
place, and replace every <...>. Keep `Mode: auto` as its first line, exactly as written: T182's hook reads
it. Write it to this file before the run ends; the chat message is a copy, not the report. The same
block is the Supervisor's final chat message. It is not the `delivery-report` page and not
Evidence. A taste decision (what the user wants) also ends with the flag. Write `DEBATED` only when ≥2
Advocate `Agent` calls ran for that question, naming each Advocate's option. A decision with no Advocates is
labelled `RULE`, `FACT` or `SAFER OPTION`, never `DEBATED`. A decision flagged `⚠ decided for you` is a choice, and is never labelled `FACT`. A
safety action a rule requires (for example the backup before a delete) is `RULE` without the flag.
At Risk Medium or High, a `RULE:` counts only when it names a written rule (`path:line`,
`path § <heading>`, or `docs/claude-md/tracks.md` `### <section>`), and a `FACT:` needs a Citation
(`path:line "quoted text"`); without one it is a choice and must be `DEBATED`. Good: `2. backed up the CSV
— RULE: `docs/claude-md/tracks.md` `### Stops that stay``. Bad: `1. kept recurring.csv — RULE: Surgical Changes`.
`Memory:` records the diff-driven memory pass you run before you stop: each entry written, or `nothing new`.
After an auto verify pass the hook, never you, adds `Closed: row moved to Done <date> — …` and moves the row,
or adds `Paused: done not moved — <reason>`. It moves the row only when this block holds `Mode: auto`, a
numbered decision, `Checks:`, `Memory:`, the `Not done:` auto verify slot with its result, and `Not done:`
naming the merge — no `<...>` left (`docs/claude-md/tracks.md` `### Auto close-out`).

## Auto decisions

Mode: auto
1. <what was decided> — RULE: <the rule>
2. <what was decided> — FACT: <path>:<line> "<quoted text>"
3. <what was decided> — DEBATED: <option> (Advocate 1: <its proposal>; Advocate 2: <its proposal>) ⚠ decided for you — please review
4. <what was decided> — SAFER OPTION: <why> ⚠ decided for you — please review
Paused: <only when a stop that stays paused the task: which one, and why>
Checks: tests `<command>` — <result>; reviews <skill — result>; real run `<command>` — printed `<what it printed>` (auto-checked, not /verify)
Memory: <each entry the memory pass wrote, as `file — entry` | nothing new>
Not done: merge (yours); <auto verify: running (T182) | auto verify: <result> | /verify (yours)>

-->

## Evidence

| Check | Result | Notes / output snippet |
|-------|--------|------------------------|
| **New test(s) cover Acceptance Criteria (file paths pasted)** | ☑ pass | New: `apps/mcp/src/dashboard.test.ts` (33 tests: AC1 login/cookie flags, AC2 HMAC/expiry/tamper/rotation/logout, AC3 list/filters/search, AC4 idea page and safe links, AC5 escaping, AC6 CSRF 403s, AC7 CSP hash + no raw colours + no external loads, `/mcp` never accepts the cookie), `apps/mcp/src/html.test.ts` (3), `apps/mcp/src/session.test.ts` (6), `apps/mcp/src/tokens-css.test.ts` (1, drift vs `docs/design-system/project/tokens.json`). Changed: `apps/mcp/src/server.test.ts` (pin test "unknown paths are 404" repointed: `/` is now 303 to `/login`; 2 new DB-backed tests incl. AC8, 10,000 ideas, each page < 1 s). |
| Verification command run | ☑ pass | Supervisor re-ran on branch `t035-dashboard-pages` at `f5970b3` (loopback PGlite `:55432`, `TEST_DATABASE_URL=postgres://postgres:pg@localhost:55432/postgres`): `pnpm test` exit 0 — packages/ideas 25/25, packages/db 23/23, apps/mcp **88/88** (was 86 before the review fixes), scripts 5/5, **141/141, 0 skipped**; `pnpm lint` exit 0; `pnpm typecheck` exit 0; `pnpm format:check` exit 0. |
| Negative cases hold | ☑ pass | Red runs (implementing agent, reported): `dashboard.test.ts` 14 of 16 failing before `dashboard.ts` existed; CSP-hash test `pass 31 / fail 1` before `ee00607`; Referrer-Policy test `pass 32 / fail 1` before `f5970b3`. Supervisor script on the pre-fix `32436b0` render: CSP hash `match=false` on login, list and message pages; after the fix `match=true` on all three. Supervisor mutations (each `git diff --stat` non-empty, file restored after, `git diff` empty): `session.ts` expiry check replaced by `return true` → `session.test.ts` + `dashboard.test.ts` pass 37 / **fail 2** (baseline 39/0); `dashboard.ts` `isSameOrigin` returns true → pass 38 / **fail 1**; `html.ts` `safeHttpUrl` allows any scheme → pass 38 / **fail 1**. Gap: `session.test.ts` and `html.test.ts` were written before their modules but never run red by the agent; the mutations above cover the security-critical lines. |
| verify | ☐ pass / ☐ fail / ☐ N/A | [what was observed — must literally state "pass" or "fail" here too, e.g. "skill run, feature confirmed working — pass": the merge gate scans this Notes column for the word "pass", not just the Result column] |
| Review scope bounded to the change's blast radius (affected set, not whole repo) | ☑ pass | Reviewed `git diff main...HEAD -- apps/mcp/src`: new `dashboard.ts`, `session.ts`, `html.ts`, `tokens-css.ts`, edited `server.ts` (route order: `/health`, `/mcp`, then dashboard), their tests, plus the called context `index-store.ts`, `packages/db/src/queries.ts`, `auth.ts`. Skipped: T033/T034 code already merged and reviewed, `packages/db/**` (guide: must not touch, `git diff` empty there), docs (T036 owns). code-review: no P0; two P1 fixed (CSP style hash, invalid UX evidence) and one login bug (`Origin: null`) found by the live re-check and fixed; P2×1, P3×2 open/accepted. security-review: no findings, 0 High/Med/Low. Reports: `reports/code-review_t035-dashboard-pages_20261111T103753.html`, `reports/security-review_t035-dashboard-pages_20261111T103753.html`. |
| Full smoke suite still green (no regression) | ☑ pass | Same run as above: 141/141, 0 skipped; `/mcp` and `/health` tests unchanged and green. |
| **Companion score (easy-verifier)** | ☑ N/A | easy-verifier and easy-ui failed to connect in this session (CONNECT_TIMEOUT), so no score was run. |
| **UI: Visual regression (diff or verdict pasted)** | ☑ pass | `ux-evaluate` verdict through the LIVE server in headless Chrome at 375px and 1280px (CSP header applied; wrong-token and right-token logins done by real form submits): 13 pass, 0 fail, 0 not checked (4 story rows + baseline B-a..B-i). First round used saved-HTML screenshots, which cannot show CSP effects; that evidence was discarded after review P1 and redone live (images under the scratchpad `live/`, not committed). Limits: B-d (tap targets) carries the earlier 0-under-44px probe, CSS unchanged since; no hover/focus screenshots; four images not opened by the agent (login plain, nomatch-375, notfound-1280, idea-xss-375) rest on computed-style numbers. |
| **UI: Design-system compliance (tokens/colors/typography verified)** | ☑ pass | `tokens-css.test.ts` fails if the generated `:root` block drifts from `tokens.json`; `dashboard.test.ts` asserts no raw hex/rgb/hsl colour outside that block and no external fonts, scripts, links, images or `url()`. Live Chrome: computed `body` background `rgb(18, 20, 19)` (= `#121413`) on all 18 page/width combinations; font stack is the token stack (system fallbacks, no font network calls); `--neon` only on the eyebrow and the primary button. |
| **UI: Responsiveness at target viewports** | ☑ pass | 375px and 1280px, live Chrome: `scrollWidth == clientWidth` on every page at 375 (one column, 95-character unbroken title wraps inside its card); at 1280 two taller pages show `scrollWidth` 1265, which is the vertical scrollbar, not horizontal overflow. Tap probe at 375: 0 targets under 44px on list, idea, login and not-found. |

---

## Demonstration

> Anchors what this task delivered to an observable before/after pair. BEFORE has no `N/A` path:
> if the task changes executable code, BEFORE is a pasted, timestamped terminal capture taken
> **before any implementation commit exists**; if it does not (docs, templates, skill-instruction
> text), BEFORE is the **verbatim prior content** of what changed — a quoted excerpt, not a command.

**BEFORE**: captured 2026-11-11T03:09:56Z at base `43e046d` (main `84d0d5b` + the board commit), no T035 implementation commit yet. Server from `apps/mcp` (`tsx --conditions=source src/index.ts`, port 18035) on a throwaway in-memory PGlite (`127.0.0.1:55432`), run by the Supervisor:

```
migrations applied: 1
listening on port 18035
$ curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:18035/login -> 404
$ curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:18035/ -> 404
$ curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:18035/ideas/abc -> 404
$ curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:18035/health -> 200
$ curl -s http://127.0.0.1:18035/health -> {"ok":true}
```

The service has no login page, idea list or idea page; only `/mcp` and `/health` exist.

**AFTER**: captured 2026-11-11T03:20:27Z by the implementing agent on branch `t035-dashboard-pages` (working tree after the T035 implementation commits). Same server start as BEFORE (`apps/mcp`, `tsx --conditions=source src/index.ts`, port 18036, throwaway in-memory PGlite `127.0.0.1:55432`, 3 demo ideas submitted through `submit_ideas`). `<hmac>` replaces the cookie signature:

```
$ curl http://127.0.0.1:18036/login -> 200
$ curl http://127.0.0.1:18036/ -> 303
$ curl http://127.0.0.1:18036/ideas/abc -> 303
$ curl http://127.0.0.1:18036/health -> 200
$ curl -X POST -d token=<wrong> /login -> 401
$ curl -X POST -H 'Origin: https://evil.example' -d token=<right> /login -> 403
HTTP/1.1 303 See Other
location: /
set-cookie: ir_session=1794972027.<hmac>; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800
$ curl -b cookie / -> 200  titles: Averyvery...|Markdown notes that sync through git|&lt;script&gt;alert(1)&lt;/script&gt; probe &amp; &quot;quotes&quot;|
$ curl -b cookie '/?q=markdown' -> Markdown notes that sync through git
$ curl -b cookie /ideas/markdown-notes -> 200; signal links: 2
$ curl -b cookie POST /mcp -> 401
```

**DELTA**: A reader who holds the dashboard token can now log in at `/login`, browse the newest ideas at `/`, filter by tag and date, search, and open an idea with its signals as safe links at `/ideas/:id`, where before every one of these paths was a 404.

**WITNESS**: [who ran it and when — derived from `memory/event-trace/Txxx.jsonl`, never the
implementing agent alone]
