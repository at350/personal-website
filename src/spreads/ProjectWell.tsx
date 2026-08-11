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

/** Pages 10–11 — the well: Architec verso, GreenChain recto, mirrored. */
export function ProjectWell({ face, mode }: SpreadFaceProps) {
  const project = face === "verso" ? projects[0] : projects[1];
  const rest = projects.slice(2);
  const no = face === "verso" ? "01" : "02";

  return (
    <article className="proj-feature" data-face={face} data-mode={mode}>
      {face === "verso" && <Plate project={project} />}

      <header className="proj-feature__head">
        <p className="proj-feature__no" aria-hidden>
          {no}
        </p>
        <div className="proj-feature__title">
          <h2 className="proj-feature__name">{project.name}</h2>
          <p className="proj-feature__meta mono-label">
            {project.discipline} · {project.year}
          </p>
        </div>
      </header>

      <p className="proj-feature__summary">{project.summary}</p>

      <p className="proj-feature__stack mono-label">
        {project.stack.join(" · ")}
      </p>


      {project.recognition && (
        <p className="proj-feature__recognition">
          <span className="proj-star" aria-hidden></span>{" "}
          {project.recognition}
        </p>
      )}

      {project.link && (
        <a
          className="proj-feature__link mono-label"
          href={project.link.href}
          target="_blank"
          rel="noopener noreferrer"
        >
          {project.link.label} ↗
        </a>
      )}

      {face === "recto" && (
        <>
          <Plate project={project} />

          <footer className="proj-rest">
            <ul className="proj-rest__list">
              {rest.map((p, i) => (
                <li key={p.id} className="proj-rest__entry mono-label">
                  <span className="proj-rest__no" aria-hidden>
                    {String(i + 3).padStart(2, "0")}
                  </span>
                  {p.name} · {p.discipline}
                </li>
              ))}
            </ul>
          </footer>
        </>
      )}
    </article>
  );
}

function Plate({ project }: { project: Project }) {
  if (!project.image) return null;
  return (
    <figure className="proj-feature__plate">
      <img
        className="proj-feature__img"
        src={project.image}
        alt={PLATE_ALT[project.id] ?? `${project.name} project image.`}
        loading="lazy"
        decoding="async"
      />
    </figure>
  );
}
