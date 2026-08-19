import { describe, expect, it } from "vitest";
import { ALL_PAGE_KEYS } from "@/book3d/pageTextures";
import {
  FACES,
  SPREADS,
  bookLocationForSpread,
  faceForSpread,
  isRenderableFace,
  spreadForFace,
  pageLabel,
  routeForSpread,
  spreadForBookLocation,
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

  it("round-trips a backward flip from resume onto the routeless project well", () => {
    const resume = SPREADS.findIndex((s) => s.id === "resume");
    const well = SPREADS.findIndex((s) => s.id === "well");
    const projects = SPREADS.findIndex((s) => s.id === "features");

    expect(resume - 1).toBe(well);

    const landed = bookLocationForSpread(well);
    expect(landed).toEqual({
      pathname: "/projects",
      state: { bookSpread: well },
    });
    expect(spreadForBookLocation(landed.pathname, landed.state)).toBe(well);

    // A direct visit still opens the routed projects spread, not its well.
    expect(spreadForBookLocation("/projects", null)).toBe(projects);
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

describe("the readable-face sequence", () => {
  it("is the twenty faces the capture farm rasterizes", () => {
    // Two of the 22 spread/side pairs are the outside of the issue: the cover
    // has no verso and the back cover no recto.
    expect(FACES).toHaveLength(SPREADS.length * 2 - 2);
    expect(ALL_PAGE_KEYS).toHaveLength(FACES.length);
    expect(ALL_PAGE_KEYS).toEqual(
      FACES.map((face) => `${face.spread}:${face.side}`),
    );
  });

  it("opens on the cover's recto and closes on the back's verso", () => {
    expect(FACES[0]).toMatchObject({ spread: 0, side: "recto" });
    expect(FACES.at(-1)).toMatchObject({
      spread: SPREADS.length - 1,
      side: "verso",
    });
    expect(isRenderableFace(0, "verso")).toBe(false);
    expect(isRenderableFace(SPREADS.length - 1, "recto")).toBe(false);
  });

  it("carries the same printed page numbers the spread prints", () => {
    const resume = SPREADS.findIndex((s) => s.id === "resume");
    const [verso, recto] = FACES.filter((face) => face.spread === resume);
    expect([verso?.page, recto?.page]).toEqual(spreadPages(resume));
    // The cover and back are paper, but unnumbered paper.
    expect(FACES[0]?.page).toBeNull();
    expect(FACES.at(-1)?.page).toBeNull();
  });

  it("faces stay in physical order, so turning one advances at most one spread", () => {
    const spreads = FACES.map((face) => face.spread);
    expect(spreads).toEqual([...spreads].sort((a, b) => a - b));
    for (let i = 1; i < spreads.length; i += 1) {
      expect(spreads[i]! - spreads[i - 1]!).toBeLessThanOrEqual(1);
    }
  });

  it("a route lands on its spread's first face and reads back as that spread", () => {
    SPREADS.forEach((_, spread) => {
      const face = faceForSpread(spread);
      expect(spreadForFace(face)).toBe(spread);
      // First face: no earlier face belongs to the same spread.
      expect(FACES.slice(0, face).some((f) => f.spread === spread)).toBe(false);
    });
  });

  it("clamps a face index that falls off either end of the issue", () => {
    expect(spreadForFace(-1)).toBe(0);
    expect(spreadForFace(FACES.length + 99)).toBe(SPREADS.length - 1);
  });
});
