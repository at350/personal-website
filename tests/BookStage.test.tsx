import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BookStage } from "@/book3d/BookStage";

vi.mock("@react-three/fiber", () => ({
  Canvas: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/book3d/BookScene", () => ({
  BookScene: ({
    motion,
    onRiffleComplete,
  }: {
    motion: { onSettled: (() => void) | null };
    onRiffleComplete: () => void;
  }) => (
    <>
      <button type="button" onClick={() => motion.onSettled?.()}>
        Complete turn
      </button>
      <button type="button" onClick={onRiffleComplete}>
        Complete riffle
      </button>
    </>
  ),
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

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("BookStage page-turn input", () => {
  it("treats a held arrow key as one page turn", () => {
    stubMatchMedia();
    const { stage } = renderStage();

    fireEvent.keyDown(window, { key: "ArrowRight", repeat: false });
    expect(stage.getAttribute("aria-busy")).toBe("true");

    fireEvent.keyDown(window, { key: "ArrowRight", repeat: true });
    fireEvent.click(screen.getByRole("button", { name: "Complete turn" }));
    expect(screen.getByRole("button", { name: "Contents" }).textContent).toBe(
      "02-03",
    );
    expect(stage.getAttribute("aria-busy")).toBe("false");

    fireEvent.keyDown(window, { key: "ArrowRight", repeat: true });
    expect(stage.getAttribute("aria-busy")).toBe("false");
    expect(screen.getByRole("button", { name: "Contents" }).textContent).toBe(
      "02-03",
    );
  });

  it("drops adjacent input while a page is already turning", () => {
    stubMatchMedia();
    const { stage } = renderStage(1);
    const previous = screen.getByRole("button", { name: "Previous spread" });
    const next = screen.getByRole("button", { name: "Next spread" });

    fireEvent.click(next);
    expect(previous.hasAttribute("disabled")).toBe(true);
    expect(next.hasAttribute("disabled")).toBe(true);

    fireEvent.keyDown(window, { key: "ArrowLeft", repeat: false });
    fireEvent.click(screen.getByRole("button", { name: "Complete turn" }));

    expect(stage.getAttribute("aria-busy")).toBe("false");
    expect(screen.getByRole("button", { name: "Contents" }).textContent).toBe(
      "04-05",
    );
  });

  it("keeps an external absolute jump queued during a page turn", () => {
    stubMatchMedia();
    const { rerender, stage } = renderStage(1);

    fireEvent.click(screen.getByRole("button", { name: "Next spread" }));
    rerender(<BookStage targetSpread={6} />);
    fireEvent.click(screen.getByRole("button", { name: "Complete turn" }));

    expect(stage.getAttribute("aria-busy")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Complete riffle" }));

    expect(stage.getAttribute("aria-busy")).toBe("false");
    expect(screen.getByRole("button", { name: "Contents" }).textContent).toBe(
      "12-13",
    );
  });
});
