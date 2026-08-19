import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The library's columns drift continuously, and that drift lives inside a book
 * face — which is blanket-frozen by `.page-face * { animation: none }` so a
 * plate's entrance animation can never disagree with the still texture behind
 * a page turn.
 *
 * The drift is exempted from that freeze by name. It shipped once without the
 * exemption and the wall was simply dead on the book view while working in the
 * reader, which loads no book stylesheet — a failure no visual check of the
 * reader could have caught. These assertions pin the cascade in place.
 */

const css = (path: string): string =>
  readFileSync(join(process.cwd(), "src", "styles", path), "utf8");

const bookStage = css("book-stage.css");
const library = css("spreads/library.css");

/** The blanket freeze, as one line with its selector list and body. */
const BLANKET = /\.page-face\s+([^{]*)\{[^}]*animation:\s*none\s*!important/;

describe("library drift survives the book face freeze", () => {
  it("still freezes everything else inside a book face", () => {
    // The rule must not simply have been deleted to make the drift work.
    expect(BLANKET.test(bookStage)).toBe(true);
    expect(bookStage).toContain("animation: none !important");
  });

  it("exempts the drift track from that freeze", () => {
    const selector = BLANKET.exec(bookStage)?.[1] ?? "";
    expect(selector).toContain(":not(.media-col__track)");
  });

  it("exempts only the track, never the plates inside it", () => {
    // A plate that animated would fade in over the texture it just replaced.
    expect(bookStage).not.toContain(":not(.media-cell)");
    expect(bookStage).not.toContain(":not(.media-plate)");
  });

  it("keeps the capture farm's copy standing still", () => {
    // A column mid-flight rasterizes with blank thumbnails.
    expect(library).toMatch(
      /\[data-capture-key\]\s+\.media-col__track\s*\{[^}]*animation:\s*none/,
    );
  });

  it("still honours prefers-reduced-motion", () => {
    // The file carries several reduced-motion blocks; find the one that
    // actually governs the track rather than assuming an order.
    const blocks = [
      ...library.matchAll(
        /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\n\}/g,
      ),
    ].map((match) => match[1]);
    const governing = blocks.filter((block) =>
      block.includes(".media-col__track"),
    );
    expect(governing).toHaveLength(1);
    expect(governing[0]).toMatch(/animation:\s*none/);
  });
});
