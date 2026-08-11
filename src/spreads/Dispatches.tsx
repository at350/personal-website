import { Link } from "react-router";
import type { SpreadFaceProps } from "@/magazine/spread-types";
import { dispatches } from "@/lib/content";
import { SealMark } from "@/components/furniture/SealMark";
import "@/styles/spreads/dispatches.css";

/** Verso (p. 16): the blog index as FOB shorts. */
function DispatchIndex() {
  return (
    <div className="dispatches" data-face="verso">
      <p className="dispatches__eyebrow mono-label">
        DISPATCHES — occasional writing
      </p>

      <div className="dispatches__list">
        {dispatches.map((d) => (
          <article className="dispatches__item" key={d.id}>
            <span className="dispatches__stamp mono-label">{d.status}</span>
            <h3 className="dispatches__title">{d.title}</h3>
            <p className="dispatches__dek">{d.dek}</p>
            <Link
              className="dispatches__jump mono-label"
              to={`/writing/${d.id}`}
            >
              READ — VIA /writing/{d.id}
            </Link>
          </article>
        ))}
      </div>
    </div>
  );
}

/** Recto (p. 17): a quiet manifesto, then deliberate emptiness. */
function DispatchManifesto() {
  return (
    <div className="dispatches" data-face="recto">
      <div className="dispatches__manifesto">
        <p className="dispatches__eyebrow mono-label">Why write here?</p>
        <p className="dispatches__credo">Some notes belong on paper you own.</p>
        <p className="dispatches__footnote mono-label">
          longer dispatches will also land on substack, eventually.
        </p>
      </div>

      <div className="dispatches__quiet">
        <SealMark className="dispatches__seal" />
        <p className="dispatches__next mono-label">
          letters to the editor — p. 18
        </p>
      </div>
    </div>
  );
}

export function Dispatches({ face }: SpreadFaceProps) {
  return face === "verso" ? <DispatchIndex /> : <DispatchManifesto />;
}
