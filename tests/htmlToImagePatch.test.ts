import { describe, expect, it, vi } from "vitest";
import { toSvg } from "html-to-image";

describe("page texture font metrics", () => {
  it("preserves fractional computed font sizes in the rasterized clone", async () => {
    // html-to-image performs this instanceof check even when the tree has no
    // SVG images; jsdom does not expose the browser constructor by default.
    const svgImageElement = Object.getOwnPropertyDescriptor(
      globalThis,
      "SVGImageElement",
    );
    Object.defineProperty(globalThis, "SVGImageElement", {
      configurable: true,
      value: SVGElement,
    });
    const nativeGetComputedStyle = window.getComputedStyle.bind(window);
    const getComputedStyle = vi
      .spyOn(window, "getComputedStyle")
      .mockImplementation((element, pseudoElement) => {
        if (pseudoElement) return document.createElement("span").style;

        // Chromium leaves CSSStyleDeclaration.cssText empty here, which sends
        // html-to-image through its property-by-property cloning path. jsdom
        // populates cssText, so mirror Chromium to exercise the real bug.
        const style = nativeGetComputedStyle(element);
        return new Proxy(style, {
          get(target, property) {
            if (property === "cssText") return "";
            const value = Reflect.get(target, property, target);
            return typeof value === "function" ? value.bind(target) : value;
          },
        });
      });
    const source = document.createElement("div");
    source.style.fontSize = "14.72px";
    source.textContent = "pixel twin";
    document.body.append(source);

    try {
      const dataUrl = await toSvg(source, {
        width: 160,
        height: 40,
        skipFonts: true,
        includeStyleProperties: ["font-size"],
      });
      const svg = decodeURIComponent(dataUrl.slice(dataUrl.indexOf(",") + 1));

      expect(svg).toContain("font-size: 14.72px");
      expect(svg).not.toContain("font-size: 13.9px");
    } finally {
      getComputedStyle.mockRestore();
      source.remove();
      if (svgImageElement) {
        Object.defineProperty(globalThis, "SVGImageElement", svgImageElement);
      } else {
        Reflect.deleteProperty(globalThis, "SVGImageElement");
      }
    }
  });
});

describe("per-call includeStyleProperties", () => {
  it("serializes only the properties each call names", async () => {
    const svgImageElement = Object.getOwnPropertyDescriptor(globalThis, "SVGImageElement");
    Object.defineProperty(globalThis, "SVGImageElement", { configurable: true, value: SVGElement });
    const nativeGetComputedStyle = window.getComputedStyle.bind(window);
    const spy = vi.spyOn(window, "getComputedStyle").mockImplementation((element, pseudoElement) => {
      if (pseudoElement) return document.createElement("span").style;
      const style = nativeGetComputedStyle(element);
      return new Proxy(style, {
        get(target, property) {
          if (property === "cssText") return "";
          const value = Reflect.get(target, property, target);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
    });
    const source = document.createElement("div");
    source.className = "two-calls";
    source.textContent = "two calls";
    // A stylesheet rule, not inline: html-to-image clones inline styles verbatim.
    const sheet = document.createElement("style");
    sheet.textContent = ".two-calls{font-size:14.72px;letter-spacing:3px}";
    document.head.append(sheet);
    document.body.append(source);
    const svgOf = async (props: string[]) => {
      const url = await toSvg(source, { width: 160, height: 40, skipFonts: true, includeStyleProperties: props });
      return decodeURIComponent(url.slice(url.indexOf(",") + 1));
    };
    try {
      const first = await svgOf(["font-size"]);
      const second = await svgOf(["letter-spacing"]);
      expect(first).toContain("font-size: 14.72px");
      expect(first).not.toContain("letter-spacing");
      expect(second).toContain("letter-spacing: 3px");
      expect(second).not.toContain("font-size: 14.72px");
    } finally {
      spy.mockRestore();
      source.remove();
      sheet.remove();
      if (svgImageElement) Object.defineProperty(globalThis, "SVGImageElement", svgImageElement);
      else Reflect.deleteProperty(globalThis, "SVGImageElement");
    }
  });
});
