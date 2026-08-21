import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { MediaWall, mosaicColumnCount, setLibraryFilter } from "@/components/MediaWall";
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
