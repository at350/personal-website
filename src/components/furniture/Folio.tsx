import "@/styles/furniture.css";

interface FolioProps {
  page: number | null;
  side: "verso" | "recto";
}

/** Mirrored magazine folios. Verso: `04 — FIELD NOTES`; recto: `NO. 01 · 2026 — 05`. */
export function Folio({ page, side }: FolioProps) {
  if (page === null) return null;
  const number = String(page).padStart(2, "0");
  return (
    <p className={`folio folio--${side} mono-label`} aria-hidden>
      {side === "verso" ? (
        <>
          <span className="folio__page">{number}</span> — FIELD NOTES
        </>
      ) : (
        <>
          NO. 01 · 2026 — <span className="folio__page">{number}</span>
        </>
      )}
    </p>
  );
}
