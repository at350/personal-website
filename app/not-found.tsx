import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main-content" className="page-shell not-found-page">
      <span>404 / Loose leaf</span>
      <h1>This page slipped out of the binding.</h1>
      <p>The rest of the issue is still intact.</p>
      <Link className="text-link" href="/">
        Return to the cover <span aria-hidden="true">↗</span>
      </Link>
    </main>
  );
}
