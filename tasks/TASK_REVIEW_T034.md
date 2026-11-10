# TASK_REVIEW — T034: MCP submit_ideas write tool + read tools on Postgres

> Sibling of `tasks/TASK_GUIDE_T034.md`. Everything here is **filled by the reviewer at Stage
> 4/5** — it is deliberately NOT in the guide, because the implementing agent re-reads the guide on
> every turn and never fills these two sections.
>
> Consumers resolve each section **guide first, this file second** (`.claude/hooks/lib/guide_sections.py`):
> a legacy guide that still carries these sections inline keeps working unchanged, and a stray
> review file can never override an inline section.

---

## Auto decisions

Mode: auto
1. The unauthenticated `/health` returns only `{ok}`, with no counts and no token-gated variant, which amends acceptance criterion 5 — DEBATED: `{ok}` only (Advocate 1: `{ok}` publicly with the counts behind a bearer token on the same route; Advocate 2: `{ok}` publicly with the counts behind a bearer token; Advocate 3: `{ok}` only after a trivial DB ping, a details route as a later task) ⚠ decided for you — please review. The smaller undoable change won; see `reports/question_T034_20261110T225751.html`.
2. The implementation and its `/health` change were done by the backend-developer agent, not by the Supervisor — RULE: `CLAUDE.md:205` "The Supervisor must never write implementation code directly"
3. The two P2 findings (stale `.env.example`, no connect timeout in `packages/db`) were left unfixed and recorded as suggestions — RULE: `.claude/skills/code-review/SKILL.md:148` "Present P2/P3 fixes as suggestions only."
4. `/verify` was left to the auto verify step because the skill is user-only — RULE: `docs/claude-md/tracks.md` `### Auto close-out`
5. The Companion score row is N/A because the easy-verifier connection timed out — RULE: `templates/TASK_REVIEW_template.md:56` "the merge gate blocks on ☑ fail only, never on an absent or N/A row"
Checks: tests `TEST_DATABASE_URL=postgres://postgres:pg@localhost:55432/postgres pnpm test` — 96 pass, 0 fail (ideas 25, db 23, mcp 43, scripts 5); lint `pnpm lint` exit 0; typecheck `pnpm typecheck` exit 0; reviews code-review — no P0/P1 (P2 x2, P3 x2), security-review — no findings; real run curl `submit_ideas` then `list_ideas` against the app on :8099 with a live local PGlite — printed `{"saved":1,"date":"2026-11-10"}` then a `real-run-idea` list entry (auto-checked, not /verify)
Memory: decisions.md — `/health` is {ok} only (T034); learnings.md — MCP write tool gotchas (T034); MEMORY.md — 2 index lines
Not done: merge (admin: after the auto verify pass); auto verify: running (T182)
Note for the user: `.env.example` is not updated (a permission rule blocks reading and editing it for the agents and the Supervisor): add `DATABASE_URL`, `MCP_WRITE_TOKEN` and `DASHBOARD_TOKEN` (tokens at least 32 characters and all different) and drop `IDEAS_DIR`.

## Evidence

| Check | Result | Notes / output snippet |
|-------|--------|------------------------|
| **New test(s) cover Acceptance Criteria (file paths pasted)** | ☑ pass | `apps/mcp/src/auth.test.ts` (AC 1, 2), `apps/mcp/src/index.test.ts` (AC 1, 6), `apps/mcp/src/server.test.ts` (AC 1-5, 7 over HTTP with a real SDK client and a test DB), `apps/mcp/src/tools.test.ts` (AC 2-4 handlers), `apps/mcp/src/index-store.test.ts` (clamp and date helpers). |
| Verification command run | ☑ pass | Re-run by the Supervisor 2026-11-10T22:5xZ against PGlite on :55432: `pnpm test` packages/ideas 25/25, packages/db 23/23, apps/mcp 43/43, scripts 5/5 = 96 pass, 0 fail; `pnpm lint` exit 0; `pnpm typecheck` exit 0. Without `TEST_DATABASE_URL` the DB tests skip cleanly (agent run: 18 pass, 0 fail). |
| Negative cases hold | ☑ pass | Supervisor mutation: `git diff --stat` showed `apps/mcp/src/tools.ts | 2 +-` after changing `if (role !== "write") return;` to `if (role === undefined) return;` (a read token then gets `submit_ideas`); tests: apps/mcp pass 42, fail 1, `✖ a read token lists exactly the three read tools, all read-only`. Restored with `git checkout`, tree clean. The agent's own mutation (removing the registration guard) was red the same way, and the handler guard still refused the call. |
| verify | ☐ pass / ☐ fail / ☐ N/A | [what was observed — must literally state "pass" or "fail" here too, e.g. "skill run, feature confirmed working — pass": the merge gate scans this Notes column for the word "pass", not just the Result column] |
| Review scope bounded to the change's blast radius (affected set, not whole repo) | ☑ pass | Reviewed `apps/mcp/src/{auth,server,tools,index-store,index}.ts`, their tests and the `@idea-radar/db` link; `packages/db` was reviewed under T033 and only its callers' use was read. Stale-reference sweep: `.env.example` (blocked, P2), README, `package.json` and `docs/deploy.md` belong to T036. code-review: no P0/P1, P2 x2, P3 x2; lane_check warn-only `EXCEEDS (lines 1337 > 500)`, about 1,000 lines are tests. security-review: no findings. Reports: `reports/code-review_t034-mcp-submit-ideas_20261110T225706.html`, `reports/security-review_t034-mcp-submit-ideas_20261110T225706.html`. |
| Full smoke suite still green (no regression) | ☑ pass | Same run: 96 pass, 0 fail across all four test groups. |
| **Companion score (easy-verifier)** | ☑ N/A | easy-verifier failed to connect in this session (CONNECT_TIMEOUT), so no score was run. |
| **UI: Visual regression (diff or verdict pasted)** | ☑ N/A | not a UI task (the dashboard is T035) |
| **UI: Design-system compliance (tokens/colors/typography verified)** | ☑ N/A | not a UI task (the dashboard is T035) |
| **UI: Responsiveness at target viewports** | ☑ N/A | not a UI task (the dashboard is T035) |

