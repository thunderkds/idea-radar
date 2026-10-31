import Link from "next/link";

export default function NotFound() {
  return (
    <header className="page-head">
      <p className="gm-eyebrow">&gt; 404</p>
      <h1 className="page-title">Not found</h1>
      <p className="lede">
        This page does not exist. <Link className="gm-link" href="/">Back to Lowkey repos</Link>
      </p>
    </header>
  );
}
