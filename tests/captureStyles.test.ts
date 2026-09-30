import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ALL = [
  "--accent",
  "color",
  "direction",
  "color-scheme",
  "margin-top",
  "padding-left",
  "opacity",
  "letter-spacing",
  "top",
  "left",
  "width",
  "height",
  "font-size",
  "line-height",
  "background-color",
];

async function load() {
  vi.resetModules();
  return (await import("../src/book3d/captureStyles")).captureStyleProperties;
}

describe("captureStyleProperties", () => {
  let native: typeof window.getComputedStyle;
  beforeEach(() => {
    Object.defineProperty(navigator, "userAgentData", { configurable: true, value: {} });
    native = window.getComputedStyle;
    // jsdom enumerates few properties; give the root a fixed, known list and
    // make every probe element compute alike (no UA-sheet differences).
    vi.spyOn(window, "getComputedStyle").mockImplementation((el: Element) => {
      if (el === document.documentElement) return Object.assign([...ALL], { getPropertyValue: () => "" }) as unknown as CSSStyleDeclaration;
      return { getPropertyValue: () => "" } as unknown as CSSStyleDeclaration;
    });
  });
  afterEach(() => {
    Reflect.deleteProperty(navigator, "userAgentData");
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    window.getComputedStyle = native;
    document.head.innerHTML = "";
    document.body.innerHTML = "";
    document.body.removeAttribute("style");
  });

  it("keeps custom and always-copied properties and drops the rest", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    const props = (await load())(root)!;
    expect(props).toEqual(["--accent", "direction", "color-scheme"]);
  });

  it("collects author properties from nested @media and @keyframes", async () => {
    const style = document.createElement("style");
    style.textContent = `
      .a { margin-top: 1px }
      @media (min-width: 1px) { .b { padding-left: 2px } }
      @keyframes k { from { opacity: 0 } to { opacity: 1 } }`;
    document.head.append(style);
    const root = document.createElement("div");
    document.body.append(root);
    const props = (await load())(root)!;
    expect(props).toEqual(
      expect.arrayContaining(["margin-top", "padding-left", "opacity"]),
    );
    expect(props).not.toContain("letter-spacing");
    expect(props).not.toContain("width");
  });

  it("keeps inline styles on the page and its ancestors", async () => {
    document.body.style.top = "1px";
    const root = document.createElement("div");
    const child = document.createElement("span");
    child.style.letterSpacing = "2px";
    root.append(child);
    document.body.append(root);
    const props = (await load())(root)!;
    expect(props).toContain("top");
    expect(props).toContain("letter-spacing");
    expect(props).not.toContain("width");
  });

  it("returns undefined when a stylesheet cannot be read", async () => {
    const style = document.createElement("style");
    style.textContent = ".a{margin-top:1px}";
    document.head.append(style);
    const sheet = document.styleSheets[0]!;
    Object.defineProperty(sheet, "cssRules", {
      get() {
        throw new DOMException("blocked", "SecurityError");
      },
    });
    const root = document.createElement("div");
    document.body.append(root);
    expect((await load())(root)).toBeUndefined();
  });

  it("returns undefined when anything inside throws", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    const fn = await load();
    vi.spyOn(root, "querySelectorAll").mockImplementation(() => {
      throw new Error("boom");
    });
    expect(fn(root)).toBeUndefined();
  });

  it("returns undefined on an engine that is neither Blink nor Gecko", async () => {
    Reflect.deleteProperty(navigator, "userAgentData");
    vi.stubGlobal("CSS", { supports: () => false });
    const root = document.createElement("div");
    document.body.append(root);
    expect((await load())(root)).toBeUndefined();
  });

  it("runs on Gecko, detected through -moz-appearance", async () => {
    Reflect.deleteProperty(navigator, "userAgentData");
    const supports = vi.fn((name: string) => name === "-moz-appearance");
    vi.stubGlobal("CSS", { supports });
    const root = document.createElement("div");
    document.body.append(root);
    expect((await load())(root)).toEqual(["--accent", "direction", "color-scheme"]);
    expect(supports).toHaveBeenCalledWith("-moz-appearance", "none");
  });

  it("picks up a rule edited in place between calls", async () => {
    const style = document.createElement("style");
    style.textContent = ".a { margin-top: 1px }";
    document.head.append(style);
    const root = document.createElement("div");
    document.body.append(root);
    const fn = await load();
    expect(fn(root)).not.toContain("padding-left");
    const rule = document.styleSheets[0]!.cssRules[0] as CSSStyleRule;
    rule.style.setProperty("padding-left", "3px");
    expect(fn(root)).toContain("padding-left");
  });

  describe("@import", () => {
    // jsdom does not load imports: give the sheet CSSImportRule-shaped objects.
    const withRules = (rules: unknown[]) => {
      const style = document.createElement("style");
      document.head.append(style);
      Object.defineProperty(document.styleSheets[0]!, "cssRules", { get: () => rules });
    };
    const decl = (...names: string[]) => Object.assign([...names], { length: names.length });

    it("walks an imported sheet's rules", async () => {
      withRules([
        { styleSheet: { cssRules: [{ style: decl("letter-spacing") }] } },
      ]);
      const root = document.createElement("div");
      document.body.append(root);
      const props = (await load())(root)!;
      expect(props).toContain("letter-spacing");
      expect(props).not.toContain("width");
    });

    it("returns undefined when an imported sheet cannot be read", async () => {
      withRules([
        {
          styleSheet: {
            get cssRules() {
              throw new DOMException("blocked", "SecurityError");
            },
          },
        },
      ]);
      const root = document.createElement("div");
      document.body.append(root);
      expect((await load())(root)).toBeUndefined();
    });
  });
});
