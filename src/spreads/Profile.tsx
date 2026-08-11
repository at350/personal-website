import type { SpreadFaceProps } from "@/magazine/spread-types";
import { about } from "@/lib/content";
import "@/styles/spreads/profile.css";

const HEADLINE_LINES = [
  "Systems with",
  "people still",
  "visible",
  "inside them.",
] as const;

/* p.07 full-bleed art + p.06 contact sheet, all from the verified photo set. */
const bleedPhoto = about.photos[1];
const contactSheet = [about.photos[2], about.photos[3], about.photos[4]];

/** THE PROFILE (pages 06–07) — about, part 2. Verso: oversized grotesk
 *  headline bled to the fore-edge, Q&A-as-ledger, contact-sheet strip.
 *  Recto: full-bleed hutong photo with a caption plate and a quiet
 *  tategaki label. No vermilion anywhere: the photo is the statement. */
export function Profile({ face }: SpreadFaceProps) {
  if (face === "recto") {
    return (
      <div className="profile" data-face="recto">
        <img
          className="profile__bleed"
          src={bleedPhoto.src}
          alt={bleedPhoto.alt}
          loading="lazy"
          decoding="async"
        />
        <p className="profile__plate mono-label">{bleedPhoto.caption}</p>
        <span className="profile__tategaki" lang="ja" aria-hidden>
          散歩
        </span>
      </div>
    );
  }

  return (
    <div className="profile" data-face="verso">
      <h2 className="profile__headline">
        {HEADLINE_LINES.map((line) => (
          <span key={line} className="profile__headline-line">
            {line}
          </span>
        ))}
      </h2>

      <ol className="profile__ledger">
        {about.notes.map((note, i) => (
          <li key={note.label} className="profile__entry">
            <span className="profile__entry-num" aria-hidden>
              {String(i + 1).padStart(2, "0")}
            </span>
            <h3 className="profile__entry-label mono-label">{note.label}</h3>
            <p className="profile__entry-text">{note.text}</p>
          </li>
        ))}
      </ol>

      <div className="profile__sheet">
        {contactSheet.map((photo) => (
          <figure key={photo.src} className="profile__frame">
            <img src={photo.src} alt={photo.alt} loading="lazy" decoding="async" />
            <figcaption>{photo.caption}</figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
