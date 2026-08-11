import { Link } from "react-router";
import type { MediaItem, MediaKind, MediaSource } from "@/lib/media/types";
import "@/styles/spreads/library.css";

const PAGE_FOLIOS = { verso: "014", recto: "015" } as const;

const MAX_ITEMS_PER_PAGE = 8;

const KIND_LABELS: Record<MediaKind, string> = {
  post: "POST",
  film: "FILM",
  article: "ARTICLE",
  video: "VIDEO",
  photo: "PHOTO",
  link: "LINK",
};

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

/** Masonry catalog wall: verso shows even-indexed items, recto odd (stable split). */
export function MediaWall({ items, page }: MediaWallProps) {
  const parity = page === "verso" ? 0 : 1;
  const shown = items
    .filter((_, i) => i % 2 === parity)
    .slice(0, MAX_ITEMS_PER_PAGE);

  return (
    <ul className="media-wall" data-page={page}>
      {shown.map((item, i) => (
        <li key={item.id} className="media-wall__cell">
          <MediaPlate
            item={item}
            index={`${PAGE_FOLIOS[page]}-${String(i + 1).padStart(2, "0")}`}
          />
        </li>
      ))}
    </ul>
  );
}

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

function MediaPlate({ item, index }: { item: MediaItem; index: string }) {
  const className = `media-plate media-plate--${item.kind}`;

  const body = (
    <>
      <p className="media-plate__meta">
        <span className="media-plate__index mono-label">{index}</span>
        <span className="media-plate__kind mono-label">
          {KIND_LABELS[item.kind]}
        </span>
      </p>
      {item.image ? (
        <img
          className="media-plate__thumb"
          src={item.image.src}
          alt={item.image.alt}
          width={item.image.width}
          height={item.image.height}
          loading="lazy"
          decoding="async"
        />
      ) : null}
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
