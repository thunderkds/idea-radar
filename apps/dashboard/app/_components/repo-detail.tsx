import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { adminToken, getRepo } from "../../lib/api";
import { formatCount, formatDate, formatDateTime, formatScore, formatText } from "../../lib/format";
import { tierPath } from "../../lib/query";
import { Notice } from "./notice";
import { NoData, OrNoData, WarnIcon } from "./no-data";
import { RescrapeButton } from "./rescrape-button";
import { ScoreBreakdown } from "./score-breakdown";
import { StarChart } from "./star-chart";
import { Timeline } from "./timeline";

/** Repo detail: header, key numbers, star history, score breakdown, source timeline, README excerpt, stack. */
export async function RepoDetail({ id }: { id: string }) {
  const result = await getRepo(id);
  if (!result.ok) {
    if (result.kind === "not_found") notFound();
    if (result.kind === "unreachable") {
      return <Notice title="API unreachable">The dashboard could not reach the API. Start it with pnpm api, or check API_URL.</Notice>;
    }
    return <Notice title="The API returned an error">{result.message}</Notice>;
  }
  const { repo, score, starsSeries, stackTags, readmeExcerpt, timeline, tracking, groupRepos } = result.data;
  const backTier = score?.tier ?? "lowkey";
  const consensus = typeof score?.consensusCount === "number" ? String(score.consensusCount) : null;
  const canRefresh = adminToken() !== undefined;

  return (
    <>
      <header className="page-head">
        <Link className="gm-link back-link" href={tierPath(backTier)}>
          &larr; {backTier}
        </Link>
        <p className="gm-eyebrow">&gt; repo {repo.repoId}</p>
        <h1 className="page-title">{repo.fullName}</h1>
        <p className="lede">
          <OrNoData text={formatText(repo.description)} />
        </p>
        {repo.archived ? <p className="meta">archived</p> : null}
      </header>

      <div className="gm-strip" style={{ "--cols": 4 } as CSSProperties}>
        <div>
          <span className="gm-strip__num gm-strip__num--key">{formatCount(repo.stars) ?? <NoData />}</span>
          <span className="gm-strip__label">stars</span>
        </div>
        <div>
          <span className="gm-strip__num">{formatCount(repo.forks) ?? <NoData />}</span>
          <span className="gm-strip__label">forks</span>
        </div>
        <div>
          <span className="gm-strip__num">{score ? (formatScore(score.score) ?? <NoData />) : <NoData />}</span>
          <span className="gm-strip__label">score{score ? ` · ${score.tier}` : ""}</span>
        </div>
        <div>
          <span className="gm-strip__num">{consensus ?? <NoData />}</span>
          <span className="gm-strip__label">sources in 7 days</span>
        </div>
      </div>

      {score?.fakeStarFlag ? (
        <div className="gm-notice gm-notice--warn">
          <WarnIcon />
          <div>
            <strong>suspicious stars</strong>
            <div>The star pattern of this repo looks inflated.</div>
          </div>
        </div>
      ) : null}

      <section className="section" aria-labelledby="h-tracking">
        <h2 className="section-title" id="h-tracking">
          Tracking
        </h2>
        {tracking ? (
          <>
            <p className="meta">
              priority {tracking.priority} · last refresh <OrNoData text={formatDateTime(tracking.lastSnapshotAt)} /> · next refresh{" "}
              {tracking.nextDueAt === null ? "on request" : <OrNoData text={formatDateTime(tracking.nextDueAt)} />}
            </p>
            {tracking.groupKey ? <p className="meta">group {tracking.groupKey}</p> : null}
            {groupRepos && groupRepos.length > 0 ? (
              <ul className="group-list">
                {groupRepos.map((g) => (
                  <li key={g.repoId}>
                    <Link className="gm-link" href={`/repos/${g.repoId}`}>
                      {g.fullName}
                    </Link>
                    <span>{g.priority}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {canRefresh ? (
              <div className="rescrape-actions">
                <RescrapeButton label="Refresh now" target={{ repoId: repo.repoId }} />
                {tracking.groupKey ? <RescrapeButton label="Refresh group now" target={{ groupKey: tracking.groupKey }} /> : null}
              </div>
            ) : null}
          </>
        ) : (
          <p className="meta">not tracked</p>
        )}
      </section>

      <section className="section" aria-labelledby="h-stars">
        <h2 className="section-title" id="h-stars">
          Star history
        </h2>
        <StarChart series={starsSeries} />
      </section>

      <div className="detail-grid">
        <section className="section" aria-labelledby="h-score">
          <h2 className="section-title" id="h-score">
            Score breakdown
          </h2>
          {score ? <ScoreBreakdown components={score.components} /> : <NoData />}
          {score ? <p className="meta">
              scored <OrNoData text={formatDate(score.date)} />
            </p> : null}
        </section>
        <section className="section" aria-labelledby="h-timeline">
          <h2 className="section-title" id="h-timeline">
            Source timeline
          </h2>
          <Timeline entries={timeline} />
        </section>
      </div>

      <section className="section" aria-labelledby="h-stack">
        <h2 className="section-title" id="h-stack">
          Stack
        </h2>
        {stackTags.length === 0 ? (
          <NoData />
        ) : (
          <ul className="gm-chips">
            {stackTags.map((tag) => (
              <li key={tag} className="gm-chip">
                {tag}
              </li>
            ))}
          </ul>
        )}
        <p className="meta">
          language <OrNoData text={formatText(repo.language)} /> · license <OrNoData text={formatText(repo.license)} /> · pushed{" "}
          <OrNoData text={formatDate(repo.pushedAt)} /> · created <OrNoData text={formatDate(repo.createdAt)} />
        </p>
      </section>

      <section className="section" aria-labelledby="h-readme">
        <h2 className="section-title" id="h-readme">
          README excerpt
        </h2>
        {formatText(readmeExcerpt) === null ? <NoData /> : <pre className="readme">{readmeExcerpt}</pre>}
      </section>
    </>
  );
}
