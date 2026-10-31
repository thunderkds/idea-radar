import { firstPageHref, tierPath, windowOf, type TierFilters } from "../../lib/query";
import type { Tier } from "../../lib/types";

/** Plain GET form: the filters live in the URL, so the page is a server component and links are shareable. */
export function FilterForm({ tier, filters }: { tier: Tier; filters: TierFilters }) {
  const id = (name: string) => `filter-${name}`;
  const windowValue = windowOf(filters);
  return (
    <form className="filters" method="get" action={tierPath(tier)} aria-label="Filters">
      <div className="field">
        <label htmlFor={id("language")}>language</label>
        <input id={id("language")} name="language" defaultValue={filters.language ?? ""} placeholder="TypeScript" maxLength={200} />
      </div>
      <div className="field">
        <label htmlFor={id("topic")}>topic</label>
        <input id={id("topic")} name="topic" defaultValue={filters.topic ?? ""} placeholder="cli" maxLength={200} />
      </div>
      <div className="field">
        <label htmlFor={id("collection")}>OSS Insight collection</label>
        <input id={id("collection")} name="collection" defaultValue={filters.collection ?? ""} placeholder="Web Framework" maxLength={200} />
      </div>
      <div className="field">
        <label htmlFor={id("window")}>star window</label>
        <select id={id("window")} name="window" defaultValue={windowValue}>
          <option value="7d">7 days</option>
          <option value="30d">30 days</option>
          {windowValue !== "7d" && windowValue !== "30d" ? <option value={windowValue}>{windowValue}</option> : null}
        </select>
      </div>
      <div className="filters__actions">
        <button className="gm-btn gm-btn--primary gm-btn--sm" type="submit">
          Apply
        </button>
        <a className="gm-btn gm-btn--secondary gm-btn--sm" href={firstPageHref(tier, {})}>
          Reset
        </a>
      </div>
    </form>
  );
}
