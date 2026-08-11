import { useId, useRef, useState } from "react";
import type { SpreadFaceProps } from "@/magazine/spread-types";
import { projects } from "@/lib/content";
import "@/styles/spreads/projects.css";

/** Pages 8–9 — FEATURES: the curtain-raiser and the project index. */
export function ProjectsOpener({ face, mode }: SpreadFaceProps) {
  return face === "verso" ? (
    <OpenerVerso face={face} />
  ) : (
    <OpenerRecto face={face} mode={mode} />
  );
}

/* Page 8 — display type only, full washi. Ma is the design. */
function OpenerVerso({ face }: { face: "verso" | "recto" }) {
  return (
    <div className="features-opener" data-face={face}>
      <p className="features-opener__eyebrow mono-label">FEATURES</p>

      <h2 className="features-opener__display">
        <span className="features-opener__line">Five working</span>
        <span className="features-opener__line features-opener__line--offset">
          prototypes.
        </span>
      </h2>

      <p className="features-opener__footnote mono-label">
        hackathons, research, and other short weekends
      </p>
    </div>
  );
}

/* Page 9 — the typographic index. Hover/focus previews; click pins. */
function OpenerRecto({
  face,
  mode,
}: {
  face: "verso" | "recto";
  mode: "book" | "reader";
}) {
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  const shownId = pinnedId ?? hoverId;
  const shown = projects.find((p) => p.id === shownId) ?? null;

  return (
    <div
      className="feature-index"
      data-face={face}
      data-mode={mode}
      ref={rootRef}
      /* Preview persists while the pointer or focus stays anywhere in the
         index — so the card (and its link) can actually be reached. */
      onPointerLeave={() => setHoverId(null)}
      onBlur={(e) => {
        if (!rootRef.current?.contains(e.relatedTarget as Node | null)) {
          setHoverId(null);
        }
      }}
    >
      <ol className="feature-index__list">
        {projects.map((project, i) => (
          <li key={project.id} className="feature-index__item">
            <button
              type="button"
              className="feature-index__row"
              aria-expanded={pinnedId === project.id}
              aria-controls={panelId}
              data-active={shown?.id === project.id || undefined}
              onClick={() =>
                setPinnedId((v) => (v === project.id ? null : project.id))
              }
              onPointerEnter={() => setHoverId(project.id)}
              onFocus={() => setHoverId(project.id)}
            >
              <span className="feature-index__no mono-label">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="feature-index__name">{project.name}</span>
              <span className="feature-index__meta mono-label">
                {project.discipline} · {project.year}
              </span>
            </button>
          </li>
        ))}
      </ol>

      <div className="feature-index__panel" id={panelId}>
        {shown && (
          <div className="feature-index__card" key={shown.id}>
            <p className="feature-index__summary">{shown.summary}</p>

            <ul
              className="feature-index__chips"
              aria-label={`${shown.name} stack`}
            >
              {shown.stack.map((item) => (
                <li key={item} className="feature-index__chip mono-label">
                  {item}
                </li>
              ))}
            </ul>

            {shown.recognition && (
              <p className="feature-index__recognition">
                <span className="proj-star" aria-hidden>
                  ✳
                </span>{" "}
                {shown.recognition}
              </p>
            )}

            {shown.link && (
              <a
                className="feature-index__link mono-label"
                href={shown.link.href}
                target="_blank"
                rel="noopener noreferrer"
              >
                {shown.link.label} ↗
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
