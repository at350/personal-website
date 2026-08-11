import type { SpreadFaceProps } from "@/magazine/spread-types";
import { loadMedia } from "@/lib/media/store";
import { MediaWall } from "@/components/MediaWall";
import "@/styles/spreads/library.css";

const items = loadMedia();

const FILTER_NOTE = "POSTS · ARTICLES · FILMS · VIDEO · PHOTOS";

/** Pages 14–15 — THE LIBRARY. Popeye-density media catalog. */
export function Library({ face }: SpreadFaceProps) {
  return (
    <div className="library" data-face={face}>
      {face === "verso" ? (
        <header className="library__head library__head--verso">
          <p className="library__eyebrow mono-label">
            THE LIBRARY — a media diet, self-updating
          </p>
          <p className="library__count">
            <span className="library__count-figure">
              {String(items.length).padStart(2, "0")}
            </span>
            <span className="library__count-label mono-label">entries</span>
          </p>
        </header>
      ) : (
        <header className="library__head library__head--recto">
          <p className="library__filters mono-label">{FILTER_NOTE}</p>
        </header>
      )}
      <MediaWall items={items} page={face} />
    </div>
  );
}
