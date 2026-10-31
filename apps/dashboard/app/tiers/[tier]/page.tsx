import { notFound } from "next/navigation";
import { parseTierFilters } from "../../../lib/query";
import { isTier } from "../../../lib/types";
import { TierPage } from "../../_components/tier-page";

export default async function Tier({
  params,
  searchParams,
}: {
  params: Promise<{ tier: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { tier } = await params;
  if (!isTier(tier)) notFound();
  return <TierPage tier={tier} filters={parseTierFilters(await searchParams)} />;
}
