import { useCallback, useRef } from "react";
import { Link } from "react-router";
import type { SpreadFaceProps } from "@/magazine/spread-types";
import { SealMark } from "@/components/furniture/SealMark";
import { Barcode } from "@/components/furniture/Barcode";
import "@/styles/spreads/cover.css";

const COVER_LINES = [
  { page: "04", text: "the editor's letter", href: "/about" },
  { page: "12", text: "the annotated resume", href: "/resume" },
  { page: "14", text: "the library", href: "/library" },
] as const;

export function Cover({ face, mode }: SpreadFaceProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const el = rootRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--gx", String((e.clientX - rect.left) / rect.width));
    el.style.setProperty("--gy", String((e.clientY - rect.top) / rect.height));
  }, []);

  if (face === "verso" && mode === "book") return null;

  return (
    <div className="cover" ref={rootRef} onPointerMove={onPointerMove}>
      <p className="cover__kicker mono-label">the personal magazine of alan tai</p>

      <h1 className="cover__masthead" aria-label="Field Notes">
        <span className="cover__masthead-line">FIELD</span>
        <span className="cover__masthead-line">
          NOTES
          <SealMark className="cover__seal" />
        </span>
      </h1>

      <p className="cover__dek">Things made, noticed, and kept.</p>

      <nav className="cover__lines" aria-label="Cover lines">
        {COVER_LINES.map((line) => (
          <Link key={line.page} className="cover__line" to={line.href}>
            <span className="cover__line-page mono-label">{line.page}</span>
            <span className="cover__line-text">{line.text}</span>
          </Link>
        ))}
      </nav>

      <p className="cover__issue mono-label">
        NO. 01 · EVANSTON, IL · EST. 2026
        <br />
        $0.00 — PRICELESS
      </p>

      <span className="cover__edge-jp" lang="ja" aria-hidden>
        野帳
      </span>

      <div className="cover__barcode">
        <Barcode text="FIELDNOTES.01" caption="NO. 01" />
      </div>

      <div className="cover__gloss" aria-hidden />
      <div className="cover__peel" aria-hidden />
    </div>
  );
}

export function BackCover({ face, mode }: SpreadFaceProps) {
  if (face === "recto" && mode === "book") return null;
  return (
    <div className="back-cover">
      <p className="back-cover__return">
        FIELD NOTES <em>will return.</em>
      </p>
      <p className="back-cover__issue mono-label">ISSUE NO. 02, EVENTUALLY</p>
      <p className="back-cover__motto mono-label">make things that work.</p>
      <div className="back-cover__barcode">
        <Barcode text="FIELDNOTES.02" caption="NOT YET PRINTED" height={26} />
      </div>
    </div>
  );
}
