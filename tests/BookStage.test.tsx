import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BookStage } from "@/book3d/BookStage";

vi.mock("@react-three/fiber", () => ({
  Canvas: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

const scene = vi.hoisted(() => ({
  motion: null as null | {
    onSettled: (() => void) | null;
    target: number | null;
  },
  onRiffleComplete: null as null | (() => void),
}));

vi.mock("@/book3d/BookScene", () => ({
  BookScene: ({
    motion,
    onRiffleComplete,
  }: {
    motion: NonNullable<typeof scene.motion>;
    onRiffleComplete: () => void;
  }) => {
    scene.motion = motion;
    scene.onRiffleComplete = onRiffleComplete;
    return null;
  },
}));

vi.mock("@/book3d/pageTextures", () => ({
  CaptureFarm: () => null,
  getTextureProgress: () => ({ completed: 20, loaded: 20, total: 20 }),
  isSpreadTextureFresh: () => true,
  pageRasterLayout: () => ({
    pageWidth: 640,
    pageHeight: 853.333,
    spreadWidth: 1280,
    scale: 1,
  }),
  prefetchAround: vi.fn(),
  refreshSpreadTextures: vi.fn(),
}));

vi.mock("@/magazine/issue-map", () => ({
  ISSUE: Array.from({ length: 11 }, () => ({ Component: () => null })),
}));

function stubMatchMedia() {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((media: string) => ({
      matches: false,
      media,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia,
  );
}

function renderStage(targetSpread = 0) {
  const onSpreadSettled = vi.fn();
  const view = render(
    <BookStage
      targetSpread={targetSpread}
      onSpreadSettled={onSpreadSettled}
    />,
  );
  const stage = view.container.querySelector(".bstage")!;
  return { ...view, onSpreadSettled, stage };
}

function completeTurn() {
  const motion = scene.motion;
  const done = motion?.onSettled;
  if (!motion || !done) throw new Error("No page turn is ready to settle");
  act(() => {
    motion.onSettled = null;
    motion.target = null;
    done();
  });
}

function completeRiffle() {
  const done = scene.onRiffleComplete;
  if (!done) throw new Error("No riffle is ready to settle");
  act(() => done());
}

afterEach(() => {
  cleanup();
  scene.motion = null;
  scene.onRiffleComplete = null;
  vi.unstubAllGlobals();
});

describe("BookStage page-turn input", () => {
  it("continues a held arrow once per settlement until keyup", () => {
    stubMatchMedia();
    const { onSpreadSettled, stage } = renderStage(1);
    onSpreadSettled.mockClear();

    fireEvent.keyDown(window, { key: "ArrowRight", repeat: false });
    expect(stage.getAttribute("aria-busy")).toBe("true");

    fireEvent.keyDown(window, { key: "ArrowRight", repeat: true });
    completeTurn();
    expect(screen.getByRole("button", { name: "Contents" }).textContent).toBe(
      "04-05",
    );
    expect(stage.getAttribute("aria-busy")).toBe("true");
    expect(onSpreadSettled).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: "ArrowRight", repeat: true });
    completeTurn();
    expect(screen.getByRole("button", { name: "Contents" }).textContent).toBe(
      "06-07",
    );
    expect(stage.getAttribute("aria-busy")).toBe("true");
    expect(onSpreadSettled).not.toHaveBeenCalled();

    fireEvent.keyUp(window, { key: "ArrowRight" });
    completeTurn();
    expect(screen.getByRole("button", { name: "Contents" }).textContent).toBe(
      "08-09",
    );
    expect(stage.getAttribute("aria-busy")).toBe("false");
    expect(onSpreadSettled).toHaveBeenCalledTimes(1);
    expect(onSpreadSettled).toHaveBeenLastCalledWith(4);

    fireEvent.keyDown(window, { key: "ArrowRight", repeat: false });
    fireEvent.keyUp(window, { key: "ArrowRight" });
    completeTurn();
    expect(screen.getByRole("button", { name: "Contents" }).textContent).toBe(
      "10-11",
    );
    expect(stage.getAttribute("aria-busy")).toBe("false");
    expect(onSpreadSettled).toHaveBeenCalledTimes(2);
  });

  it("drops a pointer press that begins while a page is turning", () => {
    stubMatchMedia();
    const { stage } = renderStage(1);
    const next = screen.getByRole("button", { name: "Next spread" });

    fireEvent.pointerDown(next, {
      button: 0,
      pointerId: 6,
      pointerType: "mouse",
    });
    fireEvent.pointerUp(next, {
      button: 0,
      pointerId: 6,
      pointerType: "mouse",
    });
    fireEvent.click(next, { button: 0, detail: 1 });
    expect(next.hasAttribute("disabled")).toBe(true);

    fireEvent.pointerDown(next, {
      button: 0,
      pointerId: 7,
      pointerType: "mouse",
    });
    completeTurn();
    fireEvent.pointerUp(next, {
      button: 0,
      pointerId: 7,
      pointerType: "mouse",
    });
    fireEvent.click(next, { button: 0, detail: 1 });

    expect(stage.getAttribute("aria-busy")).toBe("false");
    expect(screen.getByRole("button", { name: "Contents" }).textContent).toBe(
      "04-05",
    );
  });

  it("drops a late pointer click when a disabled button suppressed pointerdown", () => {
    stubMatchMedia();
    const { stage } = renderStage(1);
    const next = screen.getByRole("button", { name: "Next spread" });

    fireEvent.keyDown(window, { key: "ArrowRight", repeat: false });
    fireEvent.keyUp(window, { key: "ArrowRight" });
    completeTurn();
    fireEvent.click(next, { button: 0, detail: 1 });

    expect(stage.getAttribute("aria-busy")).toBe("false");
    expect(screen.getByRole("button", { name: "Contents" }).textContent).toBe(
      "04-05",
    );
  });

  it("stops held navigation when the window loses focus", () => {
    stubMatchMedia();
    const { stage } = renderStage(1);

    fireEvent.keyDown(window, { key: "ArrowRight", repeat: false });
    fireEvent.blur(window);
    completeTurn();

    expect(stage.getAttribute("aria-busy")).toBe("false");
    expect(screen.getByRole("button", { name: "Contents" }).textContent).toBe(
      "04-05",
    );
  });

  it("keeps valid pointer and keyboard button activation", () => {
    stubMatchMedia();
    const { stage } = renderStage(1);
    const next = screen.getByRole("button", { name: "Next spread" });

    fireEvent.pointerDown(next, {
      button: 0,
      pointerId: 8,
      pointerType: "mouse",
    });
    fireEvent.pointerUp(next, {
      button: 0,
      pointerId: 8,
      pointerType: "mouse",
    });
    fireEvent.click(next, { button: 0, detail: 1 });
    expect(stage.getAttribute("aria-busy")).toBe("true");
    completeTurn();
    expect(screen.getByRole("button", { name: "Contents" }).textContent).toBe(
      "04-05",
    );

    next.focus();
    expect(fireEvent.keyDown(next, { key: "Enter" })).toBe(true);
    fireEvent.click(next, { detail: 0 });
    fireEvent.keyUp(next, { key: "Enter" });
    expect(stage.getAttribute("aria-busy")).toBe("true");
    completeTurn();
    expect(stage.getAttribute("aria-busy")).toBe("false");
    expect(screen.getByRole("button", { name: "Contents" }).textContent).toBe(
      "06-07",
    );
  });

  it("does not queue a route echo back to the in-flight source spread", () => {
    stubMatchMedia();
    const { onSpreadSettled, rerender, stage } = renderStage();
    const next = screen.getByRole("button", { name: "Next spread" });

    fireEvent.click(next, { detail: 0 });
    completeTurn();
    expect(onSpreadSettled).toHaveBeenLastCalledWith(1);
    fireEvent.click(next, { detail: 0 });
    rerender(<BookStage targetSpread={1} />);
    completeTurn();

    expect(stage.getAttribute("aria-busy")).toBe("false");
    expect(screen.getByRole("button", { name: "Contents" }).textContent).toBe(
      "04-05",
    );
  });

  it("queues an intentional return to the in-flight source spread", () => {
    stubMatchMedia();
    const { rerender, stage } = renderStage(1);

    rerender(<BookStage targetSpread={2} />);
    rerender(<BookStage targetSpread={1} />);
    completeTurn();

    expect(stage.getAttribute("aria-busy")).toBe("true");
    completeTurn();
    expect(stage.getAttribute("aria-busy")).toBe("false");
    expect(screen.getByRole("button", { name: "Contents" }).textContent).toBe(
      "02-03",
    );
  });

  it("keeps an external absolute jump queued during a page turn", () => {
    stubMatchMedia();
    const { rerender, stage } = renderStage(1);

    fireEvent.click(screen.getByRole("button", { name: "Next spread" }), {
      detail: 0,
    });
    rerender(<BookStage targetSpread={6} />);
    completeTurn();

    expect(stage.getAttribute("aria-busy")).toBe("true");
    completeRiffle();

    expect(stage.getAttribute("aria-busy")).toBe("false");
    expect(screen.getByRole("button", { name: "Contents" }).textContent).toBe(
      "12-13",
    );
  });
});
