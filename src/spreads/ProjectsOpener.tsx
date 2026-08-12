import { useId, useRef, useState } from "react";
import type { SpreadFaceProps } from "@/magazine/spread-types";
import { ProjectTechnologyList } from "@/components/ProjectTechnologyList";
import { projects } from "@/lib/content";
import { withBasePath } from "@/lib/basePath";
import "@/styles/spreads/projects.css";

/** Pages 8–9 — the count, then the index. */
export function ProjectsOpener({ face, mode }: SpreadFaceProps) {
  return face === "verso" ? <Count /> : <Index mode={mode} />;
}

/* p.8 — the numeral is the page. */
function Count() {
  const visiblePlates = projects.slice(0, 5);

  return (
    <div className="proj-count">
      <h2
        className="proj-count__word"
        aria-label={`${projects.length} project files`}
      >
        {String(projects.length).padStart(2, "0")}
      </h2>
      <p className="proj-count__sub">project files</p>
      <ol className="proj-count__plates" aria-label="Project image index">
        {visiblePlates.map((project, index) => (
          <li className="proj-count__plate" key={project.id}>
            {project.image ? (
              <img
                src={withBasePath(project.image.src)}
                alt=""
                decoding="async"
              />
            ) : null}
            <span className="proj-count__plate-no" aria-hidden>
              {String(index + 1).padStart(2, "0")}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* p.9 — the index. Rows expand in place; one open at a time.
   Pointer hover previews; activation pins for mouse, touch, and keyboard. */
function Index({ mode }: { mode: "book" | "reader" }) {
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const baseId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  const openId = pinnedId ?? hoverId;

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
      <p className="proj-index__eyebrow mono-label">
        {String(projects.length).padStart(2, "0")} files / select to read
      </p>
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
                >
                  <span className="proj-index__no" aria-hidden>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="proj-index__name">{project.name}</span>
                  <span className="proj-index__meta mono-label">
                    {project.discipline} · {project.year}
                  </span>
                  <span className="proj-index__toggle mono-label" aria-hidden>
                    {open ? "−" : "+"}
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
                  {open && project.featureOrder === undefined && (
                    <>
                      <p className="proj-index__detail">{project.detail}</p>

                      <ProjectTechnologyList
                        items={project.stack}
                        label={`${project.name} technologies and methods`}
                      />

                      {project.recognition && (
                        <p className="proj-index__recognition">
                          <span className="proj-star" aria-hidden></span>{" "}
                          {project.recognition}
                        </p>
                      )}

                      {project.links && (
                        <div
                          className="proj-index__links"
                          aria-label={`${project.name} links`}
                        >
                          {project.links.map((link) => (
                            <a
                              key={`${link.kind}-${link.href}`}
                              className="proj-index__link mono-label"
                              href={link.href}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label={`${link.label} for ${project.name} (opens in a new tab)`}
                            >
                              {link.label} ↗
                            </a>
                          ))}
                        </div>
                      )}
                    </>
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
