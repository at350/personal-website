import { cleanup, fireEvent, render } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CursorOrb } from "@/components/CursorOrb";

function stubMediaQueries({ reduced = false, fine = true } = {}) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((media: string) => {
      const matches = media.includes("prefers-reduced-motion")
        ? reduced
        : fine;
      return {
        matches,
        media,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      } as unknown as MediaQueryList;
    }),
  );
}

function stubAnimationFrames() {
  let nextId = 0;
  const callbacks = new Map<number, FrameRequestCallback>();
  const request = vi.fn((callback: FrameRequestCallback) => {
    const id = ++nextId;
    callbacks.set(id, callback);
    return id;
  });
  const cancel = vi.fn((id: number) => callbacks.delete(id));
  vi.stubGlobal("requestAnimationFrame", request);
  vi.stubGlobal("cancelAnimationFrame", cancel);
  return {
    request,
    cancel,
    run(id: number, now: number) {
      const callback = callbacks.get(id);
      callbacks.delete(id);
      callback?.(now);
    },
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("CursorOrb", () => {
  it("snaps the ring in at the pointer, then follows subsequent motion smoothly", () => {
    stubMediaQueries();
    const frames = stubAnimationFrames();
    const { container } = render(<CursorOrb />);
    const root = container.querySelector(".cursor-orb")!;
    const ring = container.querySelector<HTMLElement>(".cursor-orb__ring")!;
    expect(container.querySelector(".cursor-orb__dot")).toBeNull();

    fireEvent.pointerMove(document.body, { clientX: 100, clientY: 50 });
    expect(root.getAttribute("aria-hidden")).toBe("true");
    expect(root.classList.contains("is-visible")).toBe(true);
    expect(ring.style.transform).toContain("87.00px, 37.00px");

    frames.run(1, 16.7);
    fireEvent.pointerMove(document.body, { clientX: 200, clientY: 50 });
    frames.run(2, 33.4);

    expect(ring.style.transform).toContain("103.00px, 37.00px");
  });

  it("expands its ring over an interactive target", () => {
    stubMediaQueries();
    stubAnimationFrames();
    const { container } = render(
      <>
        <button type="button">Turn page</button>
        <CursorOrb />
      </>,
    );
    const button = container.querySelector("button")!;
    const ring = container.querySelector(".cursor-orb__ring")!;

    fireEvent.pointerMove(button, { clientX: 20, clientY: 20 });

    expect(ring.classList.contains("is-interactive")).toBe(true);
  });

  it("stays dormant when reduced motion is requested", () => {
    stubMediaQueries({ reduced: true });
    const frames = stubAnimationFrames();
    const { container } = render(<CursorOrb />);
    const root = container.querySelector(".cursor-orb")!;

    fireEvent.pointerMove(document.body, { clientX: 100, clientY: 50 });

    expect(root.classList.contains("is-visible")).toBe(false);
    expect(frames.request).not.toHaveBeenCalled();
  });

  it("hides instead of following touch input on a hybrid device", () => {
    stubMediaQueries();
    const frames = stubAnimationFrames();
    const { container } = render(<CursorOrb />);
    const root = container.querySelector(".cursor-orb")!;

    fireEvent.pointerMove(document.body, {
      clientX: 100,
      clientY: 50,
      pointerType: "mouse",
    });
    expect(root.classList.contains("is-visible")).toBe(true);

    fireEvent.pointerDown(document.body, {
      clientX: 120,
      clientY: 70,
      pointerType: "touch",
    });

    expect(root.classList.contains("is-visible")).toBe(false);
    expect(frames.cancel).toHaveBeenCalledWith(1);
  });

  it("cancels pending work when it unmounts", () => {
    stubMediaQueries();
    const frames = stubAnimationFrames();
    const view = render(<CursorOrb />);

    fireEvent.pointerMove(document.body, { clientX: 100, clientY: 50 });
    view.unmount();

    expect(frames.cancel).toHaveBeenCalledWith(1);
    fireEvent.pointerMove(document.body, { clientX: 200, clientY: 100 });
    expect(frames.request).toHaveBeenCalledTimes(1);
  });

  it("does not duplicate pointer listeners under StrictMode", () => {
    stubMediaQueries();
    const frames = stubAnimationFrames();
    render(
      <StrictMode>
        <CursorOrb />
      </StrictMode>,
    );

    fireEvent.pointerMove(document.body, { clientX: 100, clientY: 50 });

    expect(frames.request).toHaveBeenCalledTimes(1);
  });
});
