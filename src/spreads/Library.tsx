import type { SpreadFaceProps } from "@/magazine/spread-types";
import { loadMedia } from "@/lib/media/store";
import {
  LIBRARY_FILTERS,
  MediaWall,
  setLibraryFilter,
  useLibraryFilter,
} from "@/components/MediaWall";
import "@/styles/spreads/library.css";

const items = loadMedia();

/** Pages 14–15 — THE LIBRARY. Verso's chips filter the whole spread. */
export function Library({ face }: SpreadFaceProps) {
  const filter = useLibraryFilter();
  const active = LIBRARY_FILTERS.find((entry) => entry.id === filter);

  return (
    <div className="library" data-face={face}>
      {face === "verso" ? (
        <>
          <header className="library__head">
            <p className="library__eyebrow mono-label">THE LIBRARY</p>
            <div className="library__chips" role="group" aria-label="Filter the library">
              {LIBRARY_FILTERS.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className="library__chip mono-label"
                  aria-pressed={filter === entry.id}
                  onClick={() => setLibraryFilter(entry.id)}
                >
                  {entry.label}
                </button>
              ))}
            </div>
          </header>
          {/* The section mark: the active filter set huge, cut by the trim. */}
          <p className="library__display" aria-hidden key={filter}>
            {active?.label}
            <span className="library__display-dot">.</span>
          </p>
        </>
      ) : null}
      <MediaWall items={items} page={face} />
    </div>
  );
}
