import { useEffect, useId, useRef, useState } from "react";
import "@/styles/furniture.css";

interface MarginaliaProps {
  label: string;
  ariaLabel: string;
  children: React.ReactNode;
}

/**
 * A vermilion ✳ in the margin. Opens on hover (with an appear delay),
 * and stickily on click or keyboard focus. Esc dismisses.
 */
export function Marginalia({ label, ariaLabel, children }: MarginaliaProps) {
  const [pinned, setPinned] = useState(false);
  const id = useId();
  const rootRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!pinned) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPinned(false);
    };
    const onClickAway = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setPinned(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onClickAway);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onClickAway);
    };
  }, [pinned]);

  return (
    <span className="marginalia" data-open={pinned || undefined} ref={rootRef}>
      <button
        type="button"
        className="marginalia__mark"
        aria-expanded={pinned}
        aria-controls={id}
        aria-label={ariaLabel}
        onClick={() => setPinned((v) => !v)}
      >
        ✳
      </button>
      <span className="marginalia__note" role="note" id={id}>
        <span className="marginalia__label mono-label">{label}</span>
        <span className="marginalia__text">{children}</span>
      </span>
    </span>
  );
}
