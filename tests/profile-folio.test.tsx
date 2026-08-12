import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router";
import { OverlayFace } from "@/book3d/BookStage";
import { SPREADS } from "@/magazine/folio";

afterEach(cleanup);

describe("profile recto furniture", () => {
  it("uses the shared page-seven folio on its dark poster", () => {
    const profile = SPREADS.findIndex((spread) => spread.id === "profile");
    const { container } = render(
      <MemoryRouter>
        <OverlayFace spread={profile} face="recto" showGrid={false} />
      </MemoryRouter>,
    );

    const poster = container.querySelector<HTMLElement>(
      '.profile[data-face="recto"][data-page-tone="dark"]',
    );
    const folio = container.querySelector<HTMLElement>(".folio--recto");

    expect(poster).not.toBeNull();
    expect(folio?.textContent?.replace(/\s+/g, " ").trim()).toBe("NO. 01 / 07");
    expect(folio?.querySelector(".folio__page")?.textContent).toBe("07");
    expect(container.querySelector(".running-head--recto")?.textContent).toBe("NEWS");
    expect(container.textContent).not.toContain("selected curiosities");
  });
});
