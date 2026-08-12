import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { cleanup, render } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router";
import { OverlayFace } from "@/book3d/BookStage";
import { ALL_PAGE_KEYS, FarmFace, pageKey } from "@/book3d/pageTextures";
import { SPREADS } from "@/magazine/folio";

const renderableFaces = SPREADS.flatMap((spread, spreadIndex) =>
  (["verso", "recto"] as const)
    .filter((face) => ALL_PAGE_KEYS.includes(pageKey(spreadIndex, face)))
    .map((face) => ({
      face,
      label: `${spread.id}:${face}`,
      spread: spreadIndex,
    })),
);

/** React useId values differ between the two copies even when their markup is
 * equivalent. Canonicalize IDs by document order while preserving every
 * relationship between id, aria-controls, and aria-labelledby. */
function canonicalChildren(root: Element): string {
  const idMap = new Map(
    Array.from(root.querySelectorAll<HTMLElement>("[id]"), (element, index) => [
      element.id,
      `generated-id-${index}`,
    ]),
  );

  const canonicalValue = (name: string, value: string) => {
    if (name === "id") return idMap.get(value) ?? value;
    if (name === "aria-controls" || name === "aria-labelledby") {
      return value
        .split(/\s+/)
        .map((part) => idMap.get(part) ?? part)
        .join(" ");
    }
    return value;
  };

  const serialize = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) {
      return `text(${node.textContent ?? ""})`;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return "";

    const element = node as Element;
    const attributes = Array.from(element.attributes)
      .map(
        ({ name, value }) =>
          `${name}=${JSON.stringify(canonicalValue(name, value))}`,
      )
      .sort()
      .join(" ");
    const children = Array.from(element.childNodes, serialize).join("");
    return `<${element.tagName.toLowerCase()}${attributes ? ` ${attributes}` : ""}>${children}</${element.tagName.toLowerCase()}>`;
  };

  return Array.from(root.childNodes, serialize).join("");
}

const originalMatchMedia = window.matchMedia;

beforeAll(() => {
  // Keep component entrance effects from mutating one side of the comparison.
  // The capture farm suppresses those effects in production as well.
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: () => ({
      addEventListener() {},
      addListener() {},
      dispatchEvent: () => false,
      matches: true,
      media: "(prefers-reduced-motion: reduce)",
      onchange: null,
      removeEventListener() {},
      removeListener() {},
    }),
  });
});

afterEach(cleanup);

afterAll(() => {
  if (originalMatchMedia) {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: originalMatchMedia,
    });
  } else {
    Reflect.deleteProperty(window, "matchMedia");
  }
});

describe("live page and capture-farm parity", () => {
  it("covers every page face that can become a WebGL texture", () => {
    expect(renderableFaces.map(({ spread, face }) => pageKey(spread, face))).toEqual(
      ALL_PAGE_KEYS,
    );
  });

  it.each(renderableFaces)(
    "keeps $label content structurally identical",
    ({ spread, face }) => {
      const { container } = render(
        <MemoryRouter>
          <div data-live-test-face="">
            <OverlayFace spread={spread} face={face} showGrid={false} />
          </div>
          <div data-capture-farm="" aria-hidden>
            <FarmFace spread={spread} face={face} />
          </div>
        </MemoryRouter>,
      );

      const live = container.querySelector<HTMLElement>(
        "[data-live-test-face] > .ov-face",
      );
      const captured = container.querySelector<HTMLElement>(
        `[data-capture-key="${pageKey(spread, face)}"]`,
      );

      expect(live).not.toBeNull();
      expect(captured).not.toBeNull();
      for (const root of [live!, captured!]) {
        expect(root.classList).toContain("page-face");
        expect(root.classList).toContain(`page-face--${face}`);
      }
      expect(canonicalChildren(captured!)).toBe(canonicalChildren(live!));
    },
  );
});

const CAPTURE_STYLE_ROOT = resolve(process.cwd(), "src/styles");
const CAPTURE_GLOBAL_STYLES = new Set([
  "base.css",
  "book-stage.css",
  "fonts.css",
  "furniture.css",
  "print-details.css",
  "tokens.css",
]);
const UNSUPPORTED_LAYOUT_PSEUDO = /:{1,2}(first-letter|first-line|marker)\b/g;

async function capturedStyleFiles(): Promise<string[]> {
  const spreadRoot = resolve(CAPTURE_STYLE_ROOT, "spreads");
  const [globalEntries, spreadEntries] = await Promise.all([
    readdir(CAPTURE_STYLE_ROOT, { withFileTypes: true }),
    readdir(spreadRoot, { withFileTypes: true }),
  ]);

  return [
    ...globalEntries
      .filter((entry) => entry.isFile() && CAPTURE_GLOBAL_STYLES.has(entry.name))
      .map((entry) => resolve(CAPTURE_STYLE_ROOT, entry.name)),
    ...spreadEntries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".css"))
      .map((entry) => resolve(spreadRoot, entry.name)),
  ];
}

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, (comment) =>
    comment.replace(/[^\n]/g, " "),
  );
}

describe("capture-compatible page CSS", () => {
  it("does not style layout-bearing pseudo-elements the rasterizer omits", async () => {
    const violations: string[] = [];

    for (const file of await capturedStyleFiles()) {
      const source = withoutComments(await readFile(file, "utf8"));
      for (const match of source.matchAll(UNSUPPORTED_LAYOUT_PSEUDO)) {
        const offset = match.index ?? 0;
        const line = source.slice(0, offset).split("\n").length;
        violations.push(`${file.split("/src/styles/")[1]}:${line} ${match[0]}`);
      }
    }

    expect(
      violations,
      "html-to-image 1.11.13 clones ::before and ::after, but not text/layout pseudo-elements. Render these marks as real elements so live DOM and moving textures share the same box tree.",
    ).toEqual([]);
  });
});
