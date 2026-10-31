import { CHART_HEIGHT, barGeometry, chartWidth } from "../../lib/chart";
import { formatCount } from "../../lib/format";
import { NoData } from "./no-data";

/** New stars per day from `repo_daily`, as inline SVG. The latest day is the current bar (neon); the others are neon-bar. */
export function StarChart({ series }: { series: { date: string; starsNew: number }[] }) {
  if (series.length === 0) return <NoData />;
  const bars = barGeometry(series);
  const total = series.reduce((sum, p) => sum + p.starsNew, 0);
  const first = series[0]!.date;
  const last = series[series.length - 1]!.date;
  return (
    <figure style={{ margin: 0 }}>
      <svg
        className="chart"
        viewBox={`0 0 ${chartWidth(series.length)} ${CHART_HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`New stars per day from ${first} to ${last}: ${formatCount(total)} in total`}
      >
        {bars.map((b) => (
          <rect key={b.date} className={b.current ? "chart-bar chart-bar--current" : "chart-bar"} x={b.x} y={b.y} width={b.width} height={b.height}>
            <title>{`${b.date}: ${formatCount(b.value)} new stars`}</title>
          </rect>
        ))}
      </svg>
      <figcaption className="chart-legend">
        <span>{first}</span>
        <span>{formatCount(total)} new stars</span>
        <span>{last}</span>
      </figcaption>
    </figure>
  );
}
