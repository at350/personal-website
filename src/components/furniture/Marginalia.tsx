import { useCallback, useEffect, useId, useRef } from "react";
import type { PersistentInteractionSpread } from "@/magazine/persistent-interactions";
import {
  setPersistentInteractionOpenKey,
  usePersistentInteraction,
} from "@/magazine/persistent-interactions";
import "@/styles/furniture.css";

interface MarginaliaProps {
  label: string;
  ariaLabel: string;
  /** Footnote numeral shown as the mark, e.g. 3 renders "03". */
  index: number;
  /** Stable content key shared by the visible page and capture-farm copy. */
  stateKey: string;
  stateSpread: PersistentInteractionSpread;
  children: React.ReactNode;
}

/**
 * A vermilion ✳ in the margin. Opens on hover (with an appear delay),
 * and stickily on click or keyboard focus. Esc dismisses.
 */
export function Marginalia({
  label,
  ariaLabel,
  index,
  stateKey,
  stateSpread,
  children,
}: MarginaliaProps) {
  const { openKey } = usePersistentInteraction(stateSpread);
  const pinned = openKey === stateKey;
  const id = useId();
  const rootRef = useRef<HTMLSpanElement>(null);

  const setPinned = useCallback(
    (next: boolean) => {
      setPersistentInteractionOpenKey(stateSpread, next ? stateKey : null);
    },
    [stateKey, stateSpread],
  );

  useEffect(() => {
    if (!pinned) return;
    // Capture-farm copies mirror state for rasterization but must not compete
    // with the visible control for global dismiss events.
    if (rootRef.current?.closest("[data-capture-farm]")) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPinned(false);
    };
    const onClickAway = (e: PointerEvent) => {
      if (
        e.target instanceof Element &&
        e.target.closest(".marginalia__mark")
      ) {
        return;
      }
      if (!rootRef.current?.contains(e.target as Node)) setPinned(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onClickAway);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onClickAway);
    };
  }, [pinned, setPinned]);

  return (
    <span className="marginalia" data-open={pinned || undefined} ref={rootRef}>
      <button
        type="button"
        className="marginalia__mark"
        aria-expanded={pinned}
        aria-controls={id}
        aria-label={ariaLabel}
        onClick={() => setPinned(!pinned)}
      >
        {String(index).padStart(2, "0")}
      </button>
      <span className="marginalia__note" role="note" id={id}>
        <span className="marginalia__label mono-label">{label}</span>
        <span className="marginalia__text">{children}</span>
      </span>
    </span>
  );
}
