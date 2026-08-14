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
    pointerActive: boolean;
    pointerX: number;
    pointerY: number;
    foilPointerX: number;
    foilPointerY: number;
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

function renderStage(targetSpread = 0, experienceMode: "read" | "ignite" = "read") {
  const onSpreadSettled = vi.fn();
  const view = render(
    <BookStage
      targetSpread={targetSpread}
      onSpreadSettled={onSpreadSettled}
      experienceMode={experienceMode}
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

function pointerTap(button: HTMLElement, pointerId: number) {
  expect(button.hasAttribute("disabled")).toBe(false);
  const pointer = {
    button: 0,
    pointerId,
    pointerType: "mouse",
    isPrimary: true,
  };
  fireEvent.pointerDown(button, pointer);
  fireEvent.pointerUp(button, pointer);
  fireEvent.click(button, { button: 0, detail: 1 });
}

afterEach(() => {
  cleanup();
  scene.motion = null;
  scene.onRiffleComplete = null;
  vi.unstubAllGlobals();
});

describe("BookStage page-turn input", () => {
  it("locks navigation and exposes an armed status in Ignite mode", () => {
    stubMatchMedia();
    const { stage } = renderStage(1, "ignite");

    expect(stage.getAttribute("data-experience")).toBe("ignite");
    expect(stage.classList.contains("bstage--ignite")).toBe(true);
    expect(
      screen.getByRole<HTMLButtonElement>("button", {
        name: "Previous spread",
      }).disabled,
    ).toBe(true);
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: "Next spread" })
        .disabled,
    ).toBe(true);
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: "Contents" })
        .disabled,
    ).toBe(true);
    expect(screen.getByRole("status").textContent).toContain(
      "Flattening the paper",
    );
    expect(
      screen.getByRole("progressbar", { name: "Ignite progress" }).getAttribute(
        "aria-valuenow",
      ),
    ).toBe("0");
    expect(screen.queryByText("Ignite / armed")).toBeNull();
    expect(screen.queryByRole("button", { name: "Restore" })).toBeNull();
  });

  it("keeps the cover foil pointer live while the chassis pose is locked", () => {
    stubMatchMedia();
    const { stage } = renderStage(1);
    const motion = scene.motion!;

    fireEvent.pointerMove(stage, { clientX: 700, clientY: 300 });
    const chassisAtLaunch = { x: motion.pointerX, y: motion.pointerY };

    fireEvent.keyDown(window, { key: "ArrowRight", repeat: false });
    fireEvent.pointerMove(stage, { clientX: 200, clientY: 650 });

    expect({ x: motion.pointerX, y: motion.pointerY }).toEqual(chassisAtLaunch);
    expect({ x: motion.foilPointerX, y: motion.foilPointerY }).not.toEqual(
      chassisAtLaunch,
    );
  });

  it("activates interactive tilt only after the first pointer movement", () => {
    stubMatchMedia();
    const { stage } = renderStage();
    const motion = scene.motion!;

    expect(motion.pointerActive).toBe(false);
    fireEvent.pointerMove(stage, { clientX: 720, clientY: 360 });
    expect(motion.pointerActive).toBe(true);
    expect(Number.isFinite(motion.pointerX)).toBe(true);
    expect(Number.isFinite(motion.pointerY)).toBe(true);
  });

  it("continues a held arrow once per settlement until keyup", () => {
    stubMatchMedia();
    const { onSpreadSettled, stage } = renderStage(1);
    onSpreadSettled.mockClear();

    fireEvent.keyDown(window, { key: "ArrowRight", repeat: false });
    expect(stage.getAttribute("aria-busy")).toBe("true");

    for (let repeat = 0; repeat < 8; repeat += 1) {
      fireEvent.keyDown(window, { key: "ArrowRight", repeat: true });
    }
    completeTurn();
    expect(screen.getByRole("button", { name: "Contents" }).textContent).toBe(
      "04-05",
    );
    expect(stage.getAttribute("aria-busy")).toBe("true");
    expect(onSpreadSettled).not.toHaveBeenCalled();

    for (let repeat = 0; repeat < 8; repeat += 1) {
      fireEvent.keyDown(window, { key: "ArrowRight", repeat: true });
    }
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

  it("queues one forward turn for each deliberate rapid tap", () => {
    stubMatchMedia();
    const { onSpreadSettled, stage } = renderStage(1);
    const next = screen.getByRole("button", { name: "Next spread" });
    const contents = screen.getByRole("button", { name: "Contents" });
    onSpreadSettled.mockClear();

    pointerTap(next, 1);
    pointerTap(next, 2);
    pointerTap(next, 3);
    pointerTap(next, 4);

    completeTurn();
    expect(contents.textContent).toBe("04-05");
    expect(stage.getAttribute("aria-busy")).toBe("true");
    expect(onSpreadSettled).not.toHaveBeenCalled();

    completeTurn();
    expect(contents.textContent).toBe("06-07");
    expect(stage.getAttribute("aria-busy")).toBe("true");

    completeTurn();
    expect(contents.textContent).toBe("08-09");
    expect(stage.getAttribute("aria-busy")).toBe("true");

    completeTurn();
    expect(contents.textContent).toBe("10-11");
    expect(stage.getAttribute("aria-busy")).toBe("false");
    expect(onSpreadSettled).toHaveBeenCalledTimes(1);
    expect(onSpreadSettled).toHaveBeenLastCalledWith(5);
    expect(scene.motion?.onSettled).toBeNull();
  });

  it("counts a tap spanning a settlement exactly once", () => {
    stubMatchMedia();
    const { stage } = renderStage(1);
    const next = screen.getByRole("button", { name: "Next spread" });
    const secondPointer = {
      button: 0,
      pointerId: 2,
      pointerType: "mouse",
      isPrimary: true,
    };

    pointerTap(next, 1);
    fireEvent.pointerDown(next, secondPointer);
    completeTurn();
    fireEvent.pointerUp(next, secondPointer);
    fireEvent.click(next, { button: 0, detail: 1 });

    expect(stage.getAttribute("aria-busy")).toBe("true");
    completeTurn();
    expect(stage.getAttribute("aria-busy")).toBe("false");
    expect(screen.getByRole("button", { name: "Contents" }).textContent).toBe(
      "06-07",
    );
    expect(scene.motion?.onSettled).toBeNull();
  });

  it("preserves the direction of rapid queued taps", () => {
    stubMatchMedia();
    const { stage } = renderStage(4);
    const next = screen.getByRole("button", { name: "Next spread" });
    const previous = screen.getByRole("button", { name: "Previous spread" });

    pointerTap(next, 1);
    pointerTap(previous, 2);

    completeTurn();
    expect(screen.getByRole("button", { name: "Contents" }).textContent).toBe(
      "10-11",
    );
    expect(stage.getAttribute("aria-busy")).toBe("true");

    completeTurn();
    expect(screen.getByRole("button", { name: "Contents" }).textContent).toBe(
      "08-09",
    );
    expect(stage.getAttribute("aria-busy")).toBe("false");
  });

  it("discards excess taps at a physical boundary", () => {
    stubMatchMedia();
    const { onSpreadSettled, stage } = renderStage(9);
    const next = screen.getByRole("button", { name: "Next spread" });
    const previous = screen.getByRole("button", { name: "Previous spread" });
    onSpreadSettled.mockClear();

    pointerTap(next, 1);
    pointerTap(next, 2);
    pointerTap(next, 3);
    completeTurn();

    expect(screen.getByRole("button", { name: "Contents" }).textContent).toBe(
      "END",
    );
    expect(stage.getAttribute("aria-busy")).toBe("false");
    expect(next.hasAttribute("disabled")).toBe(false);
    expect(next.getAttribute("aria-disabled")).toBe("true");
    expect(onSpreadSettled).toHaveBeenCalledTimes(1);
    expect(onSpreadSettled).toHaveBeenLastCalledWith(10);

    pointerTap(previous, 4);
    completeTurn();
    expect(screen.getByRole("button", { name: "Contents" }).textContent).toBe(
      "18-19",
    );
    expect(stage.getAttribute("aria-busy")).toBe("false");
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

  it("runs an absolute jump before preserving buffered taps", () => {
    stubMatchMedia();
    const { onSpreadSettled, rerender, stage } = renderStage(1);
    const next = screen.getByRole("button", { name: "Next spread" });
    onSpreadSettled.mockClear();

    pointerTap(next, 1);
    pointerTap(next, 2);
    rerender(
      <BookStage targetSpread={6} onSpreadSettled={onSpreadSettled} />,
    );
    completeTurn();

    expect(stage.getAttribute("aria-busy")).toBe("true");
    completeRiffle();
    expect(screen.getByRole("button", { name: "Contents" }).textContent).toBe(
      "12-13",
    );
    expect(stage.getAttribute("aria-busy")).toBe("true");

    completeTurn();
    expect(screen.getByRole("button", { name: "Contents" }).textContent).toBe(
      "14-15",
    );
    expect(stage.getAttribute("aria-busy")).toBe("false");
    expect(onSpreadSettled).toHaveBeenCalledTimes(1);
    expect(onSpreadSettled).toHaveBeenLastCalledWith(7);
  });

  it("finishes finite taps before resuming a held arrow", () => {
    stubMatchMedia();
    const { stage } = renderStage(1);
    const next = screen.getByRole("button", { name: "Next spread" });

    pointerTap(next, 1);
    pointerTap(next, 2);
    fireEvent.keyDown(window, { key: "ArrowRight", repeat: false });

    completeTurn();
    expect(screen.getByRole("button", { name: "Contents" }).textContent).toBe(
      "04-05",
    );
    expect(stage.getAttribute("aria-busy")).toBe("true");

    completeTurn();
    expect(screen.getByRole("button", { name: "Contents" }).textContent).toBe(
      "06-07",
    );
    expect(stage.getAttribute("aria-busy")).toBe("true");

    fireEvent.keyUp(window, { key: "ArrowRight" });
    completeTurn();
    expect(screen.getByRole("button", { name: "Contents" }).textContent).toBe(
      "08-09",
    );
    expect(stage.getAttribute("aria-busy")).toBe("false");
  });
});
