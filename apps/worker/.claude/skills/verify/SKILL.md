---
name: verify
description: Run the real worker against a scratch Postgres DB to observe job-queue behaviour (claims, heartbeat, lost runs) or one job (e.g. regroup) end to end.
---

# Verify the worker at runtime

1. Scratch DB on the local test container (`idea-radar-test-pg`, port 5436, user/db `radar`; password from `docker inspect`):
   `docker exec idea-radar-test-pg psql -U radar -d radar -c 'CREATE DATABASE verify_x'`
2. Start one pass from `apps/worker` (the worker applies migrations itself):
   `env -u GITHUB_TOKEN DATABASE_URL=postgres://radar:<pw>@127.0.0.1:5436/verify_x timeout -s INT 400 npx tsx --conditions=source src/index.ts --once > /tmp/run.log 2>&1 &`
3. Inspect `jobs` with psql while it runs. Without a token: `github_trending` runs ~21 s and writes ~250 `pending_signals` rows; `gh_archive` runs for minutes (good for heartbeat checks — default 60 s, not exposed as a CLI flag).
4. Simulate a stuck-job reclaim: `update jobs set attempts=attempts+1, locked_at=now() where name='<job>' and status='running'`.
5. Drop the DB with `DROP DATABASE ... WITH (FORCE)`.

Gotchas: zsh does not word-split `$VAR` commands — use a shell function. `pkill -f` on the worker pattern also matches the calling shell; use `pgrep -af` and kill by PID. SIGTERM/SIGINT only stops new claims; the worker waits for running jobs.

## Isolating one job (T026 verify)

1. `pnpm build` (repo root).
2. Postgres: test container `idea-radar-test-pg` on `127.0.0.1:5436`, user/pass/db `radar`.
   `docker exec idea-radar-test-pg psql -U radar -d radar -c "CREATE DATABASE verify_x"`
3. Migrate: from `apps/worker`, `DATABASE_URL=... node -e 'import("@idea-radar/db").then(async db=>{const p=db.createPool();const c=await p.connect();await db.applyMigrations(c);c.release();await p.end()})'`
4. Seed with SQL. Gotcha: `INSERT INTO repos VALUES (...)` positional columns do NOT put topics third; name columns.
5. Isolate the job: `gh_archive` cannot be disabled and downloads data. Pre-insert `jobs` rows with `status='ok'` for
   every other scheduled name/key (hourly key `YYYY-MM-DDTHH`, daily `YYYY-MM-DD`, weekly `W<Monday>`).
   Print the schedule: `node -e 'Promise.all([import("./dist/handlers.js"),import("@idea-radar/connectors")]).then(([h,c])=>console.log(JSON.stringify(h.buildSchedule(h.buildHandlers({connectors:c.buildRegistry({})})))))'`
6. Run: `env -u GITHUB_TOKEN DATABASE_URL=postgres://radar:radar@127.0.0.1:5436/verify_x pnpm worker -- --once` (root). JSON log lines start with `{`.
7. Re-run a weekly/daily job: `DELETE FROM jobs WHERE name='<job>'`. Drop the DB afterwards.
