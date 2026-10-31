import type { ReactNode } from "react";

/** A missing value: "no data" in --text-dim, never 0. */
export function NoData() {
  return <span className="gm-nodata">no data</span>;
}

/** Shows `text`, or "no data" when it is null. */
export function OrNoData({ text }: { text: string | null }): ReactNode {
  return text === null ? <NoData /> : text;
}

export function WarnIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M8 2 15 14H1L8 2Z" strokeLinejoin="round" />
      <path d="M8 6.5v3.5M8 12v.01" strokeLinecap="round" />
    </svg>
  );
}
