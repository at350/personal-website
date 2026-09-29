/* Which computed properties a page capture has to copy.

   html-to-image clones a page into an SVG image and writes every computed
   CSS property onto every cloned element as an inline declaration — all
   ~520 of them by default. The SVG carries no stylesheets, so a clone ends
   up styled by exactly three things: its inline declarations, the browser's
   own UA stylesheet, and inheritance from its cloned parent.

   A property therefore needs copying only if something other than the UA
   sheet and inheritance can give it a value somewhere on the page: an author
   rule (any sheet, any nesting, keyframes included), an inline style (where
   JS-driven animation writes land), or a UA rule that styles one of the
   page's elements differently from a plain element. Every other property
   computes to the same value in the clone with or without a declaration, and
   copying it only fattens the clone, its serialized SVG, and the SVG's
   decode — about half of all three.

   Custom properties are always copied: html-to-image clones an <svg> subtree
   verbatim, and `var()` references inside it resolve against the custom
   properties inherited from the <svg>'s copied style. A few inherited
   properties that attributes or the document set without any CSS (`lang`,
   `dir`, the color scheme) are always copied too.

   The selection is verified pixel-identical to the full copy for every face
   in Chromium (six viewport sizes and pixel ratios, two library filters) and
   Firefox (two), so it runs on those engines only. In WebKit one face came
   out a few pixels different, so Safari keeps html-to-image's full copy, as
   does any capture where something here cannot be read. */

/** Blink and Gecko: the engines the selection was verified on. */
let verifiedEngine: boolean | null = null;
function onVerifiedEngine(): boolean {
  if (verifiedEngine === null) {
    const blink =
      typeof navigator !== "undefined" && "userAgentData" in navigator;
    const gecko =
      typeof CSS !== "undefined" &&
      typeof CSS.supports === "function" &&
      CSS.supports("-moz-appearance", "none");
    verifiedEngine = blink || gecko;
  }
  return verifiedEngine;
}

/** Inherited properties a document can set without CSS. */
const ALWAYS_COPIED = [
  "-webkit-locale",
  "direction",
  "unicode-bidi",
  "writing-mode",
  "color-scheme",
  "forced-color-adjust",
];

/** Attributes the UA probe leaves off its stand-in elements: they fetch or
    run something, or never change which UA rules match. */
const PROBE_SKIPPED_ATTRIBUTE =
  /^(on|src$|srcset$|sizes$|data$|poster$|style$|class$|id$|alt$|title$|aria-|data-|role$|tabindex$|loading$|decoding$|fetchpriority$|crossorigin$|referrerpolicy$)/i;
/** Attributes whose presence matters to the UA sheet but whose value is
    per-element noise (a link is a link whatever its target). */
const PROBE_NAME_ONLY_ATTRIBUTE = /^(href|xlink:href|download|target|rel)$/i;
/** Elements that never render, and the ones that would load something just
    by existing; the UA sheet treats none of them in a way a page face uses. */
const PROBE_SKIPPED_ELEMENT = new Set([
  "link",
  "script",
  "style",
  "meta",
  "base",
  "template",
  "iframe",
  "object",
  "embed",
]);

const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

/** html-to-image's default property list: everything the root element's
    computed style enumerates, read once, as the library itself does. */
let defaultProperties: readonly string[] | null = null;
function defaultStyleProperties(): readonly string[] {
  if (!defaultProperties) {
    defaultProperties = Array.from(
      window.getComputedStyle(document.documentElement),
    );
  }
  return defaultProperties;
}

function addDeclarations(style: CSSStyleDeclaration, into: Set<string>) {
  for (let i = 0; i < style.length; i += 1) into.add(style[i]!);
}

/** Adds every property the rules declare, descending into grouping rules,
    nested rules, and @import-ed sheets. False when some sheet cannot be read
    (a cross-origin sheet): then nothing can be ruled out. */
function collectRuleProperties(
  rules: CSSRuleList,
  into: Set<string>,
  depth: number,
): boolean {
  for (let i = 0; i < rules.length; i += 1) {
    const rule = rules[i] as CSSRule & {
      style?: CSSStyleDeclaration;
      cssRules?: CSSRuleList;
      styleSheet?: CSSStyleSheet | null;
    };
    if (rule.style) addDeclarations(rule.style, into);
    if (rule.cssRules && !collectRuleProperties(rule.cssRules, into, depth)) {
      return false;
    }
    if (rule.styleSheet && !collectSheetProperties(rule.styleSheet, into, depth + 1)) {
      return false;
    }
  }
  return true;
}

/** Author properties are read afresh for every capture: a rule's
    declarations can change in place without its sheet changing shape. */
function collectSheetProperties(
  sheet: CSSStyleSheet,
  into: Set<string>,
  depth = 0,
): boolean {
  if (depth > 16) return false;
  let rules: CSSRuleList;
  try {
    rules = sheet.cssRules;
  } catch {
    return false;
  }
  return collectRuleProperties(rules, into, depth);
}

