import type { Metadata } from "next";
import Image from "next/image";
import { about } from "@/lib/content";

export const metadata: Metadata = {
  title: "About",
  description: "A candid introduction to Alan Tai, with a few field photos.",
};

export default function AboutPage() {
  return (
    <main id="main-content" className="page-shell">
      <header className="page-hero about-hero">
        <div>
          <p className="page-hero__index">02 / Notes from the editor</p>
          <h1 className="page-hero__title">About</h1>
        </div>
        <p className="page-hero__lede">{about.lede}</p>
      </header>

      <section className="about-story" aria-labelledby="about-story-title">
        <div className="about-story__lead">
          <h2 id="about-story-title">{about.heading}</h2>
          <p>{about.paragraphs[0]}</p>
          <p>{about.paragraphs[1]}</p>
        </div>
        <figure className="about-story__portrait">
          <Image
            src="/images/about/alan-headshot.webp"
            alt={about.photos[0].alt}
            fill
            priority
            sizes="(max-width: 736px) 88vw, 34vw"
          />
          <figcaption>{about.photos[0].caption}</figcaption>
        </figure>
        <blockquote>“{about.pullQuote}”</blockquote>
      </section>

      <section className="about-notes" aria-labelledby="about-notes-title">
        <div className="section-rule">
          <span className="section-index">04</span>
          <h2 id="about-notes-title">Small facts, strong opinions</h2>
          <span className="eyebrow">Filed in no particular order</span>
        </div>
        <div className="about-notes__grid">
          {about.notes.map((note, index) => (
            <article key={note.label}>
              <span>0{index + 1}</span>
              <h3>{note.label}</h3>
              <p>{note.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="contact-sheet" aria-labelledby="contact-sheet-title">
        <div className="section-rule">
          <span className="section-index">05</span>
          <h2 id="contact-sheet-title">Contact sheet</h2>
          <span className="eyebrow">China / Summer 2026</span>
        </div>
        <div className="contact-sheet__grid">
          {about.photos.slice(1).map((photo, index) => (
            <figure className={`contact-photo contact-photo--${index + 1}`} key={photo.src}>
              <Image src={photo.src} alt={photo.alt} fill sizes="(max-width: 736px) 90vw, 32vw" />
              <figcaption>
                <span>{String(index + 1).padStart(2, "0")}</span>
                {photo.caption}
              </figcaption>
            </figure>
          ))}
        </div>
      </section>
    </main>
  );
}
