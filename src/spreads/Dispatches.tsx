import { Link } from "react-router";
import type { SpreadFaceProps } from "@/magazine/spread-types";
import { dispatches } from "@/lib/content";
import "@/styles/spreads/dispatches.css";

/* Verso (p. 16): two dispatches as numbered editorial entries.
   Signature interaction: the mono jump line draws a red underline. */
function DispatchIndex() {
  return (
    <div className="dispatches" data-face="verso">
      <div className="dispatches__entries">
        {dispatches.map((d, index) => (
          <article className="dispatches__entry" key={d.id}>
            <span className="dispatches__no" aria-hidden>
              {String(index + 1).padStart(2, "0")}
            </span>
            <div className="dispatches__text">
              {d.status !== "Site sample" && (
                <p className="dispatches__status mono-label">{d.status}</p>
              )}
              <h3 className="dispatches__title">{d.title}</h3>
              <p className="dispatches__dek">{d.dek}</p>
              <Link className="dispatches__jump" to={`/writing/${d.id}`}>
                read dispatch
              </Link>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

/* Recto (p. 17): one line, then paper. */
function DispatchCredo() {
  return (
    <div className="dispatches" data-face="recto">
      <p className="dispatches__credo">Some notes belong on paper you own.</p>
      <span className="dispatches__asterisk" aria-hidden>
        &#10035;
      </span>
    </div>
  );
}

export function Dispatches({ face }: SpreadFaceProps) {
  return face === "verso" ? <DispatchIndex /> : <DispatchCredo />;
}
