import { act } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DRIFT_MIN_VIEWPORT_WIDTH,
  ExperienceDock,
  driftModeAvailable,
} from "@/components/ExperienceDock";

const defaultInnerWidth = window.innerWidth;

function setViewportWidth(width: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width,
  });
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  setViewportWidth(defaultInnerWidth);
});

describe("ExperienceDock", () => {
  it("starts as one selected orb and reveals all five modes after hover intent", () => {
    vi.useFakeTimers();
    render(<ExperienceDock />);

    const dock = screen.getByRole("toolbar", { name: "Experience modes" });
    expect(dock.getAttribute("data-expanded")).toBe("false");
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(
      screen
        .getByRole("button", { name: /Read: Regular experience/ })
        .getAttribute("aria-pressed"),
    ).toBe("true");

    fireEvent.pointerEnter(dock, { pointerType: "mouse" });
    act(() => vi.advanceTimersByTime(70));

    expect(dock.getAttribute("data-expanded")).toBe("true");
    expect(screen.getAllByRole("button")).toHaveLength(5);
  });

  it("selects a new mode and collapses back to that orb", () => {
    render(<ExperienceDock />);

    const read = screen.getByRole("button", { name: /Read: Regular experience/ });
    fireEvent.click(read);
    const ignite = screen.getByRole("button", { name: /Ignite: Flame playground/ });
    fireEvent.click(ignite);

    expect(
      screen
        .getByRole("toolbar", { name: "Experience modes" })
        .getAttribute("data-expanded"),
    ).toBe("false");
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(
      screen
        .getByRole("button", { name: /Ignite: Flame playground/ })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("publishes controlled mode changes without duplicating selections", () => {
    const onModeChange = vi.fn();
    const { rerender } = render(
      <ExperienceDock mode="read" onModeChange={onModeChange} />,
    );

    const read = screen.getByRole("button", { name: /Read: Regular experience/ });
    fireEvent.click(read);
    const ignite = screen.getByRole("button", { name: /Ignite: Flame playground/ });
    fireEvent.click(ignite);
    expect(onModeChange).toHaveBeenCalledTimes(1);
    expect(onModeChange).toHaveBeenLastCalledWith("ignite");

    rerender(<ExperienceDock mode="ignite" onModeChange={onModeChange} />);
    const selectedIgnite = screen.getByRole("button", {
      name: /Ignite: Flame playground/,
    });
    expect(selectedIgnite.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(selectedIgnite);
    expect(onModeChange).toHaveBeenCalledTimes(1);
  });

  it("opens on the first touch even when pointer focus lands before click", () => {
    render(<ExperienceDock />);

    const dock = screen.getByRole("toolbar", { name: "Experience modes" });
    const read = screen.getByRole("button", { name: /Read: Regular experience/ });
    fireEvent.pointerDown(read, { pointerType: "touch" });
    read.focus();
    fireEvent.click(read);

    expect(dock.getAttribute("data-expanded")).toBe("true");
    expect(screen.getAllByRole("button")).toHaveLength(5);
  });

  it("supports arrow navigation and Escape", () => {
    render(<ExperienceDock />);

    const dock = screen.getByRole("toolbar", { name: "Experience modes" });
    const read = screen.getByRole("button", { name: /Read: Regular experience/ });
    read.focus();
    fireEvent.keyDown(dock, { key: "ArrowDown" });

    expect(document.activeElement?.getAttribute("aria-label")).toMatch(
      /Ignite: Flame playground/,
    );
    fireEvent.keyDown(dock, { key: "Escape" });

    expect(dock.getAttribute("data-expanded")).toBe("false");
    expect(document.activeElement).toBe(read);
  });

  it("does not collapse around a keyboard-focused option on pointer leave", () => {
    vi.useFakeTimers();
    render(<ExperienceDock />);

    const dock = screen.getByRole("toolbar", { name: "Experience modes" });
    const read = screen.getByRole("button", { name: /Read: Regular experience/ });
    read.focus();
    fireEvent.keyDown(dock, { key: "ArrowDown" });
    const ignite = screen.getByRole("button", { name: /Ignite: Flame playground/ });
    expect(document.activeElement).toBe(ignite);

    fireEvent.pointerLeave(dock, { pointerType: "mouse" });
    act(() => vi.advanceTimersByTime(170));

    expect(dock.getAttribute("data-expanded")).toBe("true");
    expect(ignite.getAttribute("aria-hidden")).toBe("false");
  });

  it("still closes on pointer leave after a mouse-focused selection", () => {
    vi.useFakeTimers();
    render(<ExperienceDock />);

    const dock = screen.getByRole("toolbar", { name: "Experience modes" });
    const read = screen.getByRole("button", { name: /Read: Regular experience/ });
    fireEvent.pointerDown(read, { pointerType: "mouse" });
    read.focus();
    fireEvent.click(read);
    expect(dock.getAttribute("data-expanded")).toBe("true");

    fireEvent.pointerLeave(dock, { pointerType: "mouse" });
    act(() => vi.advanceTimersByTime(170));

    expect(dock.getAttribute("data-expanded")).toBe("false");
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("restores focus before an outside pointer action collapses the dock", () => {
    render(<ExperienceDock />);

    const dock = screen.getByRole("toolbar", { name: "Experience modes" });
    const read = screen.getByRole("button", { name: /Read: Regular experience/ });
    read.focus();
    fireEvent.keyDown(dock, { key: "ArrowDown" });
    fireEvent.pointerDown(document.body);

    expect(dock.getAttribute("data-expanded")).toBe("false");
    expect(document.activeElement).toBe(read);
  });

  it("keeps handled toolbar keys away from global shortcuts", () => {
    const onWindowKeyDown = vi.fn();
    window.addEventListener("keydown", onWindowKeyDown);
    render(<ExperienceDock />);

    const dock = screen.getByRole("toolbar", { name: "Experience modes" });
    screen.getByRole("button", { name: /Read: Regular experience/ }).focus();
    fireEvent.keyDown(dock, { key: "End" });

    expect(onWindowKeyDown).not.toHaveBeenCalled();
    window.removeEventListener("keydown", onWindowKeyDown);
  });

  it("offers Drift on wide viewports", () => {
    setViewportWidth(1280);
    const onModeChange = vi.fn();
    render(<ExperienceDock mode="read" onModeChange={onModeChange} />);

    fireEvent.click(
      screen.getByRole("button", { name: /Read: Regular experience/ }),
    );
    const drift = screen.getByRole("button", { name: /Drift: Weightless mode/ });
    expect(drift.getAttribute("aria-disabled")).toBeNull();
    fireEvent.click(drift);
    expect(onModeChange).toHaveBeenCalledTimes(1);
    expect(onModeChange).toHaveBeenLastCalledWith("drift");
  });

  it("disables Drift below the book viewport width without losing the slot", () => {
    setViewportWidth(DRIFT_MIN_VIEWPORT_WIDTH - 100);
    const onModeChange = vi.fn();
    render(<ExperienceDock mode="read" onModeChange={onModeChange} />);

    fireEvent.click(
      screen.getByRole("button", { name: /Read: Regular experience/ }),
    );
    // The dock still shows all five modes; the unavailable one only dims.
    expect(screen.getAllByRole("button")).toHaveLength(5);
    const drift = screen.getByRole("button", {
      name: /Drift: Weightless mode, unavailable/,
    });
    expect(drift.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(drift);
    expect(onModeChange).not.toHaveBeenCalled();
  });

  it("lets Escape reach the page while the dock is collapsed", () => {
    render(<ExperienceDock />);

    const dock = screen.getByRole("toolbar", { name: "Experience modes" });
    screen.getByRole("button", { name: /Read: Regular experience/ }).focus();
    // Collapsed: the dock must not claim the key — the stage uses it to land
    // Drift. fireEvent returns false only when preventDefault was called.
    expect(fireEvent.keyDown(dock, { key: "Escape" })).toBe(true);
  });

  it("still opens from a collapsed orb whose own mode became unavailable", () => {
    setViewportWidth(DRIFT_MIN_VIEWPORT_WIDTH - 100);
    const onModeChange = vi.fn();
    render(<ExperienceDock mode="drift" onModeChange={onModeChange} />);

    const dock = screen.getByRole("toolbar", { name: "Experience modes" });
    const orb = screen.getByRole("button", {
      name: /Drift: Weightless mode, selected, unavailable/,
    });
    fireEvent.pointerDown(orb, { pointerType: "touch" });
    orb.focus();
    fireEvent.click(orb);

    expect(dock.getAttribute("data-expanded")).toBe("true");
    expect(onModeChange).not.toHaveBeenCalled();
  });

  it("mirrors the book's fallback rules in driftModeAvailable", () => {
    expect(driftModeAvailable(false, 1440)).toBe(true);
    expect(driftModeAvailable(false, DRIFT_MIN_VIEWPORT_WIDTH)).toBe(true);
    expect(driftModeAvailable(false, DRIFT_MIN_VIEWPORT_WIDTH - 1)).toBe(false);
    // Reduced motion wins regardless of viewport size.
    expect(driftModeAvailable(true, 1440)).toBe(false);
  });
});
