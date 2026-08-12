import type { SpreadFaceProps } from "@/magazine/spread-types";
import { about } from "@/lib/content";
import "@/styles/spreads/profile.css";

const STATEMENT = ["Ask first", "build second"] as const;

/* Off-hours nouns, all verified in the about copy. */
const POSTER_WORDS = ["GEOCACHES", "FIRE HYDRANTS", "ROADSIDE LANDMARKS", "MANDARIN"] as const;

/** THE PROFILE (pages 06–07). Verso: the working rule and four notes as a
 *  numbered ledger — the emptiness below is deliberate. Recto: the off-hours
 *  poster, white woodtype on ink. */
export function Profile({ face }: SpreadFaceProps) {
  if (face === "recto") {
    // The poster page: ink ground, the off-hours nouns as white woodtype.
    return (
      <div className="profile" data-face="recto" data-page-tone="dark">
        <p className="profile__poster-eyebrow mono-label">Away from the screen</p>
        <ul className="profile__poster" aria-label="Off hours">
          {POSTER_WORDS.map((word, i) => (
            <li className="profile__poster-row" key={word}>
              <span className="profile__poster-no">{String(i + 1).padStart(2, "0")}</span>
              <span className="profile__poster-word">{word}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="profile" data-face="verso">
      <h2 className="profile__statement">
        {STATEMENT.map((line, i) => (
          <span key={line} className="profile__statement-line">
            {line}
            {i === STATEMENT.length - 1 && (
              <span className="profile__dot" aria-hidden>
                .
              </span>
            )}
          </span>
        ))}
      </h2>

      <ol className="profile__ledger">
        {about.notes.map((note, i) => (
          <li key={note.label} className="profile__entry">
            <span className="profile__num" aria-hidden>
              {String(i + 1).padStart(2, "0")}
            </span>
            <p className="profile__note">{note.text}</p>
          </li>
        ))}
      </ol>

    </div>
  );
}
