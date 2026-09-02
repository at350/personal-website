import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import {
  columnLoops,
  LIBRARY_FILTERS,
  MediaWall,
  mosaicColumnCount,
  setLibraryFilter,
} from "@/components/MediaWall";
import { MediaItemSchema, type MediaItem } from "@/lib/media/types";

const film = (overrides: Partial<MediaItem> = {}): MediaItem =>
  MediaItemSchema.parse({
    id: "letterboxd:letterboxd-watch-1",
    source: "letterboxd",
    kind: "film",
    title: "Past Lives",
    url: "https://letterboxd.com/alantai/film/past-lives/",
    year: 2023,
    rating: 4.5,
    // Logged three days after the fact — the gap the plate has to get right.
    publishedAt: "2026-08-04T08:04:12.000Z",
    watchedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  });

afterEach(() => {
  cleanup();
  setLibraryFilter("all");
});

const wall = (items: MediaItem[]) =>
  render(
    <MemoryRouter>
      <MediaWall items={items} page="verso" />
    </MemoryRouter>,
  );

describe("MediaWall film plates", () => {
  it("prints the night it was watched, not the day it was logged", () => {
    wall([film()]);
    // The wall renders each plate twice to close its drifting loop; the
    // second copy is inert, so assertions read the live one.
    const source = screen.getAllByText(/LETTERBOXD/)[0];
    expect(source.textContent).toContain("2026.08.01");
    expect(source.textContent).not.toContain("2026.08.04");
  });

  it("falls back to the post date when the feed carries no watch date", () => {
    wall([film({ watchedAt: undefined })]);
    expect(screen.getAllByText(/LETTERBOXD/)[0].textContent).toContain(
      "2026.08.04",
    );
  });

  it("marks a rewatch and leaves a first viewing unmarked", () => {
    wall([film({ isRewatch: true })]);
    expect(screen.getAllByText(/LETTERBOXD/)[0].textContent).toContain("REWATCH");
    cleanup();
    wall([film()]);
    expect(screen.getAllByText(/LETTERBOXD/)[0].textContent).not.toContain(
      "REWATCH",
    );
  });

  it("prints the review copy a letterboxd entry carries", () => {
    wall([film({ excerpt: "Every frame is a held breath." })]);
    expect(screen.getAllByText("Every frame is a held breath.")[0]).toBeTruthy();
  });

  it("links the plate out to the entry and shows its rating", () => {
    const { container } = wall([film()]);
    // Scope to the live copy; the loop duplicate repeats every plate.
    const live = within(
      container.querySelector<HTMLElement>('[data-copy="0"]') as HTMLElement,
    );
    expect(live.getByRole("link").getAttribute("href")).toBe(
      "https://letterboxd.com/alantai/film/past-lives/",
    );
    expect(live.getByLabelText("Rated 4.5 of 5")).toBeTruthy();
  });

  it("shows only films once the FILMS chip is active", () => {
    const post = MediaItemSchema.parse({
      id: "x:1",
      source: "x",
      kind: "post",
      title: "A post, not a film",
      publishedAt: "2026-08-05T00:00:00.000Z",
    });
    setLibraryFilter("film");
    wall([film(), post]);
    expect(screen.queryAllByText("A post, not a film")).toHaveLength(0);
    expect(screen.getAllByText("Past Lives")[0]).toBeTruthy();
  });
});

const book = (overrides: Partial<MediaItem> = {}): MediaItem =>
  MediaItemSchema.parse({
    id: "goodreads:127280527",
    source: "goodreads",
    kind: "book",
    title: "Big Ideas, Little Pictures",
    url: "https://www.goodreads.com/review/show/7869033955",
    author: "Jono Hey",
    rating: 5,
    // Shelved two days after it was finished — the gap the plate has to get right.
    publishedAt: "2025-10-31T15:34:46.000Z",
    readAt: "2025-10-29T00:00:00.000Z",
    image: {
      src: "https://i.gr-assets.com/images/S/compressed.photo.goodreads.com/books/1719396734l/127280527._SX318_.jpg",
      alt: "Cover of Big Ideas, Little Pictures",
    },
    ...overrides,
  });

describe("MediaWall book plates", () => {
  it("seats the BOOKS chip right after FILMS", () => {
    const ids = LIBRARY_FILTERS.map((entry) => entry.id);
    expect(ids.indexOf("book")).toBe(ids.indexOf("film") + 1);
    expect(LIBRARY_FILTERS.find((entry) => entry.id === "book")?.label).toBe(
      "BOOKS",
    );
  });

  it("shows only books once the BOOKS chip is active", () => {
    setLibraryFilter("book");
    wall([film(), book()]);
    expect(screen.queryAllByText("Past Lives")).toHaveLength(0);
    expect(screen.getAllByText("Big Ideas, Little Pictures")[0]).toBeTruthy();
  });

  it("prints the day it was finished, not the day it was shelved", () => {
    wall([book()]);
    const source = screen.getAllByText(/GOODREADS/)[0];
    expect(source.textContent).toContain("Jono Hey");
    expect(source.textContent).toContain("2025.10.29");
    expect(source.textContent).not.toContain("2025.10.31");
    expect(source.textContent).not.toContain("READING");
  });

  it("marks an open book READING and falls back to the shelving date", () => {
    wall([
      book({ isReading: true, readAt: undefined, rating: undefined }),
    ]);
    const source = screen.getAllByText(/GOODREADS/)[0];
    expect(source.textContent).toContain("READING");
    expect(source.textContent).toContain("2025.10.31");
  });

  it("links the plate to the shelf entry with its stars and cover", () => {
    const { container } = wall([book()]);
    const live = within(
      container.querySelector<HTMLElement>('[data-copy="0"]') as HTMLElement,
    );
    expect(live.getByRole("link").getAttribute("href")).toBe(
      "https://www.goodreads.com/review/show/7869033955",
    );
    expect(live.getByLabelText("Rated 5 of 5")).toBeTruthy();
    expect(container.querySelector(".media-cell--book img")).toBeTruthy();
  });
});

