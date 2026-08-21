import { describe, expect, it } from "vitest";
import {
  BOOK_HARD_MIN,
  BOOK_MIN_WIDTH,
  autoMode,
  isTouchPrimary,
  resolveViewMode,
} from "@/magazine/useViewportMode";

describe("touch-primary detection", () => {
  it("treats either a hover-none or a coarse pointer as a touch screen", () => {
    expect(isTouchPrimary(false, false)).toBe(false);
    expect(isTouchPrimary(true, false)).toBe(true);
    expect(isTouchPrimary(false, true)).toBe(true);
    expect(isTouchPrimary(true, true)).toBe(true);
  });
});

describe("the default experience", () => {
  it("opens the stacked reader under reduced motion, even on a wide desktop", () => {
    expect(autoMode(true, 1440, false)).toBe("reader");
    expect(autoMode(true, 390, true)).toBe("reader");
  });

  it("opens the single-page reader on a phone, regardless of landscape width", () => {
    expect(autoMode(false, 390, true)).toBe("single");
    // iPhone Pro Max landscape is wider than the book's minimum.
    expect(autoMode(false, 932, true)).toBe("single");
  });

  it("opens the single-page reader on an iPad-width coarse pointer", () => {
    expect(autoMode(false, 1024, true)).toBe("single");
    expect(autoMode(false, BOOK_MIN_WIDTH, true)).toBe("single");
  });

  it("opens the book on a wide fine-pointer desktop", () => {
    expect(autoMode(false, 1440, false)).toBe("book");
    expect(autoMode(false, BOOK_MIN_WIDTH, false)).toBe("book");
  });

  it("opens the single-page reader on a narrow fine-pointer window", () => {
    expect(autoMode(false, BOOK_MIN_WIDTH - 1, false)).toBe("single");
    expect(autoMode(false, 640, false)).toBe("single");
  });
});

describe("a stored preference", () => {
  it("opens the book when asked, even on a coarse pointer, if the screen is wide enough", () => {
    expect(resolveViewMode("book", false, 1024, true)).toBe("book");
    expect(resolveViewMode("book", false, BOOK_HARD_MIN, true)).toBe("book");
  });

  it("falls back to the automatic mode when the book cannot fit", () => {
    expect(resolveViewMode("book", false, BOOK_HARD_MIN - 1, true)).toBe("single");
    expect(resolveViewMode("book", true, BOOK_HARD_MIN - 1, false)).toBe("reader");
    expect(resolveViewMode("book", false, BOOK_HARD_MIN - 1, false)).toBe("single");
  });

  it("honors single and reader on any screen", () => {
    expect(resolveViewMode("single", false, 1440, false)).toBe("single");
    expect(resolveViewMode("reader", false, 390, true)).toBe("reader");
    expect(resolveViewMode("reader", false, 1440, false)).toBe("reader");
  });

  it("uses the automatic mode when nothing is stored", () => {
    expect(resolveViewMode(null, false, 1440, false)).toBe("book");
    expect(resolveViewMode(null, false, 1024, true)).toBe("single");
    expect(resolveViewMode(null, true, 1440, false)).toBe("reader");
  });
});
