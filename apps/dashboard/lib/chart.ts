export interface Bar {
  x: number;
  y: number;
  width: number;
  height: number;
  date: string;
  value: number;
  current: boolean;
}

/** Fixed unit space for the star chart: each bar is 10 units wide with a 2 unit gap; the last bar is the current one. */
export const CHART_HEIGHT = 100;
const SLOT = 10;
const GAP = 2;

export function chartWidth(count: number): number {
  return Math.max(count, 1) * SLOT;
}

export function barGeometry(series: { date: string; starsNew: number }[]): Bar[] {
  const max = Math.max(1, ...series.map((p) => p.starsNew));
  return series.map((p, i) => {
    // A day with stars keeps at least 2 units of height so it stays visible next to a big day.
    const height = p.starsNew > 0 ? Math.max(2, (p.starsNew / max) * CHART_HEIGHT) : 0;
    return {
      x: i * SLOT,
      y: CHART_HEIGHT - height,
      width: SLOT - GAP,
      height,
      date: p.date,
      value: p.starsNew,
      current: i === series.length - 1,
    };
  });
}
