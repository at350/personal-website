import type { SpreadFaceProps } from "@/magazine/spread-types";
import type { Project } from "@/lib/content-types";
import { projects } from "@/lib/content";
import { withBasePath } from "@/lib/basePath";
import "@/styles/spreads/projects.css";

/** Alt text written from the actual plates. */
const PLATE_ALT: Record<string, string> = {
  architec:
    "Conceptual Architec study with layered architectural planes, a black building volume, and a red translucent energy plane.",
  greenchain:
    "Conceptual GreenChain study with black paper nodes, taut threads, white platforms, and one red route through the network.",
  prophis:
    "Conceptual Prophis study with layered vellum timelines aligned by a red acetate tab.",
  "vox-vera":
    "Conceptual Vox Vera study with black paper channels and white tokens converging on a red crop frame.",
  terrablade:
    "Conceptual TerraBlade study with a pale clay slab, black guide rails, and a broad red pulling grip.",
};

/** Pages 10–11 — the well: Architec verso, GreenChain recto, mirrored. */
export function ProjectWell({ face, mode }: SpreadFaceProps) {
  const project = face === "verso" ? projects[0] : projects[1];
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

      <p className="proj-feature__summary">{project.detail}</p>
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
        <Plate project={project} />
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
        src={withBasePath(project.image)}
        alt={PLATE_ALT[project.id] ?? `${project.name} project image.`}
        loading="lazy"
        decoding="async"
      />
    </figure>
  );
}
