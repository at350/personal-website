import type { SpreadFaceProps } from "@/magazine/spread-types";
import { about } from "@/lib/content";
import { Marginalia } from "@/components/furniture/Marginalia";
import { EndMark } from "@/components/furniture/EndMark";
import "@/styles/spreads/letter.css";

/* The two asides that float in the verso's empty margin. */
const marginNotes = [about.notes[1], about.notes[2]];
const portrait = about.photos[0];

/** Pages 04–05 — The Editor's Letter (About, part 1). */
export function EditorsLetter({ face }: SpreadFaceProps) {
  if (face === "verso") {
    return (
      <div className="letter" data-face="verso">
        <section className="letter__column" aria-label="The editor's letter">
          <p className="letter__eyebrow mono-label">{about.eyebrow}</p>
          <h2 className="letter__heading">{about.heading}</h2>
          <p className="letter__body drop-cap">{about.lede}</p>
          {about.paragraphs.map((paragraph) => (
            <p key={paragraph.slice(0, 24)} className="letter__body">
              {paragraph}
            </p>
          ))}
          <p className="letter__signoff">
            — alan
            <EndMark />
          </p>
        </section>

        {marginNotes.map((note, i) => (
          <span
            key={note.label}
            className={`letter__aside letter__aside--${i === 0 ? "one" : "two"}`}
          >
            <Marginalia
              label={note.label}
              ariaLabel={`Read a margin note: ${note.label}`}
            >
              {note.text}
            </Marginalia>
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="letter" data-face="recto">
      <figure className="letter__plate">
        <img
          className="letter__portrait"
          src={portrait.src}
          alt={portrait.alt}
          decoding="async"
        />
        <figcaption className="letter__plate-caption mono-label">
          {portrait.caption}
        </figcaption>
      </figure>

      <blockquote className="letter__pull">
        <p>{about.pullQuote}</p>
      </blockquote>

      <p className="letter__plate-no mono-label">
        Plate 01 — The official version
      </p>
    </div>
  );
}
