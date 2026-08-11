import { Link } from "react-router";
import "@/styles/routes.css";

export function NotFound() {
  return (
    <main className="lost">
      <p className="lost__folio mono-label">P. 404</p>
      <h1 className="lost__title">This page fell out of the binding.</h1>
      <Link to="/" className="mono-label lost__home">
        ← cover
      </Link>
    </main>
  );
}
