import type { ReactNode } from "react";
import type { SpreadFaceProps } from "@/magazine/spread-types";
import { contact } from "@/lib/content";
import "@/styles/spreads/letters.css";

const COLOPHON_ENTRIES: ReadonlyArray<{ term: string; desc: ReactNode }> = [
  {
    term: "Set in",
    desc: (
      <>
        Zodiak and Tanker by the Indian Type Foundry (Fontshare); Newsreader by
        Production Type; Apfel Grotezk by Collletttivo; Server Mono by Internet
        Development Studio Co.
      </>
    ),
  },
  {
    term: "Paper",
    desc: <>White #FFFFFF. Ink #0E0E0C. One red: #E8351A.</>,
  },
  {
    term: "Press",
    desc: (
      <>
        React 19, Vite, three.js; a homemade WebGL page-flip; no template, no
        tracker.
      </>
    ),
  },
  {
    term: "Proofs",
    desc: (
      <>
        <kbd className="colophon__key">g</kbd> &mdash; printer&rsquo;s proof
      </>
    ),
  },
  {
    term: "Issue",
    desc: <>No. 01, August 2026. Evanston, Illinois.</>,
  },
];

/* Verso (p. 18): the contact ledger.
   Signature interaction: whole-row links; the index prints red on approach. */
function LettersPage() {
  return (
    <div className="letters" data-face="verso">
      <p className="letters__mark mono-label">Letters</p>

      <h2 className="letters__heading">{contact.heading}</h2>
      <p className="letters__note">{contact.note}</p>

      <nav className="letters__ledger" aria-label="Ways to reach Alan Tai">
        <ul>
          {contact.links.map((link, index) => (
            <li className="letters__li" key={link.kind}>
              <a
                className="letters__row"
                data-kind={link.kind}
                href={link.href}
                {...(link.external
                  ? { target: "_blank", rel: "noreferrer" }
                  : {})}
              >
                <span className="letters__index">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="letters__label">{link.label}</span>
                <span className="letters__value">{link.display}</span>
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

/* Recto (p. 19): the imprint page. */
function ColophonPage() {
  return (
    <div className="letters letters--colophon" data-face="recto">
      <p className="letters__mark mono-label">Colophon</p>

      <dl className="colophon">
        {COLOPHON_ENTRIES.map((entry) => (
          <div className="colophon__row" key={entry.term}>
            <dt className="colophon__term mono-label">{entry.term}</dt>
            <dd className="colophon__desc">{entry.desc}</dd>
          </div>
        ))}
      </dl>

      <span className="colophon__asterisk" aria-hidden>
        &#10035;
      </span>
    </div>
  );
}

export function Letters({ face }: SpreadFaceProps) {
  return face === "verso" ? <LettersPage /> : <ColophonPage />;
}
