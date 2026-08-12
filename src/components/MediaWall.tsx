import { useState, useSyncExternalStore, type CSSProperties } from "react";
import { Link } from "react-router";
import type { MediaImage, MediaItem, MediaKind, MediaSource } from "@/lib/media/types";
import { withBasePath } from "@/lib/basePath";
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

/* Verso cedes headroom to the chips row and the section mark;
   recto cedes a plate to its dropped second column. */
const PAGE_CAPACITY = { verso: 6, recto: 7 } as const;

const SOURCE_LABELS: Record<MediaSource, string> = {
  x: "X",
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
  const parity = page === "verso" ? 0 : 1;
  const shown = items
    .filter((item) => filter === "all" || item.kind === filter)
    .filter((_, i) => i % 2 === parity)
    .slice(0, PAGE_CAPACITY[page]);

  return (
    <ul className="media-wall media-wall--mosaic" data-page={page}>
      {shown.map((item, order) => (
        <li
          /* The filter in the key remounts the tile: the 240ms rise
             replays, staggered by reading order. */
          key={`${filter}:${item.id}`}
          className={`media-cell media-cell--${item.kind}`}
          style={{ "--order": order } as CSSProperties}
        >
          <MediaPlate
            item={item}
            index={`${PAGE_FOLIOS[page]}·${String(order + 1).padStart(2, "0")}`}
          />
        </li>
      ))}
    </ul>
  );
}

/* ————— Plates ————— */

/** "2026-08-11T…" → "2026.08.11" for the mono source line. */
function catalogDate(iso: string): string {
  return iso.slice(0, 10).replaceAll("-", ".");
}

function sourceLine(item: MediaItem): string {
  return [
    item.author,
    SOURCE_LABELS[item.source],
    item.year !== undefined ? String(item.year) : undefined,
    item.publishedAt !== undefined ? catalogDate(item.publishedAt) : undefined,
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
function PlateThumb({ image }: { image: MediaImage }) {
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
        alt={image.alt}
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

  const body = (
    <>
      <p className="media-plate__meta mono-label">
        <span className="media-plate__index">{index}</span>
        <span className="media-plate__kind">{item.kind}</span>
      </p>
      {item.image ? <PlateThumb image={item.image} /> : null}
      <h3 className="media-plate__title">{item.title}</h3>
      {item.rating !== undefined ? <StarRating value={item.rating} /> : null}
      <p className="media-plate__source mono-label">{sourceLine(item)}</p>
      {item.excerpt !== undefined && item.kind !== "photo" ? (
        <p className="media-plate__excerpt">{item.excerpt}</p>
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
