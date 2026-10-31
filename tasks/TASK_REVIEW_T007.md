# TASK_REVIEW — T007: HUN-144 Scheduler and job runner

> Sibling of `tasks/TASK_GUIDE_T007.md`. Everything here is **filled by the reviewer at Stage
> 4/5** — it is deliberately NOT in the guide, because the implementing agent re-reads the guide on
> every turn and never fills these two sections.
>
> Consumers resolve each section **guide first, this file second** (`.claude/hooks/lib/guide_sections.py`):
> a legacy guide that still carries these sections inline keeps working unchanged, and a stray
> review file can never override an inline section.

---

<!-- Optional: the final report, only for a task run in auto mode (the user's `[auto]` tag,
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

## Auto decisions

Mode: auto
1. Job queue = an in-repo `jobs` table (migration 004) claimed with `FOR UPDATE SKIP LOCKED`, no pg-boss — DEBATED: in-repo jobs table (Advocate 1: pg-boss with one queue per connector, cron schedules, singleton keys per data date and `localConcurrency` from `rateLimit.concurrency`; Advocate 2: a ~150-line plain-pg runner with an idempotent tick keyed by (name, data date), SKIP LOCKED claim with per-connector and global caps, capped backoff and lock-timeout reclaim). Chosen for no new dependency, fit with the existing migration runner, and "score after ingestion" as one claim rule ⚠ decided for you — please review
2. Accepted `score(D)` running only after 02:00 UTC and only once every other job of date D is `ok` — RULE: `docs/ISSUES.md` § HUN-144 ("`score` daily after ingestion completes")
3. Accepted a per-name cap of 1 for `gh_archive` (below its `rateLimit.concurrency` of 2), because its ingest walks one cursor — RULE: `memory/decisions.md` § "2026-10-31 — GH Archive ingests whole UTC days, not hours"
4. Approved the agent's tdd plan as matching the guide — RULE: `docs/claude-md/tracks.md` `### Every user stop and its auto rule` (row 15: "The Supervisor approves a `tdd` plan that matches the guide")
Checks: tests `TEST_DATABASE_URL=… pnpm test` — db 37/37, worker 18/18, connectors 45/45 (+1 skip), core 6/6; reviews migration-safety — GO (additive table + partial index, rollback SQL in header, up→down→up on a scratch schema), code-review — P0 0, P1 0, P2 4 (a permanently `failed` ingest job blocks `score` for that date forever; daily connectors are not backfilled for missed days; `syncSources` behind a `typeof` guard until T006 merges; out of scope: OSS Insight returns no data so its job is `ok` with 0 signals), security-review — no findings ≥ 8/10 (only fixed column names interpolated, all values bound, no token in errors or `last_error`); real run `pnpm worker -- --once` against a local DB (agent) — printed `{"job":"gh_archive",…,"status":"ok"}`, `github_trending` ok (261 rows to `pending_signals`), `ossinsight` ok, `score` ok; a second pass created nothing (auto-checked, not /verify)
Memory: decisions.md — "Worker job queue is an in-repo `jobs` table (T007)"; learnings.md — "OSS Insight API returns no data"
Not done: merge (yours); auto verify: running (T182); `WORKER_MAX_CONCURRENCY=20` in `.env.example` (yours — the file is a sensitive path for agents)

## Evidence

| Check | Result | Notes / output snippet |
|-------|--------|------------------------|
| **New test(s) cover Acceptance Criteria (file paths pasted)** | ☑ pass | `packages/db/src/jobs.test.ts` (18 tests, AC 1–6) and `apps/worker/src/worker.test.ts` (18 tests, AC 7–8). Output: db `ℹ tests 37 ℹ pass 37 ℹ fail 0`, worker `ℹ tests 18 ℹ pass 18 ℹ fail 0` |
| Verification command run | ☑ pass | `TEST_DATABASE_URL=… pnpm test` (see AFTER); agent: `pnpm typecheck` clean |
| Negative cases hold | ☑ pass | enqueue twice → no duplicates; failed job backs off then `failed` after 5; stuck job reclaimed; `score` blocked until ingest `ok`; no `DATABASE_URL` → exit 1 with message |
| verify | ☐ pass / ☐ fail / ☐ N/A | [what was observed — must literally state "pass" or "fail" here too, e.g. "skill run, feature confirmed working — pass": the merge gate scans this Notes column for the word "pass", not just the Result column] |
| Review scope bounded to the change's blast radius (affected set, not whole repo) | ☑ pass | migration 004, `jobs.ts` + test, worker `handlers/runner/index` + test, `repository.test.ts` (same migration-count edit as T021). `lane: C2, 10 files, 1164 lines, EXCEEDS (lines 1164 > 500); unpredicted: packages/db/src/jobs.test.ts, packages/db/src/repository.test.ts` — over half are tests; label kept at C2 |
| Full smoke suite still green (no regression) | ☑ pass | whole-repo `pnpm test` exit 0 |
| **Companion score (easy-verifier)** | ☑ N/A | not run in this session; offered for the merge decision |
| **UI: Visual regression (diff or verdict pasted)** | ☑ N/A | no UI component: worker and queue only |
| **UI: Design-system compliance (tokens/colors/typography verified)** | ☑ N/A | no UI component: worker and queue only |
| **UI: Responsiveness at target viewports** | ☑ N/A | no UI component: worker and queue only |

---

## Demonstration

> Anchors what this task delivered to an observable before/after pair. BEFORE has no `N/A` path:
> if the task changes executable code, BEFORE is a pasted, timestamped terminal capture taken
> **before any implementation commit exists**; if it does not (docs, templates, skill-instruction
> text), BEFORE is the **verbatim prior content** of what changed — a quoted excerpt, not a command.

**BEFORE**: captured before any implementation commit (cmd: `date -u; sed -n 1,20p apps/worker/src/index.ts; ls packages/db/migrations`):

```
Sat Oct 31 06:21:48 AM UTC 2026
import { buildRegistry } from "@idea-radar/connectors";
import type { ConnectorRunResult, SourceConnector } from "@idea-radar/core";

/**
 * Minimal scheduler. GH Archive runs hourly; everything else daily; scoring
 * daily after ingestion. Swap for a queue-backed runner in HUN-144.
 */
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

async function runConnector(c: SourceConnector, since: Date): Promise<ConnectorRunResult> {
  const startedAt = new Date();
  let signalsWritten = 0;
  try {
    for await (const item of c.fetch(since)) {
      const signals = c.normalize(item);
      // TODO(HUN-142): resolve fullName -> repoId and insert into `signals`.
      signalsWritten += signals.length;
    }
    return { connectorId: c.id, startedAt, finishedAt: new Date(), signalsWritten, status: "ok" };
001_init.sql
002_pending_signals_and_cursors.sql
```

**AFTER**: Supervisor rerun, 2026-10-31, fresh Postgres 16 on port 5435:

```
$ TEST_DATABASE_URL=postgres://radar:radar@localhost:5435/radar pnpm test
packages/db test: ℹ tests 37 ℹ pass 37 ℹ fail 0
apps/worker test: ℹ tests 18 ℹ pass 18 ℹ fail 0
packages/connectors test: ℹ tests 46 ℹ pass 45 ℹ fail 0
```
Agent real run: `pnpm worker -- --once` → `{"job":"gh_archive","dataKey":"2026-10-31T06","status":"ok"}`, `github_trending` ok, `ossinsight` ok, `score` ok; second pass ran nothing new.

**DELTA**: The worker now runs every connector from a durable Postgres job table with retries, concurrency caps and no duplicate runs, and records each run in `sources`.

**WITNESS**: Supervisor session, 2026-10-31, T007 worktree (trace `memory/event-trace/T007.jsonl`).
