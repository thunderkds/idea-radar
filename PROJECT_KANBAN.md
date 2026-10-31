# PROJECT_KANBAN.md
**Last updated**: 2026-10-31

> Compact task board. Full context lives in `PROJECT_SPEC.md`, `docs/SPEC.md` and `docs/ISSUES.md`. Linear (project "Idea Radar v1") stays the status source for the team; `Txxx` ↔ `HUN-1xx` mapping is in each row.

---

## Board

> Task line format: **Txxx** — [title] | [agent] | C[0–3] | Risk: Low/Med/High | P[0–2]
> Wave 1 (T001 first, then T002–T005 in parallel) has guides. Wave 2+ rows get their `tasks/TASK_GUIDE_Txxx.md` before pickup, from the acceptance criteria in `docs/ISSUES.md`.

### Todo
- [ ] **T013** — HUN-153 Trendshift connector (scoring only) | backend-developer | C2 | Risk: Med | P2
- [ ] **T014** — HUN-154 GitHub Explorer connector | backend-developer | C1 | Risk: Low | P2
- [ ] **T018** — HUN-158 Dashboard: rising topics, consensus, ops | frontend-developer | C2 | Risk: Low | P2
- [ ] **T019** — HUN-159 Deploy v1 | common-infrastructure | C2 | Risk: Med | P2
- [ ] **T020** — Docs + diagrams from gap analysis (`docs/analysis/2026-10-31-gaps.md` D1–D15, A17) | backend-developer | C2 | Risk: Low | P1

### In Progress

### Ready for Review
- [ ] **T023** — Job queue run token + heartbeat (no double run after stuck-job reclaim) | backend-developer | C2 | Risk: Med | P1 | PR/branch: `hun-t023-job-fencing` | Started 2026-10-31: branch `hun-t023-job-fencing`

