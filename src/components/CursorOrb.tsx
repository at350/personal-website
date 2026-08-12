import { useEffect, useRef } from "react";
import "@/styles/cursor-orb.css";

const RING_SIZE = 26;
const FOLLOW_PER_FRAME = 0.16;
const INTERACTIVE_SCALE = 1.6;
const INTERACTIVE =
  'a[href], button:not(:disabled), [role="button"], [role="menuitem"], .bstage__edge, .bstage--dragging, .profile__print';

/**
 * The site's original cursor signature, adapted to the current edition.
 * The native cursor remains intact; this is only a decorative, lagged echo.
 */
export function CursorOrb() {
  const rootRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const ring = ringRef.current;
    if (!root || !ring) return;

    const precisionPointer = window.matchMedia(
      "(hover: hover) and (pointer: fine)",
    );
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );

    let enabled = precisionPointer.matches && !reducedMotion.matches;
    let visible = false;
    let animating = false;
    let animationFrame = 0;
    let lastTime = 0;
    let pointerX = 0;
    let pointerY = 0;
    let ringX = 0;
    let ringY = 0;
    let ringScale = 1;
    let targetScale = 1;
    let interactiveTarget: Element | null = null;

    const drawRing = () => {
      ring.style.transform = `translate3d(${(ringX - RING_SIZE / 2).toFixed(2)}px, ${(ringY - RING_SIZE / 2).toFixed(2)}px, 0) scale(${ringScale.toFixed(3)})`;
    };

    const stop = () => {
      if (animationFrame) cancelAnimationFrame(animationFrame);
      animationFrame = 0;
      animating = false;
      lastTime = 0;
    };

    const frame = (now: number) => {
      animationFrame = 0;
      if (!enabled || document.hidden) {
        animating = false;
        return;
      }

      // Normalize the chase across 60/120Hz displays and clamp tab-return gaps.
      const elapsed = lastTime ? Math.min(now - lastTime, 100) : 16.7;
      lastTime = now;
      const follow = 1 - Math.pow(1 - FOLLOW_PER_FRAME, elapsed / 16.7);

      ringX += (pointerX - ringX) * follow;
      ringY += (pointerY - ringY) * follow;
      ringScale += (targetScale - ringScale) * follow;

      const settled =
        Math.abs(pointerX - ringX) < 0.1 &&
        Math.abs(pointerY - ringY) < 0.1 &&
        Math.abs(targetScale - ringScale) < 0.005;

      if (settled) {
        ringX = pointerX;
        ringY = pointerY;
        ringScale = targetScale;
      }
      drawRing();

      if (settled) {
        animating = false;
        return;
      }
      animationFrame = requestAnimationFrame(frame);
    };

    const wake = () => {
      if (animating || !enabled || document.hidden) return;
      animating = true;
      lastTime = 0;
      animationFrame = requestAnimationFrame(frame);
    };

    const hide = () => {
      if (!visible) return;
      visible = false;
      interactiveTarget = null;
      targetScale = 1;
      root.classList.remove("is-visible");
      ring.classList.remove("is-interactive");
      stop();
    };

    const updateInteractiveTarget = (target: EventTarget | null) => {
      const next =
        target instanceof Element ? target.closest(INTERACTIVE) : null;
      if (next === interactiveTarget) return;
      interactiveTarget = next;
      targetScale = next ? INTERACTIVE_SCALE : 1;
      ring.classList.toggle("is-interactive", Boolean(next));
      wake();
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType && event.pointerType !== "mouse") {
        hide();
        return;
      }
      if (!enabled || document.hidden) return;

      pointerX = event.clientX;
      pointerY = event.clientY;
      updateInteractiveTarget(event.target);

      if (!visible) {
        // Re-enter at the pointer instead of flying in from a stale coordinate.
        visible = true;
        ringX = pointerX;
        ringY = pointerY;
        ringScale = targetScale;
        drawRing();
        root.classList.add("is-visible");
      }
      wake();
    };

    const onPointerDown = (event: PointerEvent) => {
      // A touchscreen can coexist with a fine mouse/trackpad media query.
      // Park the orb as soon as the interaction switches away from the mouse.
      if (event.pointerType && event.pointerType !== "mouse") hide();
    };

    const onPointerOut = (event: PointerEvent) => {
      if (event.relatedTarget === null) hide();
    };

    const onVisibilityChange = () => {
      if (document.hidden) hide();
    };

    const onPreferenceChange = () => {
      enabled = precisionPointer.matches && !reducedMotion.matches;
      if (!enabled) hide();
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    document.addEventListener("pointerout", onPointerOut);
    window.addEventListener("blur", hide);
    document.addEventListener("visibilitychange", onVisibilityChange);
    precisionPointer.addEventListener("change", onPreferenceChange);
    reducedMotion.addEventListener("change", onPreferenceChange);

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("pointerout", onPointerOut);
      window.removeEventListener("blur", hide);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      precisionPointer.removeEventListener("change", onPreferenceChange);
      reducedMotion.removeEventListener("change", onPreferenceChange);
      stop();
      root.classList.remove("is-visible");
      ring.classList.remove("is-interactive");
      ring.style.transform = "";
    };
  }, []);

  return (
    <div ref={rootRef} className="cursor-orb" aria-hidden="true">
      <span ref={ringRef} className="cursor-orb__ring" />
    </div>
  );
}