---

## Demonstration

> Anchors what this task delivered to an observable before/after pair. BEFORE has no `N/A` path:
> if the task changes executable code, BEFORE is a pasted, timestamped terminal capture taken
> **before any implementation commit exists**; if it does not (docs, templates, skill-instruction
> text), BEFORE is the **verbatim prior content** of what changed — a quoted excerpt, not a command.

**BEFORE** (captured 2026-11-10 before any implementation commit, in `.claude/worktrees/T034`):

```
$ date -u +%FT%TZ && grep -rn submit_ideas apps/mcp/src; echo "grep exit=$?"
2026-11-10T15:37:26Z
grep exit=1            <- no match: submit_ideas does not exist anywhere in apps/mcp/src

$ cd apps/mcp && date -u +%FT%TZ && pnpm test
2026-11-10T15:37:27Z
  ... (file-backed server: boots from IDEAS_DIR, exactly 3 read tools, /health = {ok,ideas,files,skipped})
ℹ tests 36
ℹ suites 1
ℹ pass 36
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ duration_ms 2315.740624
```

**AFTER** (2026-11-10, real run: `apps/mcp` started with `src/index.ts` on :8099 against a local PGlite on :55432; curl, tokens elided):

```
$ grep -rn submit_ideas apps/mcp/src      -> now matches in tools.ts, tools.test.ts, server.test.ts
2026-11-10T15:53:54Z
--- GET /health (no token)
{"ok":true} [HTTP 200]
--- read token calls submit_ideas
{"result":{"content":[{"type":"text","text":"MCP error -32602: Tool submit_ideas not found"}],"isError":true},...,"id":1}
--- write token: submit_ideas
{"result":{"content":[{"type":"text","text":"{\"saved\":1,\"date\":\"2026-11-10\"}"}]},...,"id":2}
--- write token: bad url is rejected
{"result":{"content":[{"type":"text","text":"submission rejected, nothing was saved:\nsubmission: /ideas/0/signals/0/url must match pattern \"^https?://\\S+$\"\nsubmission: /ideas/0/signals/0/url must match format \"uri\""}],"isError":true},...,"id":3}
--- read token: list_ideas
{"count":4,"ideas":[{"id":"new-one",...},{"id":"real-run-idea","title":"Real run idea","summary":"Saved by curl","tags":["demo"],"first_seen":"2026-11-10","last_seen":"2026-11-10"},{"id":"old-one",...},{"id":"old-two",...}]}
--- no token
{"error":"unauthorized"} [HTTP 401]

$ TEST_DATABASE_URL=postgres://postgres:pg@localhost:55432/postgres pnpm test   (exit 0)
packages/ideas 25/25, packages/db 23/23, apps/mcp 43/43, scripts 5/5; pnpm lint and pnpm typecheck pass
```
(The other three ideas in the list are leftovers of the test suite in the shared PGlite.)

**DELTA**: the routine can now send a day's ideas with the `submit_ideas` tool (write token); they are validated, saved in Postgres and visible to readers (read token, who cannot write) at once.

**WITNESS**: `memory/event-trace/T034.jsonl` (169 records, 2026-11-10T15:36:12Z to 15:58:03Z, hash chain head `15f92ebba2a167ea25fb76f8a03c6359b14590763ba557b0e08d2a6208bb8edb`) records the backend-developer agent's run and the Supervisor's own re-run of the full suite, lint and typecheck plus the `if (role === undefined)` mutation (1 test red).
