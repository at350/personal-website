"use client";

import { useId, useState } from "react";
import type { ResumeEntry } from "@/lib/content-types";

export function ResumeRow({ entry, index }: { entry: ResumeEntry; index: number }) {
  const noteId = useId();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pinned, setPinned] = useState(false);
  const open = hovered || focused || pinned;

  return (
    <article
      className={`resume-row ${open ? "is-open" : ""}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setFocused(false);
        }
      }}
    >
      <div className="resume-row__number" aria-hidden="true">
        {String(index + 1).padStart(2, "0")}
      </div>
      <div className="resume-row__dates">{entry.dates}</div>
      <div className="resume-row__identity">
        <h2>{entry.organization}</h2>
        <p>{entry.role}</p>
      </div>
      <div className="resume-row__detail">
        <p>{entry.summary}</p>
        <ul>
          {entry.highlights.map((highlight) => (
            <li key={highlight}>{highlight}</li>
          ))}
        </ul>
      </div>
      <button
        type="button"
        className="resume-row__note-trigger"
        aria-label={entry.marginalia.ariaLabel}
        aria-expanded={open}
        aria-controls={noteId}
        onClick={() => setPinned((value) => !value)}
      >
        <span aria-hidden="true">✳</span>
        {entry.marginalia.label}
      </button>
      <aside className="resume-margin-note" id={noteId} hidden={!open}>
        <div>
          <span>Margin note {String(index + 1).padStart(2, "0")}</span>
          <button
            type="button"
            onClick={() => {
              setPinned(false);
              setHovered(false);
              setFocused(false);
            }}
            aria-label={`Close note about ${entry.organization}`}
          >
            ×
          </button>
        </div>
        <p>{entry.marginalia.text}</p>
      </aside>
    </article>
  );
}
