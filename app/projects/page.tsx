import type { Metadata } from "next";
import Image from "next/image";
import { projects } from "@/lib/content";

export const metadata: Metadata = {
  title: "Projects",
  description: "Five projects across energy, supply chains, public health, strategy, and accessibility.",
};

const projectImages: Record<string, { src: string; alt: string } | undefined> = {
  architec: {
    src: "/images/projects/architec.webp",
    alt: "Architec energy audit interface over a city skyline",
  },
  greenchain: {
    src: "/images/projects/greenchain.webp",
    alt: "GreenChain wordmark on a light green background",
  },
};

export default function ProjectsPage() {
  return (
    <main id="main-content" className="page-shell">
      <header className="page-hero project-hero">
        <div>
          <p className="page-hero__index">06 / Selected work</p>
          <h1 className="page-hero__title">Projects</h1>
        </div>
        <p className="page-hero__lede">
          Five attempts to make a messy system more legible. The domains change.
          The habit of building the whole loop does not.
        </p>
      </header>

      <section className="project-ledger" aria-label="Project index">
        {projects.map((project, index) => {
          const image = projectImages[project.id];
          return (
            <article className={`project-feature project-feature--${index + 1}`} key={project.id}>
              <div className="project-feature__rail">
                <span>{String(index + 1).padStart(2, "0")}</span>
                <span>{project.discipline}</span>
                <span>{project.year}</span>
              </div>
              <div className="project-feature__title">
                <h2>{project.name}</h2>
                {project.recognition ? <p>{project.recognition}</p> : null}
              </div>
              {image ? (
                <figure className="project-feature__image">
                  <Image src={image.src} alt={image.alt} fill sizes="(max-width: 736px) 94vw, 54vw" />
                </figure>
              ) : (
                <div className="project-feature__specimen" aria-hidden="true">
                  <span>{project.name.slice(0, 1)}</span>
                  <i />
                  <b>{String(index + 1).padStart(2, "0")}</b>
                </div>
              )}
              <div className="project-feature__copy">
                <p className="project-feature__summary">{project.summary}</p>
                <p>{project.detail}</p>
                <ul aria-label={`${project.name} tools`}>
                  {project.stack.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                {project.link ? (
                  <a className="text-link" href={project.link.href} target="_blank" rel="noreferrer">
                    {project.link.label} <span aria-hidden="true">↗</span>
                  </a>
                ) : null}
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
}
