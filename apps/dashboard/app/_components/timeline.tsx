import { formatDate } from "../../lib/format";
import type { TimelineEntry } from "../../lib/types";
import { NoData } from "./no-data";

/** Source-consensus timeline: when each displayable source first and last flagged the repo. */
export function Timeline({ entries }: { entries: TimelineEntry[] | undefined }) {
  if (!entries || entries.length === 0) return <NoData />;
  return (
    <ol className="timeline">
      {entries.map((e) => (
        <li key={e.source}>
          <span>{e.source}</span>
          <span>
            {formatDate(e.firstSeenAt) ?? <NoData />} to {formatDate(e.lastSeenAt) ?? <NoData />}
          </span>
        </li>
      ))}
    </ol>
  );
}
