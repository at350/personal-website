import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ShortcutSheet } from "@/components/ShortcutSheet";

afterEach(() => {
  cleanup();
});

describe("ShortcutSheet", () => {
  it("is a labelled modal dialog that prints every key the book answers to", () => {
    render(<ShortcutSheet onClose={vi.fn()} />);

    const dialog = screen.getByRole("dialog", { name: "Keys" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");

    const keys = Array.from(dialog.querySelectorAll("kbd")).map(
      (key) => key.textContent,
    );
    expect(keys).toEqual(["←", "→", "home", "end", "g", "esc", "?"]);

    // The pointer gestures and the dock have no key, so they are named in
    // plain mono rather than boxed as one.
    const gestures = Array.from(dialog.querySelectorAll(".keys__gesture")).map(
      (gesture) => gesture.textContent,
    );
    expect(gestures).toEqual(["drag", "click", "dock"]);
    // A tap on the fore-edge only lifts the corner and lets it fall — the
    // engine commits a turn past a pull threshold, never from a bare
    // press — so the sheet must not promise one.
    expect(dialog.textContent).not.toContain("tap");
    expect(dialog.textContent).toContain("printer's grid");
    expect(dialog.textContent).toContain("read, ignite, drift");
  });

  it("closes from the close button and from Escape", () => {
    const onClose = vi.fn();
    render(<ShortcutSheet onClose={onClose} />);

    fireEvent.click(
      screen.getByRole("button", { name: "Close keyboard shortcuts" }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("takes focus on mount and hands it back on unmount", () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    expect(document.activeElement).toBe(opener);

    const { unmount } = render(<ShortcutSheet onClose={vi.fn()} />);
    const dialog = screen.getByRole("dialog", { name: "Keys" });
    expect(dialog.contains(document.activeElement)).toBe(true);

    unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it("leaves focus on the document when the opener has since been disabled", () => {
    // The nav's "?" folds away with the arrows in ignite and drift; a sheet
    // opened from it must not hand focus back to a button nobody can see.
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();

    const { unmount } = render(<ShortcutSheet onClose={vi.fn()} />);
    opener.disabled = true;
    expect(() => unmount()).not.toThrow();
    expect(document.activeElement).toBe(document.body);
    opener.remove();
  });

  it("keeps Tab inside the sheet", () => {
    render(<ShortcutSheet onClose={vi.fn()} />);
    const dialog = screen.getByRole("dialog", { name: "Keys" });
    const close = screen.getByRole("button", {
      name: "Close keyboard shortcuts",
    });

    // The close button is the only stop, so a reverse Tab from the sheet
    // itself wraps onto it and a forward Tab from it wraps back around.
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(close, { key: "Tab" });
    expect(document.activeElement).toBe(close);
  });
});
