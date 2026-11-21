import "@/styles/furniture.css";

interface FolioProps {
  page: number | null;
  side: "verso" | "recto";
}

/** Mirrored magazine folios. Verso: `04 — ALAN TAI`; recto: `ISSUE 01 — 05`. */
export function Folio({ page, side }: FolioProps) {
  if (page === null) return null;
  const number = String(page).padStart(2, "0");
  return (
    <p className={`folio folio--${side} mono-label`} aria-hidden>
      {side === "verso" ? (
        <>
          <span className="folio__page">{number}</span> / ALAN TAI
        </>
      ) : (
        <>
          ISSUE 01 / <span className="folio__page">{number}</span>
        </>
      )}
    </p>
  );
}
