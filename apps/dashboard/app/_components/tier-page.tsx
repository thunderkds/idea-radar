import Link from "next/link";
import { getTier } from "../../lib/api";
import { firstPageHref, nextPageHref, windowOf, type TierFilters } from "../../lib/query";
import { TIERS, type Tier } from "../../lib/types";
import { FilterForm } from "./filter-form";
import { Notice } from "./notice";
import { RepoRow } from "./repo-row";
import { TierTabs } from "./tier-tabs";

/** The tier list: tabs, filters, rows and a next-page link. `/` renders it for the Lowkey tier. */
export async function TierPage({ tier, filters }: { tier: Tier; filters: TierFilters }) {
  const info = TIERS.find((t) => t.id === tier)!;
  const result = await getTier(tier, filters);

  return (
    <>
      <header className="page-head">
        <p className="gm-eyebrow">&gt; {tier}</p>
        <h1 className="page-title">{info.label} repos</h1>
        <p className="lede">{info.blurb}</p>
      </header>
      <TierTabs active={tier} />
      <FilterForm tier={tier} filters={filters} />
      {result.ok ? <TierList tier={tier} filters={filters} data={result.data} /> : <TierError kind={result.kind} message={result.message} />}
    </>
  );
}

function TierError({ kind, message }: { kind: string; message: string }) {
  if (kind === "unreachable") {
    return (
      <Notice title="API unreachable">The dashboard could not reach the API. Start it with pnpm api, or check API_URL.</Notice>
    );
  }
  return <Notice title={kind === "bad_request" ? "The API rejected these filters" : "The API returned an error"}>{message}</Notice>;
}

function TierList({
  tier,
  filters,
  data,
}: {
  tier: Tier;
  filters: TierFilters;
  data: { date: string | null; items: Parameters<typeof RepoRow>[0]["item"][]; nextCursor: string | null };
}) {
  if (data.date === null) {
    return <Notice title="No scored repos yet">Run the worker and the scoring job first.</Notice>;
  }
  const label = windowOf(filters);
  return (
    <section className="section" aria-label={`${tier} repos`}>
      <p className="meta">
        scored {data.date} · {data.items.length} on this page
      </p>
      {data.items.length === 0 ? (
        <p className="lede">No repos in this tier match these filters.</p>
      ) : (
        <ul className="repo-list">
          {data.items.map((item) => (
            <RepoRow key={item.repoId} item={item} windowLabel={label} />
          ))}
        </ul>
      )}
      <div className="pager">
        {filters.cursor ? (
          <Link className="gm-btn gm-btn--secondary gm-btn--sm" href={firstPageHref(tier, filters)}>
            First page
          </Link>
        ) : null}
        {data.nextCursor ? (
          <Link className="gm-btn gm-btn--secondary gm-btn--sm" href={nextPageHref(tier, filters, data.nextCursor)}>
            Next page
          </Link>
        ) : null}
      </div>
    </section>
  );
}
