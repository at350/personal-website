"use client";

import { useMemo, useState } from "react";
import type { MediaApiResponse, MediaItem, MediaSource } from "@/lib/media/types";

type Filter = "all" | "saved" | "x" | "film" | "photo";

const filters: { id: Filter; label: string }[] = [
  { id: "all", label: "Everything" },
  { id: "saved", label: "Saved reads" },
  { id: "x", label: "Recent X" },
  { id: "film", label: "Films" },
  { id: "photo", label: "Photos" },
];

const sourceLabels: Record<MediaSource, string> = {
  local: "Field photo",
  x: "X post",
  letterboxd: "Letterboxd",
  substack: "Substack",
  youtube: "Video",
  web: "Saved article",
};

function matches(item: MediaItem, filter: Filter) {
  if (filter === "all") return true;
  if (filter === "saved") return item.source === "web" || item.source === "youtube";
  if (filter === "film") return item.source === "letterboxd" || item.kind === "film";
  return item.source === filter || item.kind === filter;
}

function readableDate(value?: string) {
  if (!value) return "Filed recently";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function MediaCard({ item, index }: { item: MediaItem; index: number }) {
  const content = (
    <>
      {item.image ? (
        <div className="media-card__image">
          {/* Feed images have runtime domains, so a native image is intentional here. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.image.src}
            alt={item.image.alt}
            width={item.image.width}
            height={item.image.height}
            loading={index < 3 ? "eager" : "lazy"}
            decoding="async"
          />
        </div>
      ) : (
        <div className="media-card__type-art" aria-hidden="true">
          {item.source === "x" ? "x" : item.kind.slice(0, 1)}
        </div>
      )}
      <div className="media-card__body">
        <div className="media-card__meta">
          <span>{sourceLabels[item.source]}</span>
          <span>{readableDate(item.publishedAt)}</span>
        </div>
        <h2>{item.title}</h2>
        {item.author ? <p className="media-card__author">By {item.author}</p> : null}
        {item.excerpt ? <p className="media-card__excerpt">{item.excerpt}</p> : null}
        {item.note ? (
          <p className="media-card__note">
            <span>Alan’s note</span>
            {item.note}
          </p>
        ) : null}
        {item.rating !== undefined ? (
          <p className="media-card__rating" aria-label={`${item.rating} out of 5 stars`}>
            {item.rating.toFixed(1)} / 5
          </p>
        ) : null}
        <ul aria-label="Topics">
          {item.tags.slice(0, 4).map((tag) => (
            <li key={tag}>{tag}</li>
          ))}
        </ul>
      </div>
    </>
  );

  return (
    <article className={`media-card media-card--${(index % 7) + 1}`}>
      {item.url ? (
        <a
          href={item.url}
          target={item.url.startsWith("http") ? "_blank" : undefined}
          rel={item.url.startsWith("http") ? "noreferrer" : undefined}
          aria-label={`${item.title}, open source`}
        >
          {content}
        </a>
      ) : (
        content
      )}
    </article>
  );
}

export function MediaLibrary({ library }: { library: MediaApiResponse }) {
  const [filter, setFilter] = useState<Filter>("all");
  const visibleItems = useMemo(
    () => library.items.filter((item) => matches(item, filter)),
    [filter, library.items],
  );

  return (
    <>
      <div className="library-toolbar">
        <div className="library-filters" aria-label="Filter media library">
          {filters.map((item) => (
            <button
              type="button"
              key={item.id}
              aria-pressed={filter === item.id}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
              <span>
                {library.items.filter((entry) => matches(entry, item.id)).length}
              </span>
            </button>
          ))}
        </div>
        <p aria-live="polite">
          Showing {visibleItems.length} {visibleItems.length === 1 ? "item" : "items"}
        </p>
      </div>

      {filter === "film" && visibleItems.length === 0 ? (
        <div className="library-empty-state">
          <span aria-hidden="true">○</span>
          <div>
            <h2>The film shelf is wired, but not labeled yet.</h2>
            <p>
              Add a public Letterboxd RSS URL as <code>LETTERBOXD_RSS_URL</code> and
              new diary entries will file themselves here.
            </p>
          </div>
        </div>
      ) : (
        <div className="media-grid">
          {visibleItems.map((item, index) => (
            <MediaCard item={item} index={index} key={item.id} />
          ))}
        </div>
      )}

      <div className="feed-status" aria-label="Media feed status">
        <div>
          <span className={`feed-dot feed-dot--${library.feeds.x.state}`} />
          X / {library.feeds.x.state}
        </div>
        <div>
          <span className={`feed-dot feed-dot--${library.feeds.letterboxd.state}`} />
          Letterboxd / {library.feeds.letterboxd.state}
        </div>
        <div>
          <span className={`feed-dot feed-dot--${library.feeds.substack.state}`} />
          Substack / {library.feeds.substack.state}
        </div>
      </div>
    </>
  );
}
