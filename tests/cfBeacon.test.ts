import { describe, expect, it } from "vitest";
import {
  BEACON_SRC,
  beaconTag,
  cloudflareBeacon,
} from "../scripts/cf-beacon-plugin.mjs";

/* The tag the README tells the owner to grep for, spelled out once so a drift
   in either direction shows up here first. */
const EXPECTED_TAG =
  `<script defer src="${BEACON_SRC}" ` +
  `data-cf-beacon='{"token":"abc123","spa":true}'></script>`;

const PAGE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Alan Tai</title>
  </head>
  <body style="background:#ffffff">
    <div id="root"></div>
  </body>
</html>
`;

describe("beaconTag", () => {
  it("prints nothing without a token", () => {
    expect(beaconTag(undefined)).toBe("");
    expect(beaconTag(null)).toBe("");
    expect(beaconTag("")).toBe("");
    expect(beaconTag("   \n")).toBe("");
  });

  it("prints the documented tag with SPA tracking for a valid token", () => {
    expect(beaconTag("abc123")).toBe(EXPECTED_TAG);
    // The single-quoted attribute holds JSON the beacon parses verbatim.
    const attr = EXPECTED_TAG.match(/data-cf-beacon='([^']*)'/)?.[1];
    expect(JSON.parse(attr ?? "")).toEqual({ token: "abc123", spa: true });
  });

  it("trims whitespace around a token and keeps _ and -", () => {
    expect(beaconTag("  a_b-C9  ")).toContain('"token":"a_b-C9"');
  });

  it("refuses a token that could escape the attribute", () => {
    for (const bad of [
      "abc'123",
      'abc"123',
      "abc<script>",
      "abc 123",
      "abc&amp;",
      '{"token":"x"}',
    ]) {
      expect(() => beaconTag(bad)).toThrow(/CF_BEACON_TOKEN/);
    }
  });
});

describe("cloudflareBeacon plugin", () => {
  it("injects the tag into <head> exactly once", () => {
    const plugin = cloudflareBeacon("abc123");
    expect(plugin.name).toBe("cloudflare-beacon");
    const out = plugin.transformIndexHtml(PAGE);
    expect(out.split(EXPECTED_TAG)).toHaveLength(2);
    expect(out.indexOf(EXPECTED_TAG)).toBeGreaterThan(out.indexOf("<title>"));
    expect(out.indexOf(EXPECTED_TAG)).toBeLessThan(out.indexOf("</head>"));
    // The rest of the page is untouched by the splice.
    expect(out.replace(`${EXPECTED_TAG}\n  `, "")).toBe(PAGE);
    // Running the hook again over its own output does not double the tag.
    expect(plugin.transformIndexHtml(out)).toBe(out);
  });

  it("leaves the HTML untouched without a token", () => {
    expect(cloudflareBeacon(undefined).transformIndexHtml(PAGE)).toBe(PAGE);
    expect(cloudflareBeacon("").transformIndexHtml(PAGE)).toBe(PAGE);
    expect(cloudflareBeacon("  ").transformIndexHtml(PAGE)).toBe(PAGE);
  });

  it("leaves a page with no <head> alone rather than guessing", () => {
    const bare = '<div id="root"></div>';
    expect(cloudflareBeacon("abc123").transformIndexHtml(bare)).toBe(bare);
  });

  it("fails the build on an unsafe token instead of shipping it", () => {
    expect(() => cloudflareBeacon("abc'123")).toThrow(/CF_BEACON_TOKEN/);
  });
});
