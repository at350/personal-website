import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReaderView } from "@/routes/ReaderView";

function stubMatchMedia() {
  vi.stubGlobal(
    "matchMedia",
    (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  );
}

beforeEach(() => stubMatchMedia());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("the stacked reader", () => {
  it("can return to the page-turning reader on a phone", () => {
    const onOpenPages = vi.fn();
    render(
      <MemoryRouter>
        <ReaderView
          canOpenBook={false}
          onOpenBook={() => undefined}
          onOpenPages={onOpenPages}
        />
      </MemoryRouter>,
    );

    screen.getByRole("button", { name: "read as pages" }).click();
    expect(onOpenPages).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "open as book" })).toBeNull();
  });
});
