import { formatScore } from "../../lib/format";
import { NoData } from "./no-data";

/** The score components (each 0..1 for Lowkey) in a table, so the score stays explainable. */
export function ScoreBreakdown({ components }: { components: Record<string, number> }) {
  const entries = Object.entries(components);
  if (entries.length === 0) return <NoData />;
  return (
    <div className="gm-table-wrap">
      <table className="gm-table">
        <thead>
          <tr>
            <th scope="col">component</th>
            <th scope="col" className="num">
              value
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([name, value]) => (
            <tr key={name}>
              <td className="gm-mono">{name}</td>
              <td className="gm-mono num">{formatScore(value) ?? <NoData />}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
