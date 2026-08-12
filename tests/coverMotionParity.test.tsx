import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";

const mocks = vi.hoisted(() => {
  const splitRevert = vi.fn();
  const splitText = vi.fn(function SplitTextMock() {
    return { chars: ["A"], revert: splitRevert };
  });
  const kill = vi.fn();
  const from = vi.fn((target: unknown, options?: Record<string, unknown>) => {
    void target;
    void options;
    return { kill };
  });
  return { from, kill, splitRevert, splitText };
});

vi.mock("gsap", () => ({
  default: {
    from: mocks.from,
    registerPlugin: vi.fn(),
  },
}));

vi.mock("gsap/SplitText", () => ({ SplitText: mocks.splitText }));
vi.mock("@/lib/motion", () => ({ motionOK: () => true }));

import { Cover } from "@/spreads/Cover";

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("cover motion parity", () => {
  it.each(["book", "reader"] as const)(
    "does not render hologram markup on the static %s cover",
    (mode) => {
      const { container } = render(
        <MemoryRouter>
          <Cover face="recto" mode={mode} />
        </MemoryRouter>,
      );

      expect(container.querySelector(".cover2__hologram")).toBeNull();
    },
  );

  it("keeps the live book cover in the same settled state as its texture", () => {
    render(
      <MemoryRouter>
        <Cover face="recto" mode="book" />
      </MemoryRouter>,
    );

    expect(mocks.splitText).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("restores reader-mode masthead markup when its entrance finishes", () => {
    const { unmount } = render(
      <MemoryRouter>
        <Cover face="recto" mode="reader" />
      </MemoryRouter>,
    );

    expect(mocks.splitText).toHaveBeenCalledOnce();
    expect(mocks.from).toHaveBeenCalledTimes(2);
    const mastheadOptions = mocks.from.mock.calls[0]?.[1] as
      | { clearProps?: string; onComplete?: () => void }
      | undefined;
    expect(mastheadOptions?.clearProps).toBe("transform");

    mastheadOptions?.onComplete?.();
    expect(mocks.splitRevert).toHaveBeenCalledOnce();

    unmount();
    expect(mocks.splitRevert).toHaveBeenCalledOnce();
  });
});
