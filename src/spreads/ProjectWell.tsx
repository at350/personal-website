import { Link } from "react-router";
import type { SpreadFaceProps } from "@/magazine/spread-types";
import type { Project } from "@/lib/content-types";
import { ProjectTechnologyList } from "@/components/ProjectTechnologyList";
import { projects } from "@/lib/content";
import { withBasePath } from "@/lib/basePath";
import "@/styles/spreads/projects.css";

const featuredProjects = [...projects]
  .filter((project) => project.featureOrder !== undefined)
  .sort((a, b) => a.featureOrder! - b.featureOrder!);

/** Pages 10–11 — the well: Architec verso, GreenChain recto, mirrored. */
export function ProjectWell({ face, mode }: SpreadFaceProps) {
  const featureIndex = face === "verso" ? 0 : 1;
  const project = featuredProjects[featureIndex];
  if (!project) return null;

  const no = String(project.featureOrder).padStart(2, "0");

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

      <p className="proj-feature__summary">{project.detail}</p>

      <ProjectTechnologyList
        items={project.stack}
        label={`${project.name} technologies`}
        className="proj-feature__stack"
      />
      {project.recognition && (
        <p className="proj-feature__recognition">
          <span className="proj-star" aria-hidden></span>{" "}
          {project.recognition}
        </p>
      )}

      {project.links && (
        <div
          className="proj-feature__links"
          aria-label={`${project.name} links`}
        >
          {project.links.map((link) => (
            <a
              key={`${link.kind}-${link.href}`}
              className="proj-feature__link mono-label"
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

      {face === "recto" && (
        <>
          <Plate project={project} />
          <footer className="proj-rest">
            <Link className="proj-rest__all mono-label" to="/projects">
              All {projects.length} project files / p.09 ←
            </Link>
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
        src={withBasePath(project.image.src)}
        alt={project.image.alt}
        loading="lazy"
        decoding="async"
      />
    </figure>
  );
}
