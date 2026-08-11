import { Link, useParams } from "react-router";
import { dispatches } from "@/lib/content";
import { EndMark } from "@/components/furniture/EndMark";
import { NotFound } from "./NotFound";
import "@/styles/routes.css";

/** A dispatch as its own quiet reading page, laid over the void. */
export function WritingPage() {
  const { slug } = useParams();
  const dispatch = dispatches.find((d) => d.id === slug);
  if (!dispatch) return <NotFound />;

  return (
    <main className="reading">
      <article className="reading__column">
        <p className="mono-label reading__eyebrow">{dispatch.label}</p>
        <h1 className="reading__title">{dispatch.title}</h1>
        <p className="reading__dek">{dispatch.dek}</p>
        <hr className="rule" />
        {dispatch.body.map((paragraph, i) => (
          <p key={i} className={i === 0 ? "drop-cap" : undefined}>
            {paragraph}
            {i === dispatch.body.length - 1 ? <EndMark /> : null}
          </p>
        ))}
        <footer className="reading__footer">
          <Link to="/writing" className="mono-label">
            ← return to the issue
          </Link>
        </footer>
      </article>
    </main>
  );
}