function documentSheets(): CSSStyleSheet[] {
  const sheets = Array.from(document.styleSheets);
  const adopted = (document as Document & { adoptedStyleSheets?: CSSStyleSheet[] })
    .adoptedStyleSheets;
  return adopted ? sheets.concat(adopted) : sheets;
}

/** Stand-in attributes and the cache key they share. */
function probeAttributes(element: Element): { key: string; attributes: [string, string][] } {
  const attributes: [string, string][] = [];
  for (const attribute of Array.from(element.attributes)) {
    if (PROBE_SKIPPED_ATTRIBUTE.test(attribute.name)) continue;
    attributes.push([
      attribute.name,
      PROBE_NAME_ONLY_ATTRIBUTE.test(attribute.name) ? "" : attribute.value,
    ]);
  }
  attributes.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const key = `${element.namespaceURI}|${element.localName}|${attributes
    .map(([name, value]) => `${name}=${value}`)
    .join("&")}`;
  return { key, attributes };
}

/** Properties the UA sheet styles differently from a plain element, per
    element kind (tag plus UA-relevant attributes). */
const userAgentDifferences = new Map<string, readonly string[]>();

/**
 * Measures, for each kind of element on the page, which properties the UA
 * stylesheet sets. The stand-ins live in a shadow root, where no author
 * stylesheet reaches, next to a plain custom element as the baseline; both
 * inherit alike, so any difference is the UA sheet's doing.
 */
function flagUserAgentProperties(
  elements: readonly Element[],
  properties: readonly string[],
  into: Set<string>,
) {
  const pending = new Map<string, { element: Element; attributes: [string, string][] }>();
  for (const element of elements) {
    if (PROBE_SKIPPED_ELEMENT.has(element.localName)) continue;
    // html-to-image copies no computed style below an <svg> (it clones
    // that subtree verbatim), so only HTML elements and <svg> roots count.
    if (
      element.namespaceURI !== HTML_NAMESPACE &&
      !(element.namespaceURI === SVG_NAMESPACE && element.localName === "svg")
    ) {
      continue;
    }
    const { key, attributes } = probeAttributes(element);
    const known = userAgentDifferences.get(key);
    if (known) {
      for (const name of known) into.add(name);
    } else if (!pending.has(key)) {
      pending.set(key, { element, attributes });
    }
  }
  if (pending.size === 0) return;

  const host = document.createElement("div");
  host.style.cssText =
    "position:fixed;left:0;top:0;width:0;height:0;overflow:hidden;visibility:hidden;pointer-events:none";
  const shadow = host.attachShadow({ mode: "open" });
  const baseline = document.createElement("x-capture-probe");
  shadow.appendChild(baseline);
  document.body.appendChild(host);
  try {
    const baseStyle = window.getComputedStyle(baseline);
    const baseValues = properties.map((name) => baseStyle.getPropertyValue(name));
    for (const [key, { element, attributes }] of pending) {
      const stand = document.createElementNS(element.namespaceURI, element.localName);
      for (const [name, value] of attributes) stand.setAttribute(name, value);
      shadow.appendChild(stand);
      const style = window.getComputedStyle(stand);
      const differences: string[] = [];
      properties.forEach((name, index) => {
        if (style.getPropertyValue(name) !== baseValues[index]) differences.push(name);
      });
      stand.remove();
      userAgentDifferences.set(key, differences);
      for (const name of differences) into.add(name);
    }
  } finally {
    host.remove();
  }
}

/**
 * The computed properties a capture of `root` must copy, in html-to-image's
 * default order, or undefined to have it copy all of them (on an engine the
 * selection is not verified on, when a stylesheet cannot be read, or when
 * anything here fails).
 */
export function captureStyleProperties(root: Element): string[] | undefined {
  if (!onVerifiedEngine()) return undefined;
  try {
    const all = defaultStyleProperties();
    const keep = new Set<string>(ALWAYS_COPIED);
    for (const sheet of documentSheets()) {
      if (!collectSheetProperties(sheet, keep)) return undefined;
    }

    // Inline styles on the page and on its ancestors (whose inherited values
    // the page's root carries), and the UA's view of each element kind.
    const elements: Element[] = [];
    for (let parent = root.parentElement; parent; parent = parent.parentElement) {
      elements.push(parent);
    }
    elements.push(root, ...Array.from(root.querySelectorAll("*")));
    for (const element of elements) {
      const style = (element as HTMLElement).style as CSSStyleDeclaration | undefined;
      if (style) addDeclarations(style, keep);
    }
    flagUserAgentProperties(
      elements,
      all.filter((name) => !name.startsWith("--")),
      keep,
    );

    return all.filter((name) => name.startsWith("--") || keep.has(name));
  } catch {
    return undefined;
  }
}
