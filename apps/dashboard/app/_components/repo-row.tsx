import Link from "next/link";
import { formatCount, formatGained, formatScore, formatText } from "../../lib/format";
import type { TierItem } from "../../lib/types";
import { OrNoData, WarnIcon } from "./no-data";

/** One repo in a tier list. `windowLabel` is the API window the `starsGained` figure covers ("7d"). */
export function RepoRow({ item, windowLabel }: { item: TierItem; windowLabel: string }) {
  const showConsensus = typeof item.consensusCount === "number" && item.consensusCount >= 1;
  return (
    <li className="repo-row">
      <div className="repo-row__main">
        <Link className="gm-link repo-row__name" href={`/repos/${item.repoId}`}>
          {item.fullName}
        </Link>
        <p className="repo-row__desc">
          <OrNoData text={formatText(item.description)} />
        </p>
        <div className="repo-row__badges">
          {showConsensus ? (
            <span className="gm-chip" title={`Flagged by ${item.consensusCount} sources in the last 7 days`}>
              consensus {item.consensusCount}
            </span>
          ) : null}
          {item.fakeStarFlag ? (
            <span className="warn-flag">
              <WarnIcon />
              suspicious stars
            </span>
          ) : null}
        </div>
      </div>
      <dl className="stats">
        <Stat label="language" text={formatText(item.language)} />
        <Stat label="stars" text={formatCount(item.stars)} />
        <Stat label={`${windowLabel} stars`} text={formatGained(item.starsGained)} />
        <Stat label="score" text={formatScore(item.score)} />
      </dl>
    </li>
  );
}

function Stat({ label, text }: { label: string; text: string | null }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        <OrNoData text={text} />
      </dd>
    </div>
  );
}
