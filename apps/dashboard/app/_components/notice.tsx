import type { ReactNode } from "react";
import { WarnIcon } from "./no-data";

/** A warning notice (gm-notice--warn). Used for API errors, so it is announced as an alert. */
export function Notice({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="gm-notice gm-notice--warn" role="alert">
      <WarnIcon />
      <div>
        <strong>{title}</strong>
        {children ? <div>{children}</div> : null}
      </div>
    </div>
  );
}
