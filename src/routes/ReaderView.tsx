import { useEffect } from "react";
import { Link, useLocation } from "react-router";
import { ISSUE } from "@/magazine/issue-map";
import { SPREADS, spreadForRoute, spreadPages } from "@/magazine/folio";
import { Folio } from "@/components/furniture/Folio";
import { RunningHead } from "@/components/furniture/RunningHead";
import "@/styles/reader.css";

interface ReaderViewProps {
  canOpenBook: boolean;
  onOpenBook: () => void;
}

/** The whole issue as a vertical stack of pages — mobile and reduced-motion home. */
export function ReaderView({ canOpenBook, onOpenBook }: ReaderViewProps) {
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
        <p className="mono-label">FIELD NOTES — ISSUE NO. 01</p>
        {canOpenBook ? (
          <button className="mono-label reader__open" onClick={onOpenBook}>
            open as magazine
          </button>
        ) : null}
      </header>

      {SPREADS.map((def, index) => {
        const binding = ISSUE[index]!;
        const pages = spreadPages(index);
        const { Component } = binding;
        const faces =
          def.kind === "cover"
            ? (["recto"] as const)
            : def.kind === "back"
              ? (["verso"] as const)
              : (["verso", "recto"] as const);
        return (
          <section
            key={def.id}
            id={`spread-${def.id}`}
            className="reader__spread"
            aria-label={def.label}
          >
            {faces.map((face) => {
              const page = pages ? (face === "verso" ? pages[0] : pages[1]) : null;
              const fullBleed = binding.fullBleed?.[face] ?? false;
              return (
                <div key={face} className="reader__page">
                  <Component face={face} mode="reader" />
                  {!fullBleed && def.runningHead ? (
                    <RunningHead text={def.runningHead} side={face} />
                  ) : null}
                  {!fullBleed && page !== null ? <Folio page={page} side={face} /> : null}
                </div>
              );
            })}
          </section>
        );
      })}

      <footer className="reader__foot">
        <Link to="/" className="mono-label">
          FIELD NOTES · NO. 01 · 2026
        </Link>
      </footer>
    </main>
  );
}
