import { useId, useRef, useState } from "react";
import type { SpreadFaceProps } from "@/magazine/spread-types";
import { projects } from "@/lib/content";
import "@/styles/spreads/projects.css";

/** Pages 8–9 — the count, then the index. */
export function ProjectsOpener({ face, mode }: SpreadFaceProps) {
  return face === "verso" ? <Count /> : <Index mode={mode} />;
}

/* p.8 — the numeral is the page. */
function Count() {
  return (
    <div className="proj-count">
      <h2 className="proj-count__word">FIVE</h2>
      <p className="proj-count__sub">working prototypes</p>
    </div>
  );
}

/* p.9 — the index. Rows expand in place; one open at a time.
   Hover and focus preview, click pins. */
function Index({ mode }: { mode: "book" | "reader" }) {
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const baseId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  const openId = hoverId ?? pinnedId;

  return (
    <div
      className="proj-index"
      data-mode={mode}
      ref={rootRef}
      onPointerLeave={() => setHoverId(null)}
      onBlur={(e) => {
        if (!rootRef.current?.contains(e.relatedTarget as Node | null)) {
          setHoverId(null);
        }
      }}
    >
      <ol className="proj-index__list">
        {projects.map((project, i) => {
          const open = openId === project.id;
          const rowId = `${baseId}-${project.id}-row`;
          const panelId = `${baseId}-${project.id}-panel`;
          return (
            <li
              key={project.id}
              className="proj-index__item"
              data-open={open || undefined}
            >
              <h3 className="proj-index__h">
                <button
                  type="button"
                  id={rowId}
                  className="proj-index__row"
                  aria-expanded={open}
                  aria-controls={panelId}
                  onClick={() =>
                    setPinnedId((v) => (v === project.id ? null : project.id))
                  }
                  onPointerEnter={() => setHoverId(project.id)}
                  onFocus={() => setHoverId(project.id)}
                >
                  <span className="proj-index__no" aria-hidden>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="proj-index__name">{project.name}</span>
                  <span className="proj-index__meta mono-label">
                    {project.discipline} · {project.year}
                  </span>
                </button>
              </h3>

              <div
                id={panelId}
                className="proj-index__reveal"
                role="region"
                aria-labelledby={rowId}
                inert={!open}
              >
                <div className="proj-index__body">
                  <p className="proj-index__summary">{project.summary}</p>

                  <ul
                    className="proj-index__chips"
                    aria-label={`${project.name} stack`}
                  >
                    {project.stack.map((item) => (
                      <li key={item} className="proj-index__chip mono-label">
                        {item}
                      </li>
                    ))}
                  </ul>

                  {project.recognition && (
                    <p className="proj-index__recognition">
                      <span className="proj-star" aria-hidden></span>{" "}
                      {project.recognition}
                    </p>
                  )}

                  {project.link && (
                    <a
                      className="proj-index__link mono-label"
                      href={project.link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {project.link.label} ↗
                    </a>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
