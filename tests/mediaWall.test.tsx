import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { MediaWall, setLibraryFilter } from "@/components/MediaWall";
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
    const source = screen.getByText(/LETTERBOXD/);
    expect(source.textContent).toContain("2026.08.01");
    expect(source.textContent).not.toContain("2026.08.04");
  });

  it("falls back to the post date when the feed carries no watch date", () => {
    wall([film({ watchedAt: undefined })]);
    expect(screen.getByText(/LETTERBOXD/).textContent).toContain("2026.08.04");
  });

  it("marks a rewatch and leaves a first viewing unmarked", () => {
    wall([film({ isRewatch: true })]);
    expect(screen.getByText(/LETTERBOXD/).textContent).toContain("REWATCH");
    cleanup();
    wall([film()]);
    expect(screen.getByText(/LETTERBOXD/).textContent).not.toContain("REWATCH");
  });

  it("prints the review copy a letterboxd entry carries", () => {
    wall([film({ excerpt: "Every frame is a held breath." })]);
    expect(screen.getByText("Every frame is a held breath.")).toBeTruthy();
  });

  it("links the plate out to the entry and shows its rating", () => {
    wall([film()]);
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe(
      "https://letterboxd.com/alantai/film/past-lives/",
    );
    expect(screen.getByLabelText("Rated 4.5 of 5")).toBeTruthy();
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
    expect(screen.queryByText("A post, not a film")).toBeNull();
    expect(screen.getByText("Past Lives")).toBeTruthy();
  });
});
