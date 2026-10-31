import { parseTierFilters } from "../lib/query";
import { TierPage } from "./_components/tier-page";

// Lowkey is the default landing view (docs/SPEC.md, Dashboard views).
export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <TierPage tier="lowkey" filters={parseTierFilters(await searchParams)} />;
}
