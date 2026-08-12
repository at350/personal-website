import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import {
  getPersistentInteractionSnapshot,
  setPersistentInteractionOpenKey,
} from "@/magazine/persistent-interactions";
import { resume } from "@/lib/content";
import { ProjectsOpener } from "@/spreads/ProjectsOpener";
import { Resume } from "@/spreads/Resume";

const resetPersistentState = () => {
  setPersistentInteractionOpenKey("features", null);
  setPersistentInteractionOpenKey("resume", null);
};

beforeEach(resetPersistentState);
afterEach(() => {
  cleanup();
  resetPersistentState();
  vi.restoreAllMocks();
});

describe("persistent page interactions", () => {
  it("keeps visible and capture-farm project rows synchronized", () => {
    render(
      <MemoryRouter>
        <ProjectsOpener face="recto" mode="book" />
        <div data-capture-farm="">
          <ProjectsOpener face="recto" mode="book" />
        </div>
      </MemoryRouter>,
    );
    const rows = screen.getAllByRole("button", { name: /Prophis/ });
    const initialRevision = getPersistentInteractionSnapshot("features").revision;

    fireEvent.click(rows[0]!);

    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.getAttribute("aria-expanded") === "true")).toBe(
      true,
    );
    expect(getPersistentInteractionSnapshot("features")).toEqual({
      openKey: "prophis",
      revision: initialRevision + 1,
    });

    fireEvent.click(rows[0]!);
    expect(rows.every((row) => row.getAttribute("aria-expanded") === "false")).toBe(
      true,
    );
    expect(getPersistentInteractionSnapshot("features").revision).toBe(
      initialRevision + 2,
    );
  });

  it("keeps resume notes synchronized while only the visible copy owns dismiss listeners", () => {
    const addEventListener = vi.spyOn(window, "addEventListener");
    const entry = resume.entries.find((item) => item.kind === "current")!;
    render(
      <>
        <Resume face="verso" mode="book" />
        <div data-capture-farm="">
          <Resume face="verso" mode="book" />
        </div>
      </>,
    );
    const marks = screen.getAllByRole("button", {
      name: entry.marginalia.ariaLabel,
    });
    const initialRevision = getPersistentInteractionSnapshot("resume").revision;

    fireEvent.click(marks[0]!);

    expect(marks).toHaveLength(2);
    expect(marks.every((mark) => mark.getAttribute("aria-expanded") === "true")).toBe(
      true,
    );
    expect(getPersistentInteractionSnapshot("resume")).toEqual({
      openKey: entry.id,
      revision: initialRevision + 1,
    });
    expect(
      addEventListener.mock.calls.filter(([type]) => type === "keydown"),
    ).toHaveLength(1);
    expect(
      addEventListener.mock.calls.filter(([type]) => type === "pointerdown"),
    ).toHaveLength(1);
  });

  it("does not increment a spread revision for an unchanged key", () => {
    const first = setPersistentInteractionOpenKey("features", "prophis");
    const unchanged = setPersistentInteractionOpenKey("features", "prophis");

    expect(unchanged).toBe(first);
    expect(unchanged.revision).toBe(first.revision);
  });
});
