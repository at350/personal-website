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
    onPose: ((pose: number, handoff: number) => void) | null;
    target: number | null;
    pointerActive: boolean;
    pointerX: number;
    pointerY: number;
    foilPointerX: number;
    foilPointerY: number;
  },
  onRiffleComplete: null as null | (() => void),
  drift: undefined as
    | undefined
    | {
        active: boolean;
        landing: boolean;
        onLanded?: () => void;
      },
}));

vi.mock("@/book3d/BookScene", () => ({
  BookScene: ({
    motion,
    onRiffleComplete,
    drift,
  }: {
    motion: NonNullable<typeof scene.motion>;
    onRiffleComplete: () => void;
    drift: typeof scene.drift;
  }) => {
    scene.motion = motion;
    scene.onRiffleComplete = onRiffleComplete;
    scene.drift = drift;
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

/* Every mocked face carries an image that jsdom will never load, so the
   overlay-readiness gate stays observable: tests decide when a page's
   pictures "arrive" by firing load events. */
vi.mock("@/magazine/issue-map", () => ({
  ISSUE: Array.from({ length: 11 }, () => ({
    Component: () => <img src="/plate.png" alt="" />,
  })),
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

function renderStage(
  targetSpread = 0,
  experienceMode: "read" | "ignite" | "drift" = "read",
  onExperienceModeChange?: (mode: string) => void,
) {
  const onSpreadSettled = vi.fn();
  const view = render(
    <BookStage
      targetSpread={targetSpread}
      onSpreadSettled={onSpreadSettled}
      experienceMode={experienceMode}
      onExperienceModeChange={onExperienceModeChange}
    />,
  );
  const stage = view.container.querySelector(".bstage")!;
  return { ...view, onSpreadSettled, stage };
}

/** Drains the microtask-deferred mode-transition state (the ignite pattern
    both modes share for entering/leaving). */
async function settleModeTransition() {
  await act(async () => {
    await Promise.resolve();
  });
}

/** The scene reports a flat, aligned book — the drift/ignite ready signal. */
async function reportFlatPose() {
  await act(async () => {
    scene.motion?.onPose?.(1, 1);
    await Promise.resolve();
  });
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
  scene.drift = undefined;
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

  it("locks navigation and floats the leaves once flat in Drift mode", async () => {
    stubMatchMedia();
    const { stage } = renderStage(1, "drift");

    expect(stage.getAttribute("data-experience")).toBe("drift");
    expect(stage.classList.contains("bstage--drift")).toBe(true);
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
    await settleModeTransition();
    // Still flattening: the floating book has not mounted yet.
    expect(screen.getByRole("status").textContent).toContain(
      "Opening the spread",
    );
    expect(scene.drift).toBeUndefined();

    await reportFlatPose();

    expect(stage.classList.contains("bstage--drift-ready")).toBe(true);
    expect(scene.drift?.active).toBe(true);
    expect(scene.drift?.landing).toBe(false);
    expect(screen.getByRole("status").textContent).toContain(
      "Gravity letting go",
    );
  });

  it("lands the leaves through Escape before releasing the page-turn lock", async () => {
    stubMatchMedia();
    const onExperienceModeChange = vi.fn();
    const { rerender, stage } = renderStage(1, "drift", onExperienceModeChange);
    await settleModeTransition();
    await reportFlatPose();
    expect(scene.drift?.active).toBe(true);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onExperienceModeChange).toHaveBeenCalledTimes(1);
    expect(onExperienceModeChange).toHaveBeenLastCalledWith("read");

    // The owner flips the mode; the leaves glide home before anything unlocks.
    await act(async () => {
      rerender(
        <BookStage
          targetSpread={1}
          experienceMode="read"
          onExperienceModeChange={onExperienceModeChange}
        />,
      );
      await Promise.resolve();
    });
    expect(scene.drift?.active).toBe(true);
    expect(scene.drift?.landing).toBe(true);
    expect(screen.getByRole("status").textContent).toContain("Re-collating");
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: "Next spread" })
        .disabled,
    ).toBe(true);

    act(() => {
      scene.drift?.onLanded?.();
    });
    expect(scene.drift).toBeUndefined();
    expect(stage.classList.contains("bstage--drift")).toBe(false);
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: "Next spread" })
        .disabled,
    ).toBe(false);
  });

  it("lands the drift from Escape even while a button holds focus", async () => {
    stubMatchMedia();
    const onExperienceModeChange = vi.fn();
    renderStage(1, "drift", onExperienceModeChange);
    await settleModeTransition();
    await reportFlatPose();

    // Entering via the dock leaves focus on a button; that keydown target
    // must not swallow the exit key.
    const next = screen.getByRole("button", { name: "Next spread" });
    next.focus();
    fireEvent.keyDown(next, { key: "Escape" });

    expect(onExperienceModeChange).toHaveBeenCalledTimes(1);
    expect(onExperienceModeChange).toHaveBeenLastCalledWith("read");
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

  it("pre-renders the landing spread in the overlay while paper is in flight", () => {
    stubMatchMedia();
    const { container } = renderStage(1);
    const overlay = container.querySelector<HTMLElement>(".bstage__spread")!;
    // At rest the overlay shows the current spread's folios (pages 02–03).
    expect(overlay.textContent).toContain("02");

    pointerTap(screen.getByRole("button", { name: "Next spread" }), 1);
    // The destination's DOM mounts at launch, so its images and entrance
    // motion settle during the flight, not at the swap...
    expect(overlay.textContent).toContain("04");
    expect(overlay.textContent).not.toContain("02");

    completeTurn();
    // ...and the landing commit leaves that DOM untouched.
    expect(overlay.textContent).toContain("04");
  });

  it("pre-renders a riffle's destination during the jump", () => {
    stubMatchMedia();
    const { rerender, container } = renderStage(1);
    const overlay = container.querySelector<HTMLElement>(".bstage__spread")!;

    rerender(<BookStage targetSpread={6} />);
    expect(overlay.textContent).toContain("12");

    completeRiffle();
    expect(overlay.textContent).toContain("12");
  });

  it("holds the DOM handoff until the landed spread's images settle", async () => {
    stubMatchMedia();
    const { container } = renderStage(1);
    const overlay = container.querySelector<HTMLElement>(".bstage__spread")!;
    const arriveImages = async () => {
      await act(async () => {
        for (const image of Array.from(overlay.querySelectorAll("img"))) {
          fireEvent.load(image);
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    };

    // Even a perfectly aligned book keeps the canvas while images are pending.
    act(() => scene.motion?.onPose?.(1, 1));
    expect(overlay.style.opacity).toBe("0");
    expect(overlay.style.pointerEvents).toBe("none");

    await arriveImages();
    act(() => scene.motion?.onPose?.(1, 1));
    expect(overlay.style.opacity).toBe("1");
    expect(overlay.style.visibility).toBe("visible");
    expect(overlay.style.pointerEvents).toBe("auto");

    // A turn re-arms the gate for the incoming spread's freshly mounted DOM.
    pointerTap(screen.getByRole("button", { name: "Next spread" }), 1);
    act(() => scene.motion?.onPose?.(1, 1));
    expect(overlay.style.opacity).toBe("0");
    expect(overlay.style.pointerEvents).toBe("none");

    await arriveImages();
    act(() => scene.motion?.onPose?.(1, 1));
    expect(overlay.style.opacity).toBe("1");
    expect(overlay.style.pointerEvents).toBe("auto");
  });

  it("opens the keys sheet on ? and keeps the arrows off the paper while it shows", () => {
    stubMatchMedia();
    const { stage } = renderStage(1);
    expect(screen.queryByRole("dialog", { name: "Keys" })).toBeNull();

    fireEvent.keyDown(window, { key: "?" });
    const sheet = screen.getByRole("dialog", { name: "Keys" });
    expect(sheet.getAttribute("aria-modal")).toBe("true");
    expect(
      screen
        .getByRole("button", { name: "Keyboard shortcuts" })
        .getAttribute("aria-expanded"),
    ).toBe("true");

    // The arrow is explained on the sheet, not acted on behind it.
    fireEvent.keyDown(window, { key: "ArrowRight", repeat: false });
    fireEvent.keyDown(window, { key: "Home" });
    fireEvent.keyDown(window, { key: "g" });
    expect(stage.getAttribute("aria-busy")).toBe("false");
    expect(screen.getByRole("button", { name: "Contents" }).textContent).toBe(
      "02-03",
    );
    expect(stage.querySelector(".grid-overlay")).toBeNull();

    // A second ? puts the sheet away again, and the arrow is live once more.
    fireEvent.keyDown(window, { key: "?" });
    expect(screen.queryByRole("dialog", { name: "Keys" })).toBeNull();
    fireEvent.keyDown(window, { key: "ArrowRight", repeat: false });
    expect(stage.getAttribute("aria-busy")).toBe("true");
  });

  it("closes the keys sheet on Escape and returns focus to where it was", () => {
    stubMatchMedia();
    renderStage(1);
    const next = screen.getByRole("button", { name: "Next spread" });
    next.focus();

    // "?" toggles even from a button — the interactive-target guard that
    // keeps arrows away from focused controls must not swallow it.
    fireEvent.keyDown(next, { key: "?" });
    const sheet = screen.getByRole("dialog", { name: "Keys" });
    expect(sheet.contains(document.activeElement)).toBe(true);

    fireEvent.keyDown(sheet, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Keys" })).toBeNull();
    expect(document.activeElement).toBe(next);
  });

  it("toggles the keys sheet from the nav button without a press-and-click double flip", () => {
    stubMatchMedia();
    renderStage(1);
    const help = screen.getByRole("button", { name: "Keyboard shortcuts" });
    expect(help.getAttribute("aria-expanded")).toBe("false");

    pointerTap(help, 1);
    expect(screen.getByRole("dialog", { name: "Keys" })).toBeTruthy();
    expect(help.getAttribute("aria-expanded")).toBe("true");

    // The outside-press listener must leave the toggle alone, or the
    // pointerdown would close what the click then reopens.
    pointerTap(help, 2);
    expect(screen.queryByRole("dialog", { name: "Keys" })).toBeNull();
    expect(help.getAttribute("aria-expanded")).toBe("false");
  });

  it("puts the keys sheet away on a press beside it and via its close button", () => {
    stubMatchMedia();
    const { stage } = renderStage(1);

    fireEvent.keyDown(window, { key: "?" });
    expect(screen.getByRole("dialog", { name: "Keys" })).toBeTruthy();
    fireEvent.pointerDown(stage, { button: 0, pointerId: 3, pointerType: "mouse" });
    expect(screen.queryByRole("dialog", { name: "Keys" })).toBeNull();

    fireEvent.keyDown(window, { key: "?" });
    fireEvent.click(
      screen.getByRole("button", { name: "Close keyboard shortcuts" }),
    );
    expect(screen.queryByRole("dialog", { name: "Keys" })).toBeNull();
  });

  it("opens the keys sheet over an active drift and lets Escape close it first", async () => {
    stubMatchMedia();
    const onExperienceModeChange = vi.fn();
    renderStage(1, "drift", onExperienceModeChange);
    await settleModeTransition();
    await reportFlatPose();
    expect(scene.drift?.active).toBe(true);

    // The lock keeps the arrows off the paper, not the sheet off the stage.
    fireEvent.keyDown(window, { key: "?" });
    expect(screen.getByRole("dialog", { name: "Keys" })).toBeTruthy();

    // One Escape puts the slip away; only the next one lands the leaves.
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Keys" })).toBeNull();
    expect(onExperienceModeChange).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onExperienceModeChange).toHaveBeenCalledTimes(1);
    expect(onExperienceModeChange).toHaveBeenLastCalledWith("read");
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
