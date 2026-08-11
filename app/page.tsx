import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Magazine } from "@/components/Magazine";
import { about, dispatches, projects, resume, siteMeta } from "@/lib/content";

export const metadata: Metadata = {
  title: "Field Notes, Issue 01",
  description: siteMeta.description,
};

export default function Home() {
  return (
    <main id="main-content">
      <Magazine />

      <section className="reader-intro page-shell" aria-labelledby="reader-title">
        <div className="reader-intro__meta">
          <p className="eyebrow">Reader’s cut / no page turning required</p>
          <span className="registration-mark" aria-hidden="true">+</span>
        </div>
        <div className="reader-intro__statement">
          <h1 id="reader-title">
            I make things that <em>work</em>, then ask why they matter.
          </h1>
          <p>{siteMeta.intro}</p>
        </div>
      </section>

      <section className="home-about page-shell" aria-labelledby="home-about-title">
        <div className="section-rule">
          <span className="section-index">02</span>
          <h2 id="home-about-title">Notes from the editor</h2>
          <Link className="text-link" href="/about">
            Full story <span aria-hidden="true">↗</span>
          </Link>
        </div>
        <div className="home-about__grid">
          <div className="home-about__copy">
            <p className="home-about__lead">{about.heading}</p>
            <p>{about.lede}</p>
            <p>{about.paragraphs[1]}</p>
          </div>
          <figure className="home-about__photo home-about__photo--tall">
            <Image
              src="/images/about/alan-great-wall.webp"
              alt="Alan on the Great Wall"
              fill
              sizes="(max-width: 736px) 90vw, 32vw"
            />
            <figcaption>{about.photos[2].caption}</figcaption>
          </figure>
          <figure className="home-about__photo home-about__photo--small">
            <Image
              src="/images/about/alan-mountain.webp"
              alt="Alan at a mountain lookout near Hangzhou"
              fill
              sizes="(max-width: 736px) 42vw, 17vw"
            />
            <figcaption>{about.photos[3].caption}</figcaption>
          </figure>
          <blockquote className="home-about__quote">
            “{about.pullQuote}”
          </blockquote>
        </div>
      </section>

      <section className="home-projects page-shell" aria-labelledby="home-projects-title">
        <div className="section-rule">
          <span className="section-index">06</span>
          <h2 id="home-projects-title">Selected projects</h2>
          <Link className="text-link" href="/projects">
            Project index <span aria-hidden="true">↗</span>
          </Link>
        </div>
        <div className="home-projects__grid">
          {projects.slice(0, 3).map((project, index) => (
            <article className={`home-project-card home-project-card--${index + 1}`} key={project.id}>
              <div className="home-project-card__meta">
                <span>0{index + 1}</span>
                <span>{project.discipline}</span>
                <span>{project.year}</span>
              </div>
              <h3>{project.name}</h3>
              <p>{project.summary}</p>
              <ul aria-label={`${project.name} tools`}>
                {project.stack.slice(0, 3).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="home-resume" aria-labelledby="home-resume-title">
        <div className="page-shell">
          <div className="section-rule section-rule--light">
            <span className="section-index">12</span>
            <h2 id="home-resume-title">What I am doing now</h2>
            <Link className="text-link" href="/resume">
              Annotated resume <span aria-hidden="true">↗</span>
            </Link>
          </div>
          <div className="home-resume__list">
            {resume.entries.slice(0, 4).map((entry, index) => (
              <article key={entry.id}>
                <span>0{index + 1}</span>
                <div>
                  <h3>{entry.organization}</h3>
                  <p>{entry.role}</p>
                </div>
                <p>{entry.summary}</p>
                <time>{entry.dates}</time>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="home-dispatches page-shell" aria-labelledby="home-dispatches-title">
        <div className="section-rule">
          <span className="section-index">22</span>
          <h2 id="home-dispatches-title">Dispatches</h2>
          <Link className="text-link" href="/writing">
            Writing index <span aria-hidden="true">↗</span>
          </Link>
        </div>
        <div className="home-dispatches__grid">
          <div className="home-dispatches__intro">
            <p className="eyebrow">A blog, still taking shape</p>
            <p>
              Longer notes on products, systems, reporting, and whichever rabbit
              hole was convincing enough to deserve a clean page.
            </p>
          </div>
          {dispatches.map((dispatch, index) => (
            <article className="dispatch-card" key={dispatch.id}>
              <div>
                <span>00{index + 1}</span>
                <span>{dispatch.status}</span>
              </div>
              <h3>
                <Link href={`/writing/${dispatch.id}`}>{dispatch.title}</Link>
              </h3>
              <p>{dispatch.dek}</p>
              <Link className="text-link" href={`/writing/${dispatch.id}`}>
                Read note <span aria-hidden="true">↗</span>
              </Link>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
