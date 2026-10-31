# PROJECT_KANBAN.md
**Last updated**: 2026-10-31

> Compact task board. Full context lives in `PROJECT_SPEC.md`, `docs/SPEC.md` and `docs/ISSUES.md`. Linear (project "Idea Radar v1") stays the status source for the team; `Txxx` ↔ `HUN-1xx` mapping is in each row.

---

## Board

> Task line format: **Txxx** — [title] | [agent] | C[0–3] | Risk: Low/Med/High | P[0–2]
> Wave 1 (T001 first, then T002–T005 in parallel) has guides. Wave 2+ rows get their `tasks/TASK_GUIDE_Txxx.md` before pickup, from the acceptance criteria in `docs/ISSUES.md`.

### Todo
- [ ] **T006** — HUN-143 Registry sync into `sources` + env-flag tests | backend-developer | C1 | Risk: Low | P1
- [ ] **T007** — HUN-144 Postgres-backed scheduler and job runner | backend-developer | C2 | Risk: Med | P1
- [ ] **T008** — HUN-148 Shortlist enrichment (README, manifests, file tree, stack tags) | backend-developer | C2 | Risk: Low | P2
- [ ] **T009** — HUN-149 Tier classification job | backend-developer | C2 | Risk: Low | P1
- [ ] **T010** — HUN-150 Lowkey score components + tuning scripts | backend-developer | C2 | Risk: Low | P1
- [ ] **T011** — HUN-151 Fake-star detection | backend-developer | C2 | Risk: Low | P2
- [ ] **T012** — HUN-152 OSS Insight connector | backend-developer | C1 | Risk: Low | P2
- [ ] **T013** — HUN-153 Trendshift connector (scoring only) | backend-developer | C2 | Risk: Med | P2
- [ ] **T014** — HUN-154 GitHub Explorer connector | backend-developer | C1 | Risk: Low | P2
- [ ] **T015** — HUN-155 Source consensus score | backend-developer | C1 | Risk: Low | P2
- [ ] **T016** — HUN-156 Read-only API | backend-developer | C2 | Risk: Med | P1
- [ ] **T017** — HUN-157 Dashboard: tier tabs + repo detail | frontend-developer | C2 | Risk: Low | P1
- [ ] **T018** — HUN-158 Dashboard: rising topics, consensus, ops | frontend-developer | C2 | Risk: Low | P2
- [ ] **T019** — HUN-159 Deploy v1 | common-infrastructure | C2 | Risk: Med | P2
- [ ] **T020** — Docs + diagrams from gap analysis (`docs/analysis/2026-10-31-gaps.md` D1–D15, A17) | backend-developer | C2 | Risk: Low | P1
- [ ] **T021** — Candidate selection over repo_daily + signals (gaps A1, A11; new, not in Linear yet) | backend-developer | C2 | Risk: Med | P1

### In Progress

### Ready for Review
- [ ] **T004** — HUN-146 GH Archive streaming + repo_daily rollup | backend-developer | C2 | PR/branch: `hun-146-gh-archive` | Started 2026-10-31: branch `hun-146-gh-archive`
- [ ] **T002** — HUN-142 Postgres data-access module + migration 002 | backend-developer | C2 | PR/branch: `hun-142-db-access` | Started 2026-10-31: branch `hun-142-db-access`
- [ ] **T003** — HUN-145 GitHub API connector (metadata, name resolution, rate limit) | backend-developer | C2 | PR/branch: `hun-145-github-api` | Started 2026-10-31: branch `hun-145-github-api`
- [ ] **T005** — HUN-147 GitHub Trending page scraper | backend-developer | C1 | PR/branch: `hun-147-trending-scraper` | Started 2026-10-31: branch `hun-147-trending-scraper`

### Done
- [x] **T001** — Test runner + workspace install (infra for all tasks) | common-infrastructure | C1 | PR/branch: `hun-t001-test-runner` | Started 2026-10-31: branch `hun-t001-test-runner` | Done 2026-10-31: auto verify pass (session 602b7bbf-f688-42c1-9e5c-580c17f21a07, commit 422e1463c39880a38ca0665e9845fca7e6244f8e)

---

## Blocked

| Task | Reason | Waiting on |
|------|--------|-----------|
| T019 | Hosting target and public vs private launch not decided (`docs/SPEC.md` § Open questions) | user |

---

## Stage Tracker

| Stage | Status |
|-------|--------|
| 0.5 Brainstorming | ✅ Done (requirements locked by user in `docs/SPEC.md` + `docs/ISSUES.md`) |
| 1 Environment Setup | 🔄 In Progress (T001) |
| 1.5 Sub-Agent Architecture | ✅ Done (base team) |
| 2 Planning (/plan) | 🔄 In Progress (wave 1 guides written) |
| 3 Execution | 🔄 In Progress (wave 1 built: T001–T005) |
| 4 Review | 🔄 In Progress (wave 1 reviewed; auto verify running) |
| 5 Integration & Verify | ⬜ Not Started |
