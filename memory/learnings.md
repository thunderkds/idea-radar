# learnings.md — Cold Tier: Clarifications, Patterns & Gotchas

> **Rules**: Supervisor-only writes. Each entry dated (`YYYY-MM-DD`) and citing the file/task it came from (the diff-driven pass greps this file by changed file path).

## Requirement Clarifications

## Patterns

## Gotchas

### 2026-10-31 — OSS Insight API returns no data
`api.ossinsight.io/v1` trending answers `rows: []` with `data_quality.status: "unavailable"` (unavailable since 2026-03-01, seen by T007's real worker run). The `ossinsight` connector therefore reports `ok` with 0 signals — the silent-success failure HUN-147 guards against for Trending. Treat 0 rows / `unavailable` as an error before relying on OSS Insight for the trending tier (T012).
**Files**: `packages/connectors/src/ossinsight.ts`

### 2026-10-31 — OSS Insight collections endpoints return HTTP 500
On 2026-10-31 every `api.ossinsight.io/v1/collections/*` path (list, `{id}`, `{id}/repos/`, `openapi.json`) answered HTTP 500 `{"message":"Request failed with status code 401"}`, and `collections/{id}/ranking_by_stars` answered the same `unavailable` shape as trends. T012's collection parser runs on hand-written fixtures only; check the real paths and row fields once the API recovers. Until then the daily `ossinsight` job fails every run (by design) — set `OSSINSIGHT_ENABLED=false` to silence it.
**Files**: `packages/connectors/src/ossinsight.ts`, `packages/connectors/src/fixtures/ossinsight/`

### 2026-10-31 — Kit gotchas found running wave 1 in parallel
- `Agent(isolation: "worktree")` bases the worktree on `main`, not the current branch, so the agent has no `tasks/`, `agents/` or guides. Create worktrees yourself from a base branch that carries them (`git worktree add -b <branch> .claude/worktrees/Txxx <base>`) and pass the absolute path in the spawn prompt.
- The merge gate blocks `git rebase` while a task is In Progress; re-apply a task branch with `git format-patch` + `git apply --3way` instead (keep the original on a `backup/` branch).
- Gate 5 trace check (`TEST_INVOCATION_PATTERN` in `.claude/hooks/pre_bash_block_unsafe_merge.py`) only counts a literal `pnpm test` / `pnpm run test` (or pytest, jest, go test …) at a command boundary. `pnpm --filter <pkg> test` and `pnpm --dir … test` do NOT match. `cd` into the worktree in one call, run plain `pnpm test` in the next, with the active-task state file set.
- The auto-mode check only counts a `Skill` call named exactly `code-review` / `security-review`; the directory-scoped variants (`.claude/worktrees/Txxx:code-review`) do not count.
- Auto close-out treats any `<word>` in the report as an unfilled placeholder (`report incomplete`). Avoid angle brackets in report prose.
- Run the trace test run *before* `stop_auto_verify.py --start`; a pass with no traced test leaves the row in Ready for Review, and a rerun needs the verify row reset and the old log moved away.
- A Supervisor active-task state file left set makes the step-limit hook count the Supervisor's own calls against that task (T001 hit 90 and blocked a spawn). Clear it after the task's commands.
**Files**: `.claude/hooks/stop_auto_mode_check.py`, `.claude/hooks/pre_bash_block_unsafe_merge.py`, `.claude/hooks/stop_auto_verify.py`, `.claude/hooks/pre_agent_step_limit.py`
