import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router";
import { EditorialTerminal } from "@/components/brand/EditorialTerminal";
import { BackCover, Cover } from "@/spreads/Cover";

afterEach(cleanup);

describe("editorial terminal identity", () => {
  it("uses the same real asset after the I in both display lockups", () => {
    const { container } = render(
      <MemoryRouter>
        <div data-cover="">
          <Cover face="recto" mode="book" />
        </div>
        <div data-back="">
          <BackCover face="verso" mode="book" />
        </div>
      </MemoryRouter>,
    );

    const lockups = [
      container.querySelector(
        "[data-cover] .cover2__word-mask:last-child .cover2__word",
      ),
      container.querySelector("[data-back] .back2__mark"),
    ];
    const terminals = lockups.map((lockup) =>
      lockup?.querySelector<HTMLElement>("[data-editorial-terminal]"),
    );

    expect(terminals.every(Boolean)).toBe(true);
    expect(container.querySelectorAll("[data-editorial-terminal]")).toHaveLength(2);
    for (const [index, terminal] of terminals.entries()) {
      expect(lockups[index]?.lastElementChild).toBe(terminal);
      expect(terminal?.previousSibling?.textContent?.endsWith("I")).toBe(true);
      expect(terminal?.getAttribute("aria-hidden")).toBe("true");
      expect(terminal?.style.backgroundImage).toContain(
        "/brand/editorial-terminal.png",
      );
    }
    expect(container.querySelector(".cover2__a, .back2__a")).toBeNull();
  });

  it("renders the canonical asset as a decorative shared element", () => {
    const { container } = render(<EditorialTerminal />);
    const terminal = container.querySelector<HTMLElement>(
      "[data-editorial-terminal]",
    );

    expect(terminal).not.toBeNull();
    expect(terminal?.getAttribute("aria-hidden")).toBe("true");
    expect(terminal?.style.backgroundImage).toContain(
      "/brand/editorial-terminal.png",
    );
  });

  it("keeps all terminal geometry in the shared stylesheet", async () => {
    const [coverCss, brandCss] = await Promise.all([
      readFile(
        resolve(process.cwd(), "src/styles/spreads/cover.css"),
        "utf8",
      ),
      readFile(resolve(process.cwd(), "src/styles/brand.css"), "utf8"),
    ]);

    expect(coverCss).not.toMatch(/\.(?:cover2|back2)__a(?:\s|,|\{)/);
    expect(coverCss).not.toMatch(/clip-path:\s*polygon\(50%\s+0/);
    expect(coverCss).not.toMatch(
      /\.(?:cover2|back2)[^{]*\.editorial-terminal[^{]*\{[^}]*(?:width|height|margin|vertical-align)\s*:/s,
    );
    expect(brandCss).toContain("width: 0.44cap");
    expect(brandCss).toContain("height: 0.2cap");
    expect(brandCss).toContain("margin-inline-start: 0.15cap");
    expect(brandCss).toContain("vertical-align: baseline");
  });
});
