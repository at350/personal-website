import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router";
import { ProjectsOpener } from "@/spreads/ProjectsOpener";

afterEach(cleanup);

function renderIndex() {
  return render(
    <MemoryRouter>
      <ProjectsOpener face="recto" mode="reader" />
    </MemoryRouter>,
  );
}

describe("project archive index", () => {
  it("opens and closes a focused row by keyboard-style activation", () => {
    renderIndex();
    const row = screen.getByRole("button", { name: /GreenChain/ });

    fireEvent.focus(row);
    expect(row.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(row);
    expect(row.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText(/supplier-research workflows/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Team repository for GreenChain/ })).toBeTruthy();

    fireEvent.click(row);
    expect(row.getAttribute("aria-expanded")).toBe("false");
  });
});
