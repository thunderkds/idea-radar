# TASK_GUIDE — T005: HUN-147 GitHub Trending page scraper
**Date**: 2026-10-31
**Complexity Level**: C1
**Risk Level**: Low
**Priority**: P1
**Assigned agent**: backend-developer
**Agent guide**: `agents/backend.md`
**Linear**: HUN-147

---

## Mandatory Startup (Do Not Skip)

1. Read `PROJECT_SPEC.md`, the top of `AGENTS.md` (`# Working in this repo`), `docs/ISSUES.md` § HUN-147.
2. Read the memory slice in your spawn prompt.
3. Read this file completely, then `agents/backend.md`.

---

## Requirement (Pillar 1)

`docs/ISSUES.md` § HUN-147 (verbatim):
- Scrape `https://github.com/trending/{language}?since={daily|weekly|monthly}` for all languages + configured list.
- Parse rank, `owner/name`, language, stars-in-period; emit `github_trending/listed` signals.
- Parser lives in its own function with a saved-HTML fixture test; a parse returning 0 rows is an error (surfaces in Ops), not success.

**Restated intent**
> Each daily run fetches the trending pages for every configured language × period and yields one ranked `TrendingEntry` per listed repo; if GitHub changes its HTML so nothing parses, the run fails loudly.

**Out of scope**
- Resolving `fullName` → `repo_id` (T002 queue + T003). Writing to DB (T007 wiring).
- Trending developers page.

**Requirement Refs**: `docs/ISSUES.md` § HUN-147; `docs/SPEC.md` § Risks (Trending HTML changes).

### Requirement Fidelity Gate
- [x] Restated intent confirmed — auto (Supervisor)
- [x] Domain terms align with `PROJECT_SPEC.md` glossary
- [x] Every AC traces to a line in the Requirement
- [x] Requirement Refs exist and are covered

---

## Dependencies & Reachability

**Depends on**: T001 — `pnpm test` runner
**Entry point**: `parseTrendingHtml`

---

## Acceptance Criteria

| # | Criterion (testable) | Traces to requirement |
|---|----------------------|-----------------------|
| 1 | `parseTrendingHtml(html, { period, language })` on a saved fixture (`github.com/trending?since=daily`, saved once to `packages/connectors/src/fixtures/github-trending/`) returns entries with rank 1..N in page order, `fullName` as `owner/name` (whitespace stripped), `language`, `starsInPeriod` as a number ("1,234 stars today" → 1234) | parse fields |
| 2 | Parsing a page with no repo rows (e.g. `<html><body></body></html>`) throws a `TrendingParseError` | 0 rows = error |
| 3 | `fetch()` iterates `languages × periods` (URL `https://github.com/trending/{lang}?since={period}`, `null` language → `https://github.com/trending?since=…`) and yields all entries; rate: at most `rateLimit.concurrency` (1) request at a time | scrape all |
| 4 | `normalize(entry)` emits `source: "github_trending"`, `signalType: "listed"`, `repoId: 0`, `fullName` set | emit signals |
| 5 | A non-200 response throws with URL and status in the message | fail loudly |

---

## Evaluation & Acceptance

### Success Criteria

| # | Given | Expect | How it's checked |
|---|-------|--------|------------------|
| 1 | saved fixture | ≥ 10 entries, first has rank 1 and a valid `owner/name` | unit test |
| 2 | empty HTML | throws `TrendingParseError` | unit test |
| 3 | injected fetch, 2 languages × 3 periods | 6 URLs requested in order | unit test |

### Verification Command

```bash
pnpm --filter @idea-radar/connectors test && pnpm typecheck
```

---

## Approach

**Pattern reference**: `packages/connectors/src/github-trending.ts` — extend in place.
**Vital slice**: `parseTrendingHtml` + fixture test.
**Cut list**: HTML parser library unless regex/string parsing proves unreliable on the fixture (if you add one, prefer a small, maintained one like `node-html-parser` and say why); retry logic (scheduler does retries, T007).

- Rows are `<article class="Box-row">`; repo link is the `h2 a[href]`; language in `[itemprop=programmingLanguage]`; period stars in the last `span` text "N stars today/this week/this month".
- Save the fixture with one real request now (`curl -s 'https://github.com/trending?since=daily' > …`); commit it.
- Injectable `fetchImpl`; send a descriptive `User-Agent`.

---

## Edge Case Checklist
- [ ] Repo with no language → `language: null`
- [ ] Repo with no "stars today" span → `starsInPeriod: null`
- [ ] HTML entities in names (`&amp;`) decoded or absent

---

## Files to Change (Predicted)

| File | Change |
|------|--------|
| `packages/connectors/src/github-trending.ts` | parser + fetch |
| `packages/connectors/src/github-trending.test.ts` | tests |
| `packages/connectors/src/fixtures/github-trending/daily.html` | saved fixture |

## Files Must NOT Touch

| File | Reason |
|------|--------|
| `packages/core/src/connector.ts` | interface stable |
| `packages/db/**` | T002 |
| other `packages/connectors/src/*.ts` | T003, T004 in parallel |
| `AGENTS.md`, `PROJECT_*.md`, `tasks/` (except your TASK_REVIEW Demonstration), `agents/`, `skills/` | Supervisor-owned |

---

## Test Plan
Fixture-based unit tests with injected fetch.

---

## Completion Checklist
- [ ] Implementation done
- [ ] Tests written AND pass — output in report
- [ ] Supervisor notified: ready for Stage 4 review