describe("MediaWall drift", () => {
  it("renders each plate twice and leaves the loop copy inert", () => {
    const { container } = wall([film()]);
    // Two copies close the loop seamlessly; only the first is reachable.
    expect(container.querySelectorAll('[data-copy="0"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-copy="1"]')).toHaveLength(1);
    // `inert` keeps the duplicate out of the tab order and the a11y tree in a
    // real browser; jsdom does not implement those semantics, so assert the
    // attribute itself rather than the behaviour it buys.
    expect(container.querySelector('[data-copy="1"]')?.hasAttribute("inert")).toBe(
      true,
    );
  });

  it("deals plates across columns rather than stacking one source", () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      film({ id: `letterboxd:${i}`, title: `Film ${i}` }),
    );
    const { container } = wall(many);
    const columns = container.querySelectorAll(".media-col");
    expect(columns).toHaveLength(3);
    // Verso takes the even-indexed half first (6 of 12), then those are dealt
    // round-robin across the three columns — two apiece, not one long run.
    const perColumn = [...columns].map(
      (c) => c.querySelectorAll('[data-copy="0"]').length,
    );
    expect(perColumn).toEqual([2, 2, 2]);
    expect(
      within(columns[0] as HTMLElement).getAllByText(/Film/)[0].textContent,
    ).toBe("Film 0");
  });
});

describe("MediaWall columns", () => {
  it("keeps three columns on a book page and two on phone paper", () => {
    expect(mosaicColumnCount(0)).toBe(3);
    expect(mosaicColumnCount(640)).toBe(3);
    expect(mosaicColumnCount(420)).toBe(2);
    expect(mosaicColumnCount(360)).toBe(2);
  });
});

/* The loop copy is only invisible while it is off screen. A chip that matches
   two or three entries leaves a copy far shorter than the column, both copies
   land in the frame together, and the page prints every video — or the one
   photo — twice. */

describe("MediaWall loop threshold", () => {
  it("loops only while a copy overflows its window", () => {
    expect(columnLoops(1400, 572)).toBe(true);
    // Two or three plates under a narrow chip: both copies fit, side by side.
    expect(columnLoops(210, 572)).toBe(false);
    // An exact fit has nothing to scroll to, so there is nothing to loop.
    expect(columnLoops(572, 572)).toBe(false);
  });

  it("keeps the printed loop when nothing has been laid out", () => {
    // jsdom, the prerender and a pane with no viewport all measure 0.
    expect(columnLoops(0, 0)).toBe(true);
    expect(columnLoops(Number.NaN, 572)).toBe(true);
  });
});

/** jsdom lays nothing out — every box measures 0 — so give the column a window
    and its cells a height for the measurement to decide on. */
function stubLayout(columnHeight: number, cellHeight: number): () => void {
  const proto = HTMLElement.prototype;
  const originals = (["clientHeight", "offsetHeight", "offsetTop"] as const).map(
    (name) => [name, Object.getOwnPropertyDescriptor(proto, name)] as const,
  );
  const define = (name: string, get: (this: HTMLElement) => number) =>
    Object.defineProperty(proto, name, { configurable: true, get });

  define("clientHeight", function () {
    return this.classList.contains("media-col") ? columnHeight : 0;
  });
  define("offsetHeight", function () {
    return this.classList.contains("media-cell") ? cellHeight : 0;
  });
  define("offsetTop", function () {
    // Cells stack, so a cell's top is the run of cells above it.
    return [...(this.parentElement?.children ?? [])].indexOf(this) * cellHeight;
  });

  return () => {
    for (const [name, descriptor] of originals) {
      if (descriptor !== undefined) Object.defineProperty(proto, name, descriptor);
    }
  };
}

describe("MediaWall short columns", () => {
  it("drops the loop copy when one plate cannot fill the column", () => {
    const restore = stubLayout(600, 100);
    try {
      const { container } = wall([film()]);
      expect(container.querySelectorAll('[data-copy="0"]')).toHaveLength(1);
      expect(container.querySelectorAll('[data-copy="1"]')).toHaveLength(0);
      // The CSS reads this attribute to stop a column that has nowhere to go.
      expect(container.querySelector(".media-col")?.getAttribute("data-static")).toBe(
        "true",
      );
    } finally {
      restore();
    }
  });

  it("keeps both copies drifting once a copy fills the column", () => {
    const restore = stubLayout(100, 600);
    try {
      const { container } = wall([film()]);
      expect(container.querySelectorAll('[data-copy="1"]')).toHaveLength(1);
      expect(container.querySelector(".media-col")?.hasAttribute("data-static")).toBe(
        false,
      );
    } finally {
      restore();
    }
  });
});
