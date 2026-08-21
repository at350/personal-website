import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { Link } from "react-router";
import type { MediaImage, MediaItem, MediaKind, MediaSource } from "@/lib/media/types";
import { withBasePath } from "@/lib/basePath";
import { distinctExcerpt } from "@/lib/copy";
import "@/styles/spreads/library.css";

/* ————— Shared filter store —————
   The Library renders once per face (and again in reader mode), so the active
   filter lives at module level: verso's chips drive recto's wall. */

export type LibraryFilter = "all" | MediaKind;

export const LIBRARY_FILTERS: readonly { id: LibraryFilter; label: string }[] = [
  { id: "all", label: "ALL" },
  { id: "post", label: "POSTS" },
  { id: "film", label: "FILMS" },
  { id: "article", label: "ARTICLES" },
  { id: "video", label: "VIDEO" },
  { id: "photo", label: "PHOTOS" },
];

let activeFilter: LibraryFilter = "all";
const listeners = new Set<() => void>();

export function setLibraryFilter(next: LibraryFilter): void {
  if (next === activeFilter) return;
  activeFilter = next;
  for (const notify of [...listeners]) notify();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getFilter = () => activeFilter;

export function useLibraryFilter(): LibraryFilter {
  return useSyncExternalStore(subscribe, getFilter, getFilter);
}

/* ————— The wall ————— */

const PAGE_FOLIOS = { verso: "014", recto: "015" } as const;

/* The wall is a drifting mosaic: three columns per face, each running its own
   endless loop, alternate columns travelling opposite ways. Nothing here is
   interactive scrolling — the column simply never stops, so a face that used
   to seat six plates now shows a slow parade of the whole library.

   Each column's track holds its plates TWICE. The loop translates by exactly
   one copy, so the moment the first copy leaves the frame the second sits
   precisely where it began and the seam never lands on screen. */
const MOSAIC_COLUMNS = 3;
const MOSAIC_NARROW_COLUMNS = 2;
/** Phone paper is ~360px; three catalog columns become unreadable there. */
export const MOSAIC_NARROW_MAX_WIDTH = 420;
const PLATES_PER_COLUMN = 7;

/** Degenerate/unmeasured widths keep the printed three-column wall, so jsdom
    and the capture farm do not collapse to the phone layout. */
export function mosaicColumnCount(width: number): number {
  if (!Number.isFinite(width) || width <= 0) return MOSAIC_COLUMNS;
  return width <= MOSAIC_NARROW_MAX_WIDTH ? MOSAIC_NARROW_COLUMNS : MOSAIC_COLUMNS;
}

/* Columns drift at slightly different speeds so the three never lock into a
   marching grid. Prime-ish seconds keep them out of phase for a long while.

   These read as ~45px/s. The first pass at this ran nearly three times slower,
   which was mathematically in motion and visually indistinguishable from a
   still page — a plate crept less than its own height in half a minute, so
   nobody watching ever caught it moving. Drift has to be seen to be drift. */
const COLUMN_SECONDS = [31, 39, 26] as const;

const SOURCE_LABELS: Record<MediaSource, string> = {
  x: "X",
  linkedin: "LINKEDIN",
  letterboxd: "LETTERBOXD",
  substack: "SUBSTACK",
  youtube: "YOUTUBE",
  web: "WEB",
  local: "ARCHIVE",
};

interface MediaWallProps {
  items: MediaItem[];
  page: "verso" | "recto";
}

/** Catalog wall: verso takes even-indexed items, recto odd (stable split). */
export function MediaWall({ items, page }: MediaWallProps) {
  const filter = useLibraryFilter();
  const wallRef = useRef<HTMLDivElement>(null);
  const [columnCount, setColumnCount] = useState(MOSAIC_COLUMNS);
  const parity = page === "verso" ? 0 : 1;
  const shown = items
    .filter((item) => filter === "all" || item.kind === filter)
    .filter((_, i) => i % 2 === parity)
    .slice(0, columnCount * PLATES_PER_COLUMN);

  useEffect(() => {
    const node = wallRef.current;
    if (!node) return;
    const apply = (width: number) => setColumnCount(mosaicColumnCount(width));
    apply(node.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      apply(entries[0]?.contentRect.width ?? node.clientWidth);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  /* Deal round-robin, so a column is a cross-section of the library rather
     than one source's run of plates. */
  const columns = Array.from({ length: columnCount }, (_, column) =>
    shown.filter((_, i) => i % columnCount === column),
  );

  return (
    <div
      ref={wallRef}
      className="media-wall media-wall--mosaic"
      data-page={page}
      data-columns={columnCount}
    >
      {columns.map((plates, column) =>
        plates.length === 0 ? null : (
          <div
            key={column}
            className="media-col"
            /* Middle column runs the other way; see the sketch. */
            data-drift={column % 2 === 1 ? "down" : "up"}
            style={
              { "--column-seconds": `${COLUMN_SECONDS[column]}s` } as CSSProperties
            }
          >
            <ul
              /* The filter in the key remounts the track, so a changed
                 filter restarts the loop instead of jumping mid-travel. */
              key={filter}
              className="media-col__track"
            >
              {[0, 1].map((copy) =>
                plates.map((item, order) => (
                  <li
                    key={`${copy}:${item.id}`}
                    className={`media-cell media-cell--${item.kind}`}
                    data-copy={copy}
                    /* The second copy exists only to close the loop. `inert`
                       — not just aria-hidden — because these plates are
                       links: hidden-but-focusable would put every headline in
                       the tab order twice and read it out of nowhere. */
                    inert={copy === 1}
                  >
                    <MediaPlate
                      item={item}
                      index={`${PAGE_FOLIOS[page]}·${String(
                        column + order * columnCount + 1,
                      ).padStart(2, "0")}`}
                    />
                  </li>
                )),
              )}
            </ul>
          </div>
        ),
      )}
    </div>
  );
}

/* ————— Plates ————— */

/** "2026-08-11T…" → "2026.08.11" for the mono source line. */
function catalogDate(iso: string): string {
  return iso.slice(0, 10).replaceAll("-", ".");
}

function sourceLine(item: MediaItem): string {
  // A diary entry carries two dates; the night it was watched is the fact
  // worth printing, so it outranks the moment the entry was posted.
  const logged = item.watchedAt ?? item.publishedAt;
  return [
    item.author,
    SOURCE_LABELS[item.source],
    item.year !== undefined ? String(item.year) : undefined,
    logged !== undefined ? catalogDate(logged) : undefined,
    item.isRewatch ? "REWATCH" : undefined,
  ]
    .filter(Boolean)
    .join(" · ");
}

function StarRating({ value }: { value: number }) {
  const full = Math.floor(value);
  const half = value - full >= 0.5;
  return (
    <p
      className="media-plate__rating"
      role="img"
      aria-label={`Rated ${value} of 5`}
    >
      <span aria-hidden>
        {"★".repeat(full)}
        {half ? "½" : ""}
      </span>
    </p>
  );
}

/** Skeleton block until the image arrives, then a 200ms fade. */
function PlateThumb({ image, alt }: { image: MediaImage; alt: string }) {
  const [loaded, setLoaded] = useState(false);
  const ratio =
    image.width !== undefined && image.height !== undefined
      ? `${image.width} / ${image.height}`
      : "3 / 2";

  return (
    <span
      className="media-plate__media"
      data-loaded={loaded || undefined}
      style={{ aspectRatio: ratio }}
    >
      <img
        // Cached images can complete before React attaches onLoad.
        ref={(el) => {
          if (el?.complete && el.naturalWidth > 0) setLoaded(true);
        }}
        className="media-plate__thumb"
        src={withBasePath(image.src)}
        alt={alt}
        width={image.width}
        height={image.height}
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(true)}
      />
    </span>
  );
}

function MediaPlate({ item, index }: { item: MediaItem; index: string }) {
  const className = `media-plate media-plate--${item.kind}`;
  const excerpt =
    item.kind === "photo" ? undefined : distinctExcerpt(item.title, item.excerpt);

  const body = (
    <>
      <p className="media-plate__meta mono-label">
        <span className="media-plate__index">{index}</span>
        <span className="media-plate__kind">{item.kind}</span>
      </p>
      {item.image ? (
        <PlateThumb
          image={item.image}
          // The adjacent title already names linked covers and thumbnails.
          alt={item.kind === "photo" ? item.image.alt : ""}
        />
      ) : null}
      <h3 className="media-plate__title">{item.title}</h3>
      {item.rating !== undefined ? <StarRating value={item.rating} /> : null}
      <p className="media-plate__source mono-label">{sourceLine(item)}</p>
      {excerpt !== undefined ? (
        <p className="media-plate__excerpt">{excerpt}</p>
      ) : null}
    </>
  );

  if (item.url === undefined) {
    return <article className={className}>{body}</article>;
  }

  if (item.url.startsWith("/")) {
    return (
      <Link className={className} to={item.url}>
        {body}
      </Link>
    );
  }

  return (
    <a className={className} href={item.url} target="_blank" rel="noreferrer">
      {body}
    </a>
  );
}
