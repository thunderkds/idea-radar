---
name: verify
description: Run the real worker CLI against a scratch Postgres DB to observe job-queue behavior (claims, heartbeat, lost runs).
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
