import { RepoDetail } from "../../_components/repo-detail";

export default async function RepoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RepoDetail id={id} />;
}
