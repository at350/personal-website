import { describe, expect, it } from "vitest";
import {
  SPREADS,
  pageLabel,
  routeForSpread,
  spreadForPage,
  spreadForRoute,
  spreadPages,
} from "@/magazine/folio";

describe("folio arithmetic", () => {
  it("cover and back cover are unnumbered", () => {
    expect(spreadPages(0)).toBeNull();
    expect(spreadPages(SPREADS.length - 1)).toBeNull();
  });

  it("content spreads number verso-even / recto-odd", () => {
    expect(spreadPages(1)).toEqual([2, 3]);
    expect(spreadPages(6)).toEqual([12, 13]);
    for (let i = 1; i < SPREADS.length - 1; i += 1) {
      const [verso, recto] = spreadPages(i)!;
      expect(verso % 2).toBe(0);
      expect(recto).toBe(verso + 1);
    }
  });

  it("page labels read like a magazine", () => {
    expect(pageLabel(0)).toBe("Cover");
    expect(pageLabel(6)).toBe("Pages 12–13");
    expect(pageLabel(SPREADS.length - 1)).toBe("Back cover");
  });

  it("routes round-trip to spreads", () => {
    expect(spreadForRoute("/")).toBe(0);
    expect(spreadForRoute("/resume")).toBe(6);
    expect(spreadForRoute("/resume/")).toBe(6);
    expect(spreadForRoute("/colophon")).toBe(9);
    expect(spreadForRoute("/nowhere")).toBe(0);
    expect(routeForSpread(6)).toBe("/resume");
  });

  it("routeless spreads inherit the nearest prior route", () => {
    const well = SPREADS.findIndex((s) => s.id === "well");
    expect(routeForSpread(well)).toBe("/projects");
    expect(routeForSpread(SPREADS.length - 1)).toBe("/contact");
  });

  it("spreadForPage inverts spreadPages", () => {
    expect(spreadForPage(12)).toBe(6);
    expect(spreadForPage(13)).toBe(6);
    expect(spreadForPage(999)).toBe(SPREADS.length - 1);
  });

  it("the resume lives at pages 12-13 as printed on the cover lines", () => {
    const resume = SPREADS.findIndex((s) => s.id === "resume");
    expect(spreadPages(resume)).toEqual([12, 13]);
  });
});
