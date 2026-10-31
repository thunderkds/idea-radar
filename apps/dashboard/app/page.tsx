const TIERS = [
  { id: "lowkey", label: "Lowkey", blurb: "Under ~200 stars, active, growing faster than their own baseline" },
  { id: "medium", label: "Medium", blurb: "Steady growth over several weeks" },
  { id: "trending", label: "Trending", blurb: "Top star velocity and flagged by trending sources" },
] as const;

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

async function loadTier(tier: string): Promise<{ items: unknown[] }> {
  try {
    const res = await fetch(`${API}/tiers/${tier}`, { cache: "no-store" });
    if (!res.ok) return { items: [] };
    return (await res.json()) as { items: unknown[] };
  } catch {
    return { items: [] };
  }
}

export default async function Home() {
  // Lowkey is the default landing view (see spec → Dashboard views). HUN-157.
  const lowkey = await loadTier("lowkey");
  return (
    <main>
      <h1>Idea Radar</h1>
      <nav style={{ display: "flex", gap: 16, marginBottom: 24 }}>
        {TIERS.map((t) => (
          <span key={t.id} title={t.blurb}>
            {t.label}
          </span>
        ))}
      </nav>
      <p>
        {lowkey.items.length === 0
          ? "No scored repos yet — run the worker and scoring job first."
          : `${lowkey.items.length} lowkey repos`}
      </p>
    </main>
  );
}
