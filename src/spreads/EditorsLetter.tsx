import { useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { SpreadFaceProps } from "@/magazine/spread-types";
import { about } from "@/lib/content";
import { Marginalia } from "@/components/furniture/Marginalia";
import { EndMark } from "@/components/furniture/EndMark";
import { motionOK } from "@/lib/motion";
import { withBasePath } from "@/lib/basePath";
import "@/styles/spreads/letter.css";

/* The two ✳ asides in the verso's wide margin. */
const marginNotes = [about.notes[1], about.notes[2]];
const portrait = about.photos[0];

/** Pages 04–05 — a letter (verso) and the portrait plate (recto). */
export function EditorsLetter({ face }: SpreadFaceProps) {
  const plateRef = useRef<HTMLElement>(null);

  /* transitions.dev "3D tilt with glare": pointer drives ±3deg of tilt and
     the sheen's x position. Mouse only; reduced motion kills it in CSS too. */
  const onPlateMove = (e: ReactPointerEvent<HTMLElement>) => {
    const plate = plateRef.current;
    if (!plate || e.pointerType !== "mouse" || !motionOK()) return;
    const rect = plate.getBoundingClientRect();
    const nx = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
    const ny = Math.min(Math.max((e.clientY - rect.top) / rect.height, 0), 1);
    plate.style.setProperty("--tx", (nx * 2 - 1).toFixed(3));
    plate.style.setProperty("--ty", (ny * 2 - 1).toFixed(3));
    plate.style.setProperty("--gx", nx.toFixed(3));
  };

  const onPlateLeave = () => {
    const plate = plateRef.current;
    if (!plate) return;
    plate.style.setProperty("--tx", "0");
    plate.style.setProperty("--ty", "0");
  };

  if (face === "verso") {
    return (
      <div className="letter" data-face="verso">
        <section className="letter__column" aria-label="A letter">
          <p className="letter__eyebrow">a letter</p>
          <h2 className="letter__heading">{about.heading}</h2>
          <p className="letter__body drop-cap">{about.lede}</p>
          {about.paragraphs.map((paragraph) => (
            <p key={paragraph.slice(0, 24)} className="letter__body">
              {paragraph}
            </p>
          ))}
          <p className="letter__signoff">
            alan
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
              index={i + 1}
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
      <figure
        className="letter__plate"
        ref={plateRef}
        onPointerMove={onPlateMove}
        onPointerLeave={onPlateLeave}
      >
        <span className="letter__plate-tilt">
          <img
            className="letter__portrait"
            src={withBasePath(portrait.src)}
            alt={portrait.alt}
            decoding="async"
          />
          <span className="letter__glare" aria-hidden />
        </span>
        <figcaption className="letter__plate-caption">
          {portrait.caption}
        </figcaption>
      </figure>

      <blockquote className="letter__pull">
        <p>{about.pullQuote}</p>
      </blockquote>

    </div>
  );
}
