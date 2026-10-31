import Link from "next/link";
import { tierPath } from "../../lib/query";
import { TIERS, type Tier } from "../../lib/types";

export function TierTabs({ active }: { active: Tier }) {
  return (
    <nav className="tabs" aria-label="Tiers">
      {TIERS.map((t) => (
        <Link key={t.id} href={tierPath(t.id)} aria-current={t.id === active ? "page" : undefined}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
