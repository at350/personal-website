import type { CSSProperties } from "react";
import { hasSpine, type SpreadFaceProps } from "@/magazine/spread-types";
import type { ResumeEntry } from "@/lib/content-types";
import { resume } from "@/lib/content";
import { Marginalia } from "@/components/furniture/Marginalia";
import "@/styles/spreads/resume.css";

const byKind = (kind: ResumeEntry["kind"]) =>
  resume.entries.filter((entry) => entry.kind === kind);

const currentEntries = byKind("current");
const researchEntries = byKind("research");
const experienceEntries = byKind("experience");
const leadershipEntries = byKind("leadership");
const readingOrder = [
  ...currentEntries,
  ...researchEntries,
  ...experienceEntries,
  ...leadershipEntries,
];

/* "Apr 2026 to Present" → "apr 2026–now" */
const compactDates = (dates: string) =>
  dates.replace(" to ", "-").replace("Present", "now").toLowerCase();

/** Right-aligned mono date. Digits rise once through masks — the
    transitions.dev number pop-in, pure CSS, reduced-motion guarded. */
function DateStamp({ text, row }: { text: string; row: number }) {
  let digit = 0;
  return (
    <span className="resume2__dates">
      <span className="visually-hidden">{text}</span>
      <span className="resume2__date-run" aria-hidden>
        {compactDates(text)
          .split("")
          .map((ch, i) =>
            /\d/.test(ch) ? (
              <span key={i} className="resume2__digit-mask">
                <span
                  className="resume2__digit"
                  style={{ "--row": row, "--i": digit++ } as CSSProperties}
                >
                  {ch}
                </span>
              </span>
            ) : (
              <span key={i} className="resume2__ch">
                {ch}
              </span>
            ),
          )}
      </span>
    </span>
  );
}

/* The word straddles the spine: each face carries exactly half of RESUME,
   centered on its gutter edge. The reader keeps the whole word on the verso
   and drops the recto fragment. */
function SpreadWord({ face, mode }: SpreadFaceProps) {
  if (face === "recto" && !hasSpine(mode)) return null;
  return (
    <header className="resume2__head">
      {face === "verso" ? (
        <p className="resume2__legend">
          <span className="resume2__legend-mark" aria-hidden>
          </span>{" "}
          notes 01-{String(readingOrder.length).padStart(2, "0")} live in the margins
        </p>
      ) : null}
      {face === "verso" ? (
        <h2 className="resume2__word">RESUME</h2>
      ) : (
        <span className="resume2__word" aria-hidden>
          RESUME
        </span>
      )}
    </header>
  );
}

interface LedgerGroupProps {
  label: string;
  entries: readonly ResumeEntry[];
  face: "verso" | "recto";
  /** Continues the digit pop-in stagger across groups on a page. */
  rowStart: number;
  /** Bottom-of-page group: notes open upward to stay on the paper. */
  notesUp?: boolean;
}

function LedgerGroup({
  label,
  entries,
  face,
  rowStart,
  notesUp,
}: LedgerGroupProps) {
  const className = [
    "resume2__group",
    notesUp ? "resume2__group--up" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <section className={className} aria-label={label}>
      <h3 className="resume2__label mono-label">{label}</h3>
      <ul className="resume2__rows">
        {entries.map((entry, index) => {
          const mark = (
            <span className="resume2__mark" key="mark">
              <Marginalia
                label={entry.marginalia.label}
                ariaLabel={entry.marginalia.ariaLabel}
                index={readingOrder.findIndex((e) => e.id === entry.id) + 1}
                stateKey={entry.id}
                stateSpread="resume"
              >
                {entry.marginalia.text}
              </Marginalia>
            </span>
          );
          const main = (
            <span className="resume2__main" key="main">
              <span className="resume2__heading">
                <span className="resume2__org">
                  {entry.organization}
                  <em className="resume2__role">, {entry.role}</em>
                </span>
                <DateStamp text={entry.dates} row={rowStart + index} />
              </span>
              <span className="resume2__summary">
                {entry.summary} {entry.highlights.join(" ")}
              </span>
            </span>
          );
          return (
            <li key={entry.id} className="resume2__row">
              {face === "verso" ? [mark, main] : [main, mark]}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Recognition() {
  return (
    <section className="resume2__recognition" aria-label="Recognition">
      <h3 className="resume2__label mono-label">Recognition</h3>
      <ol className="resume2__recs">
        {resume.recognition.map((item, index) => (
          <li className="resume2__rec" key={item.title}>
            <span className="resume2__rec-no" aria-hidden>
              {String(index + 1).padStart(2, "0")}
            </span>
            <span className="resume2__rec-body">
              <span className="resume2__rec-title">{item.title}</span>
              <span className="resume2__rec-meta mono-label">
                {item.issuer} · {item.year}
              </span>
              {item.note ? <span className="resume2__rec-note">{item.note}</span> : null}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function ResumeVerso({ mode }: { mode: SpreadFaceProps["mode"] }) {
  return (
    <>
      <SpreadWord face="verso" mode={mode} />

      <section className="resume2__edu" aria-label="Education">
        <h3 className="resume2__label mono-label">Education</h3>
        {resume.education.map((school) => (
          <div className="resume2__edu-row" key={school.institution}>
            <span className="resume2__edu-main">
              <span className="resume2__edu-inst">{school.institution}</span>
              <span className="resume2__edu-prog">{school.program}</span>
            </span>
            <span className="resume2__edu-meta">
              <span>{school.location}</span>
              {school.details.map((detail) => (
                <span key={detail}>{detail}</span>
              ))}
            </span>
          </div>
        ))}
      </section>

      <LedgerGroup label="Now" entries={currentEntries} face="verso" rowStart={0} />
      <LedgerGroup
        label="Research"
        entries={researchEntries}
        face="verso"
        rowStart={currentEntries.length}
        notesUp
      />
      <Recognition />
    </>
  );
}

function ResumeRecto({ mode }: { mode: SpreadFaceProps["mode"] }) {
  return (
    <>
      <SpreadWord face="recto" mode={mode} />

      <LedgerGroup
        label="Professional experience"
        entries={experienceEntries}
        face="recto"
        rowStart={0}
      />
      <LedgerGroup
        label="Leadership"
        entries={leadershipEntries}
        face="recto"
        rowStart={experienceEntries.length}
        notesUp
      />
    </>
  );
}

export function Resume({ face, mode }: SpreadFaceProps) {
  return (
    <div className={`resume2 resume2--${face}`} data-mode={mode}>
      {face === "verso" ? <ResumeVerso mode={mode} /> : <ResumeRecto mode={mode} />}
    </div>
  );
}
