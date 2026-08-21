import { useEffect } from "react";
import { Link, useLocation } from "react-router";
import { SPREADS, isRenderableFace, spreadForRoute } from "@/magazine/folio";
import { PageFace } from "@/magazine/PageFace";
import "@/styles/reader.css";

interface ReaderViewProps {
  canOpenBook: boolean;
  onOpenBook: () => void;
  onOpenPages?: () => void;
}

/** The whole issue as a vertical stack of pages — mobile and reduced-motion home. */
export function ReaderView({
  canOpenBook,
  onOpenBook,
  onOpenPages,
}: ReaderViewProps) {
  const location = useLocation();

  // Deep links scroll to their spread.
  useEffect(() => {
    const index = spreadForRoute(location.pathname);
    if (index > 0) {
      document
        .getElementById(`spread-${SPREADS[index]?.id}`)
        ?.scrollIntoView({ block: "start" });
    }
  }, [location.pathname]);

  return (
    <main className="reader">
      <header className="reader__mast">
        <p className="mono-label">ALAN TAI / NO. 01</p>
        {onOpenPages || canOpenBook ? (
          <div className="reader__modes">
            {onOpenPages ? (
              <button
                type="button"
                className="mono-label reader__open"
                onClick={onOpenPages}
              >
                read as pages
              </button>
            ) : null}
            {canOpenBook ? (
              <button
                type="button"
                className="mono-label reader__open"
                onClick={onOpenBook}
              >
                open as book
              </button>
            ) : null}
          </div>
        ) : null}
      </header>

      {SPREADS.map((def, index) => {
        const faces = (["verso", "recto"] as const).filter((side) =>
          isRenderableFace(index, side),
        );
        return (
          <section
            key={def.id}
            id={`spread-${def.id}`}
            className="reader__spread"
            aria-label={def.label}
          >
            {faces.map((face) => (
              <div key={face} className="reader__page">
                <PageFace spread={index} side={face} mode="reader" />
              </div>
            ))}
          </section>
        );
      })}

      <footer className="reader__foot">
        <Link to="/" className="mono-label">
          ALAN TAI / NO. 01 / 2026
        </Link>
      </footer>
    </main>
  );
}
