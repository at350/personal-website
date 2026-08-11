import type { SpreadFaceProps } from "@/magazine/spread-types";
import type { ResumeEntry } from "@/lib/content-types";
import { resume } from "@/lib/content";
import { Marginalia } from "@/components/furniture/Marginalia";
import { EndMark } from "@/components/furniture/EndMark";
import "@/styles/spreads/resume.css";

const byKind = (kind: ResumeEntry["kind"]) =>
  resume.entries.filter((entry) => entry.kind === kind);

interface LedgerGroupProps {
  label: string;
  entries: readonly ResumeEntry[];
  /** Verso rows open their margin notes into the outer (left) margin. */
  notesLeft?: boolean;
}

function LedgerGroup({ label, entries, notesLeft }: LedgerGroupProps) {
  return (
    <section className="resume__group" aria-label={label}>
      <h3 className="resume__group-label mono-label">{label}</h3>
      <ul className="resume__rows">
        {entries.map((entry) => (
          <li
            key={entry.id}
            className={
              notesLeft
                ? "resume__row resume__row--notes-left"
                : "resume__row"
            }
          >
            <span className="resume__margin">
              <Marginalia
                label={entry.marginalia.label}
                ariaLabel={entry.marginalia.ariaLabel}
              >
                {entry.marginalia.text}
              </Marginalia>
            </span>
            <span className="resume__main">
              <span className="resume__org">
                {entry.organization}
                <em className="resume__role"> — {entry.role}</em>
              </span>
              <span className="resume__summary">{entry.summary}</span>
            </span>
            <span className="resume__dates mono-label">{entry.dates}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ResumeVerso() {
  return (
    <>
      <header className="resume__head">
        <p className="resume__eyebrow mono-label">the annotated resume</p>
        <p className="resume__hint">
          hover, tap, or focus any <span className="resume__hint-mark" aria-hidden>✳</span> for
          the margin notes.
        </p>
      </header>

      <section className="resume__education" aria-label="Education">
        <h3 className="resume__group-label mono-label">Education</h3>
        {resume.education.map((school) => (
          <div className="resume__edu" key={school.institution}>
            <span className="resume__edu-main">
              <span className="resume__edu-institution">
                {school.institution}
              </span>
              <span className="resume__edu-program">{school.program}</span>
            </span>
            <span className="resume__edu-meta mono-label">
              <span>{school.location}</span>
              {school.details.map((detail) => (
                <span key={detail}>{detail}</span>
              ))}
            </span>
          </div>
        ))}
      </section>

      <LedgerGroup label="Now" entries={byKind("current")} notesLeft />
      <LedgerGroup label="Research" entries={byKind("research")} notesLeft />
    </>
  );
}

function ResumeRecto() {
  const lastNote = resume.recognition.length - 1;
  return (
    <>
      <LedgerGroup label="Leadership" entries={byKind("leadership")} />
      <LedgerGroup label="Earlier" entries={byKind("experience")} />

      <section className="resume__group resume__recognition" aria-label="Recognition">
        <h3 className="resume__group-label mono-label">Recognition</h3>
        <ol className="resume__rows">
          {resume.recognition.map((item, index) => (
            <li className="resume__rec" key={item.title}>
              <span className="resume__rec-index mono-label" aria-hidden>
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="resume__main">
                <span className="resume__rec-title">{item.title}</span>
                <span className="resume__rec-issuer mono-label">
                  {item.issuer} · {item.year}
                </span>
                <span className="resume__rec-note">
                  {item.note}
                  {index === lastNote ? <EndMark /> : null}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}

export function Resume({ face }: SpreadFaceProps) {
  return (
    <div className="resume" data-face={face}>
      {face === "verso" ? <ResumeVerso /> : <ResumeRecto />}
    </div>
  );
}
