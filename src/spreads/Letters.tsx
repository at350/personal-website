import type { SpreadFaceProps } from "@/magazine/spread-types";
import { contact } from "@/lib/content";
import { SealMark } from "@/components/furniture/SealMark";
import "@/styles/spreads/letters.css";

/* The colophon is set for real — designers read this page first. */
const COLOPHON_ENTRIES = [
  {
    term: "Set in",
    description: (
      <>
        Zodiak by the Indian Type Foundry (Fontshare); Newsreader by Production
        Type; Apfel Grotezk by Luigi Gorlero, Collletttivo; Server Mono by
        Internet Development Studio Co.; Shippori Mincho B1 by FONTDASU.
      </>
    ),
  },
  {
    term: "Paper",
    description: (
      <>
        Washi #F7F3EA on a white void. Ink: sumi #1C1A17. One vermilion:
        #D9333F.
      </>
    ),
  },
  {
    term: "Press",
    description: (
      <>
        Set with React 19 and Vite; bound by a homemade page-flip engine; no
        template, no tracker.
      </>
    ),
  },
  {
    term: "Proofs",
    description: (
      <>
        Press <kbd className="colophon__key">g</kbd> for the printer&rsquo;s
        proof: baseline grid, columns, crop marks.
      </>
    ),
  },
  {
    term: "Issue",
    description: <>No. 01, August 2026. Made in Evanston, Illinois.</>,
  },
] as const;

function LettersPage() {
  return (
    <div className="letters" data-face="verso">
      <p className="letters__eyebrow mono-label">letters to the editor</p>

      <h2 className="letters__heading">{contact.heading}</h2>
      <p className="letters__note">{contact.note}</p>

      <nav className="letters__ledger" aria-label="Ways to reach Alan Tai">
        <ul>
          {contact.links.map((link, index) => (
            <li key={link.kind}>
              <a
                className="letters__row"
                data-kind={link.kind}
                href={link.href}
                {...(link.external
                  ? { target: "_blank", rel: "noreferrer" }
                  : {})}
              >
                <span className="letters__row-index">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="letters__row-label">{link.label}</span>
                <span className="letters__row-display mono-label">
                  {link.display}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

function ColophonPage() {
  return (
    <div className="letters letters--colophon" data-face="recto">
      <p className="letters__eyebrow mono-label">colophon</p>

      <dl className="colophon__ledger">
        {COLOPHON_ENTRIES.map((entry) => (
          <div className="colophon__row" key={entry.term}>
            <dt className="colophon__term mono-label">{entry.term}</dt>
            <dd className="colophon__desc">{entry.description}</dd>
          </div>
        ))}
      </dl>

      {/* Rakkan: the recto's single printed vermilion, set against the emptiness. */}
      <div className="colophon__close">
        <SealMark className="colophon__seal" />
        <p className="colophon__return mono-label">
          FIELD NOTES will return — issue no. 02
        </p>
      </div>
    </div>
  );
}

export function Letters({ face }: SpreadFaceProps) {
  return face === "verso" ? <LettersPage /> : <ColophonPage />;
}
