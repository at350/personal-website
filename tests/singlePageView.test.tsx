import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { FACES, faceForSpread, SPREADS } from "@/magazine/folio";
import { SinglePageView } from "@/single/SinglePageView";

/* Every other component suite in this repo stubs matchMedia to false for all
   queries, which pins the desktop/hover path. This one is the touch path, so
   it answers the coarse-pointer queries the way a phone does. */
function stubMatchMedia(reducedMotion = false) {
  vi.stubGlobal(
    "matchMedia",
    (query: string) => ({
      matches: query.includes("prefers-reduced-motion") ? reducedMotion : true,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  );
}

function renderIssue(props: Partial<Parameters<typeof SinglePageView>[0]> = {}) {
  const onSpreadSettled = vi.fn();
  const view = render(
    <MemoryRouter>
      <SinglePageView targetSpread={0} onSpreadSettled={onSpreadSettled} {...props} />
    </MemoryRouter>,
  );
  return { ...view, onSpreadSettled };
}

/** The paper is the gesture surface; jsdom has no pointer capture. */
function paperOf(container: HTMLElement) {
  const paper = container.querySelector<HTMLElement>(".single__paper")!;
  paper.setPointerCapture = vi.fn();
  paper.releasePointerCapture = vi.fn();
  Object.defineProperty(paper, "clientWidth", { value: 360, configurable: true });
  return paper;
}

function pointer(type: string, x: number, y: number, t: number) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, { pointerId: 1, button: 0, clientX: x, clientY: y });
  Object.defineProperty(event, "timeStamp", { value: t, configurable: true });
  return event;
}

/** Drag from `from` to `to` over `ms`, then release. */
function swipe(paper: HTMLElement, from: number, to: number, ms = 200) {
  act(() => {
    paper.dispatchEvent(pointer("pointerdown", from, 400, 0));
    // First move engages the turn, second carries it.
    paper.dispatchEvent(pointer("pointermove", from + (to - from) * 0.25, 400, ms * 0.25));
    paper.dispatchEvent(pointer("pointermove", to, 402, ms));
    paper.dispatchEvent(pointer("pointerup", to, 402, ms));
  });
}

beforeEach(() => stubMatchMedia());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("the touch reader", () => {
  it("locks document scrolling while the stage is up", () => {
    const { unmount } = renderIssue();
    expect(document.documentElement.classList.contains("fn-lock-scroll")).toBe(
      true,
    );
    unmount();
    expect(document.documentElement.classList.contains("fn-lock-scroll")).toBe(
      false,
    );
  });

  it("opens on the cover and mounts its neighbour ready to be turned to", () => {
    const { container } = renderIssue();

    expect(container.querySelectorAll(".single__face--under")).toHaveLength(1);
    // The next face is mounted but hidden, so its images decode before the turn.
    expect(container.querySelectorAll(".single__face--ready").length).toBeGreaterThan(0);
    expect(container.querySelector(".single__leaf")).toBeNull();
  });

  it("commits a full swipe and reports the spread it landed on", async () => {
    stubMatchMedia(true); // settle instantly; the spring has its own suite
    const { container, onSpreadSettled } = renderIssue();
    const paper = paperOf(container);

    swipe(paper, 320, 20);

    await waitFor(() => {
      // Face 0 is the cover; face 1 is the contents verso, spread 1.
      expect(onSpreadSettled).toHaveBeenCalledWith(1);
    });
  });

  it("rolls back a timid drag rather than turning the page", async () => {
    stubMatchMedia(true);
    const { container, onSpreadSettled } = renderIssue();
    const paper = paperOf(container);
    onSpreadSettled.mockClear();

    // 40px of a 324px span, released slowly: under COMMIT_THRESHOLD, no fling.
    swipe(paper, 320, 280, 600);

    await waitFor(() => {
      expect(container.querySelector(".single__leaf")).toBeNull();
    });
    expect(onSpreadSettled).not.toHaveBeenCalledWith(1);
  });

  it("leaves a vertical drag to the browser, so long pages still scroll", () => {
    const { container } = renderIssue();
    const paper = paperOf(container);

    act(() => {
      paper.dispatchEvent(pointer("pointerdown", 200, 300, 0));
      paper.dispatchEvent(pointer("pointermove", 208, 420, 90));
    });

    expect(container.querySelector(".single__leaf")).toBeNull();
  });

  it("commits a full swipe even when Safari cancels the pointer", async () => {
    stubMatchMedia(true);
    const { container, onSpreadSettled } = renderIssue();
    const paper = paperOf(container);

    act(() => {
      paper.dispatchEvent(pointer("pointerdown", 320, 400, 0));
      paper.dispatchEvent(pointer("pointermove", 250, 400, 50));
      paper.dispatchEvent(pointer("pointermove", 20, 402, 200));
      paper.dispatchEvent(pointer("pointercancel", 20, 402, 210));
    });

    await waitFor(() => expect(onSpreadSettled).toHaveBeenCalledWith(1));
  });

  it("rolls back when Safari cancels a timid drag", async () => {
    stubMatchMedia(true);
    const { container, onSpreadSettled } = renderIssue();
    const paper = paperOf(container);
    onSpreadSettled.mockClear();

    act(() => {
      paper.dispatchEvent(pointer("pointerdown", 320, 400, 0));
      paper.dispatchEvent(pointer("pointermove", 280, 400, 600));
      paper.dispatchEvent(pointer("pointercancel", 280, 400, 620));
    });

    await waitFor(() => {
      expect(container.querySelector(".single__leaf")).toBeNull();
    });
    expect(onSpreadSettled).not.toHaveBeenCalledWith(1);
  });

  it("turns by arrow key, and the announcer names the landed page", async () => {
    stubMatchMedia(true);
    const { onSpreadSettled } = renderIssue();

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    });

    await waitFor(() => expect(onSpreadSettled).toHaveBeenCalledWith(1));
    expect(screen.getByRole("status").textContent).toContain(SPREADS[1]!.label);
  });

  it("cannot be turned off either end of the issue", () => {
    const { container } = renderIssue();
    const [back, forward] = Array.from(
      container.querySelectorAll<HTMLButtonElement>(".single__step"),
    );

    expect(back!.disabled).toBe(true);
    expect(forward!.disabled).toBe(false);
  });

  it("follows the address bar to another spread", async () => {
    stubMatchMedia(true);
    const { rerender, onSpreadSettled } = renderIssue();

    rerender(
      <MemoryRouter>
        <SinglePageView targetSpread={6} onSpreadSettled={onSpreadSettled} />
      </MemoryRouter>,
    );

    await waitFor(() => expect(onSpreadSettled).toHaveBeenCalledWith(6));
  });

  it("lands a route on the spread's first face, never mid-spread", () => {
    const resume = SPREADS.findIndex((s) => s.id === "resume");
    expect(FACES[faceForSpread(resume)]!.side).toBe("verso");
  });
});
