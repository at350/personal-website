import type { SpreadFaceProps } from "@/magazine/spread-types";
import type { Project } from "@/lib/content-types";
import { projects } from "@/lib/content";
import "@/styles/spreads/projects.css";

/** Alt text written from the actual plates. */
const PLATE_ALT: Record<string, string> = {
  architec:
    "Architec's landing page: the headline 'Your building is wasting $200,000 a year' over a night skyline, beside an audit panel of ranked upgrades.",
  greenchain:
    "The GreenChain wordmark, half dark and half green lowercase type, on a pale ground with leaf outlines.",
};

/** Pages 10–11 — the project well: Architec verso, GreenChain recto. */
export function ProjectWell({ face, mode }: SpreadFaceProps) {
  const project = face === "verso" ? projects[0] : projects[1];
  const alsoInWorkshop = projects.slice(2);

  return (
    <div className="proj-well" data-face={face} data-mode={mode}>
      {face === "verso" && <ProjectPlate project={project} bleed />}

      <header className="proj-well__head">
        <p className="proj-well__meta mono-label">
          {project.discipline} · {project.year}
        </p>
        <h2 className="proj-well__name">{project.name}</h2>
      </header>

      <p className="proj-well__summary">{project.summary}</p>
      <p className="proj-well__detail">{project.detail}</p>
      <p className="proj-well__stack mono-label">{project.stack.join(" · ")}</p>

      {project.recognition && (
        <p className="proj-well__recognition">
          <span className="proj-star" aria-hidden>
            ✳
          </span>{" "}
          {project.recognition}
        </p>
      )}

      {project.link && (
        <a
          className="proj-well__link mono-label"
          href={project.link.href}
          target="_blank"
          rel="noopener noreferrer"
        >
          {project.link.label} ↗
        </a>
      )}

      {face === "recto" && (
        <>
          <ProjectPlate project={project} />

          <footer className="proj-workshop">
            <p className="proj-workshop__eyebrow mono-label">
              ALSO IN THE WORKSHOP:
            </p>
            <ul className="proj-workshop__list">
              {alsoInWorkshop.map((p) => (
                <li key={p.id} className="proj-workshop__entry mono-label">
                  {p.name} — {p.discipline}
                </li>
              ))}
            </ul>
          </footer>
        </>
      )}
    </div>
  );
}

function ProjectPlate({ project, bleed }: { project: Project; bleed?: boolean }) {
  if (!project.image) return null;
  return (
    <figure
      className={`proj-well__plate${bleed ? " proj-well__plate--bleed" : ""}`}
    >
      <img
        className="proj-well__img"
        src={project.image}
        alt={PLATE_ALT[project.id] ?? `${project.name} project image.`}
        loading="lazy"
        decoding="async"
      />
    </figure>
  );
}