### Done
- [x] **T017** — HUN-157 Dashboard: tier tabs + repo detail | frontend-developer | C2 | Risk: Low | P1 | PR/branch: `hun-157-dashboard-tiers` | Started 2026-10-31: branch `hun-157-dashboard-tiers` | Reopened 2026-10-31: auto verify fail (branch lacked T015's API fields); `hun-155-consensus` merged in 7a73f18; rework R1 | Done 2026-10-31: auto verify pass (session 43c42cf4-908e-42dc-be66-cfa226cc1d57, commit f9d663c5ea56e6564944606e23c1568fdec81a43)
- [x] **T015** — HUN-155 Source consensus score (+ API consensus/fake-star fields, /consensus) | backend-developer | C2 | Risk: Low | P1 | PR/branch: `hun-155-consensus` | Started 2026-10-31: branch `hun-155-consensus` | Done 2026-10-31: auto verify pass (session 2ae3f276-bc65-4c5d-b9d8-28abdd602e19, commit 39245bcad85167932d5d0b89760a75d0892586d8) | Reopened 2026-10-31: rework R1 — down migration, tests, score fixes (branch has T022 merged) | Done 2026-10-31: auto verify pass (session 97787e2e-a6f7-4c53-87b7-ef73ab3c0f68, commit ff07fbc1b5a317a5c06be14dd749fca59f7fc281)
- [x] **T011** — HUN-151 Fake-star detection | backend-developer | C2 | Risk: Low | P2 | PR/branch: `hun-151-fake-stars` | Started 2026-10-31: branch `hun-151-fake-stars` | Done 2026-10-31: auto verify pass (session ef46e90e-b44a-4d3b-897f-bb1f40569d72, commit 6757bfe02350a556655f558f722fa5dca5e05621) | Reopened 2026-10-31: rework R1 — timeouts, swallowed error, score fixes (branch has T022 merged) | Done 2026-10-31: auto verify pass (session f0f9a9f0-603b-4169-b729-606541bfcb56, commit 69fd41061e9d95b28dd5fceab45dfbed236b30cd)
- [x] **T010** — HUN-150 Lowkey score components + tuning scripts | backend-developer | C2 | Risk: Low | P1 | PR/branch: `hun-150-lowkey-score` | Started 2026-10-31: branch `hun-150-lowkey-score` | Done 2026-10-31: auto verify pass (session 92ec7085-b57d-4903-a294-d03cd7d6f3fe, commit eafd6fbb5cadb0fac6e03f9ba4b8c15acafdb903) | Reopened 2026-10-31: rework R1 — easy-verifier score fixes (branch has T022 merged) | Done 2026-10-31: auto verify pass (session c936bc30-8fe0-464e-bb67-d6027d7af4fb, commit 3543beb0c58cd28635d29ffb9f2e6d3c66065ffe)
- [x] **T022** — Repo hygiene for wave-4 scores: MIT LICENSE, lint + format config, CI hardening | common-infrastructure | C1 | Risk: Low | P1 | PR/branch: `hun-t022-repo-hygiene` | Started 2026-10-31: branch `hun-t022-repo-hygiene` | Done 2026-10-31: auto verify pass (session 2d983b96-1833-47a2-bdce-aa3e524b4cfa, commit 87af0b2b4d7b70dca34bb2fd94159964d836758f)
- [x] **T016** — HUN-156 Read-only API | backend-developer | C2 | Risk: Med | P1 | PR/branch: `hun-156-api` | Started 2026-10-31: branch `hun-156-api` | Done 2026-10-31: auto verify pass (session df322962-d4a5-4761-a9bd-b67430d6de4c, commit 09ca46e52e1d59a3aecfc0bda3e486a02506bf52)
- [x] **T008** — HUN-148 Shortlist job: candidates, metadata, README/manifests, stack tags | backend-developer | C2 | Risk: Low | P1 | PR/branch: `hun-148-shortlist` | Started 2026-10-31: branch `hun-148-shortlist` | Done 2026-10-31: auto verify pass (session 2fc8017c-a156-48de-8e84-5f491bc01520, commit 7f1c2f8cc3cf5e70c8d1d8b05ce9237bb21e2a9e)
- [x] **T009** — HUN-149 Tier classification job | backend-developer | C2 | Risk: Low | P1 | PR/branch: `hun-149-tier-classification` | Started 2026-10-31: branch `hun-149-tier-classification` | Done 2026-10-31: auto verify pass (session 5874b2fb-0170-426f-a8b1-3cbd48e2626d, commit 5988ece9c32fedbdc7e2e7937322068a4f26dbe0)
- [x] **T012** — HUN-152 OSS Insight connector | backend-developer | C1 | Risk: Low | P2 | PR/branch: `hun-152-ossinsight` | Started 2026-10-31: branch `hun-152-ossinsight` | Done 2026-10-31: auto verify pass (session 7ec0579b-cda9-4c2b-8293-e1cb05b85a14, commit 5bdded0a5401465c4f5696086facda6152c3fbb4)
- [x] **T007** — HUN-144 Postgres-backed scheduler and job runner | backend-developer | C2 | PR/branch: `hun-144-scheduler` | Started 2026-10-31: branch `hun-144-scheduler` | Done 2026-10-31: auto verify pass (session 966b9be9-cb45-488a-b429-4f85d3464e3d, commit 489c3c20b95eba697a8533fed8bc242778df8ec1)
- [x] **T021** — Candidate selection over repo_daily + signals | backend-developer | C2 | PR/branch: `t021-candidate-selection` | Started 2026-10-31: branch `t021-candidate-selection` | Done 2026-10-31: auto verify pass (session a873b5cd-63d4-449e-88cb-512f79b59c46, commit 9bff5d94ed523f10aff2cf3485ce749f2f8a2b81)
- [x] **T006** — HUN-143 Registry sync into `sources` + env-flag tests | backend-developer | C1 | PR/branch: `hun-143-registry-sync` | Started 2026-10-31: branch `hun-143-registry-sync` | Done 2026-10-31: auto verify pass (session 49d3b7a8-ddbc-4244-907c-ec45952b0186, commit fa2cfa0aa405be1e32b0c9f4066e8b2770e5c8a5)
- [x] **T004** — HUN-146 GH Archive streaming + repo_daily rollup | backend-developer | C2 | PR/branch: `hun-146-gh-archive` | Started 2026-10-31: branch `hun-146-gh-archive` | Done 2026-10-31: auto verify pass (session 5c645216-38c8-4491-b0ee-ff3d637a43ef, commit ec6a85bda5e69eabd242c1ef3d12d1893ed75f29)
- [x] **T003** — HUN-145 GitHub API connector (metadata, name resolution, rate limit) | backend-developer | C2 | PR/branch: `hun-145-github-api` | Started 2026-10-31: branch `hun-145-github-api` | Done 2026-10-31: auto verify pass (session ca6bbe3b-870c-4bd2-abdb-42932f31418b, commit affa5b17bd1efb0cc3d65b5935d8cae813ac67d0)
- [x] **T005** — HUN-147 GitHub Trending page scraper | backend-developer | C1 | PR/branch: `hun-147-trending-scraper` | Started 2026-10-31: branch `hun-147-trending-scraper` | Done 2026-10-31: auto verify pass (session 76dffb44-4455-4e9c-9254-27a9d14c436d, commit 29d75afd99117fd1ad0743a79e777c094d177ee2)
- [x] **T002** — HUN-142 Postgres data-access module + migration 002 | backend-developer | C2 | PR/branch: `hun-142-db-access` | Started 2026-10-31: branch `hun-142-db-access` | Done 2026-10-31: auto verify pass (session 59b2aa68-37fc-4c91-b452-72bd8023ea64, commit 1924d5fd1ebf5ba42ae5336a76e7d942d5f4e45a)
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
| 3 Execution | 🔄 In Progress (waves 1–4 merged to main: T001–T012, T015–T017, T021, T022; next: T013, T014, T018, T019, T020) |
| 4 Review | ✅ Done for waves 1–2 |
| 5 Integration & Verify | ⬜ Not Started |
