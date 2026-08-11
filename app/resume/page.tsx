import type { Metadata } from "next";
import { ResumeRow } from "@/components/ResumeRow";
import { resume } from "@/lib/content";

export const metadata: Metadata = {
  title: "Resume",
  description: "Alan Tai's resume, with optional notes in the margins.",
};

export default function ResumePage() {
  return (
    <main id="main-content" className="page-shell resume-page">
      <header className="page-hero resume-hero">
        <div>
          <p className="page-hero__index">12 / Annotated resume</p>
          <h1 className="page-hero__title">Resume</h1>
        </div>
        <div>
          <p className="page-hero__lede">{resume.introduction}</p>
          <p className="resume-hero__instruction">
            Hover, tap, or focus any red ✳ note to open the margin.
          </p>
        </div>
      </header>

      <section className="resume-education" aria-labelledby="education-title">
        <p className="eyebrow" id="education-title">Education</p>
        {resume.education.map((item) => (
          <article key={item.institution}>
            <div>
              <h2>{item.institution}</h2>
              <p>{item.program}</p>
            </div>
            <div>
              <span>{item.location}</span>
              {item.details.map((detail) => <span key={detail}>{detail}</span>)}
            </div>
          </article>
        ))}
      </section>

      <section className="resume-ledger" aria-label="Experience">
        {resume.entries.map((entry, index) => (
          <ResumeRow entry={entry} index={index} key={entry.id} />
        ))}
      </section>

      <section className="recognition" aria-labelledby="recognition-title">
        <div className="section-rule">
          <span className="section-index">16</span>
          <h2 id="recognition-title">Recognition</h2>
          <span className="eyebrow">A few very good days</span>
        </div>
        <div className="recognition__grid">
          {resume.recognition.map((item, index) => (
            <article key={item.title}>
              <span>0{index + 1}</span>
              <h3>{item.title}</h3>
              <p>{item.issuer} / {item.year}</p>
              <p>{item.note}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
