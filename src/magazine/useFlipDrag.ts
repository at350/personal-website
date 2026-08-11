import { useCallback, useEffect, useRef, useState } from "react";
import gsap from "gsap";
import type { EngineEvent, EngineState } from "./engine";

const REVERSE_EASE = "power2.out";
const COMMIT_EASE = "power3.out";

export interface FlipDragApi {
  onPointerDown: (edge: "fore" | "back") => (e: React.PointerEvent) => void;
  /** Imperative progress channel — avoids re-rendering React on every move. */
  progressRef: React.RefObject<number>;
}

/**
 * Owns the imperative half of the flip: pointer capture, progress mapping,
 * springs, and TICK_COMPLETE dispatches. The reducer stays pure.
 */
export function useFlipDrag(
  state: EngineState,
  dispatch: (e: EngineEvent) => void,
  bookRef: React.RefObject<HTMLDivElement | null>,
  reducedMotion: boolean,
): FlipDragApi {
  const progressRef = useRef(0);
  const tween = useRef<gsap.core.Tween | null>(null);
  const pointer = useRef<{ id: number; lastX: number; lastT: number; velocity: number } | null>(null);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const applyProgress = useCallback(
    (p: number) => {
      progressRef.current = p;
      bookRef.current?.style.setProperty("--p", String(p));
    },
    [bookRef],
  );

  const onPointerDown = useCallback(
    (edge: "fore" | "back") => (e: React.PointerEvent) => {
      if (reducedMotion) return; // reduced motion: hotzones act as plain buttons
      if (stateRef.current.sheet !== null) return;
      dispatch({ type: "DRAG_START", edge });
      const startProgress = edge === "fore" ? 0 : 1;
      applyProgress(startProgress);
      pointer.current = { id: e.pointerId, lastX: e.clientX, lastT: performance.now(), velocity: 0 };
      const book = bookRef.current;
      if (!book) return;
      const width = book.getBoundingClientRect().width || 1;
      const startX = e.clientX;

      const move = (ev: PointerEvent) => {
        if (pointer.current?.id !== ev.pointerId) return;
        const now = performance.now();
        const dt = Math.max(now - pointer.current.lastT, 1);
        const dx = ev.clientX - pointer.current.lastX;
        // Engine velocity semantics: positive = flipping toward 1 (leftward pointer travel).
        pointer.current.velocity = -dx / dt;
        pointer.current.lastX = ev.clientX;
        pointer.current.lastT = now;
        const delta = (startX - ev.clientX) / (width * 0.85);
        const p = edge === "fore" ? delta : 1 + delta;
        // Visuals go through the imperative CSS-var channel only; React state
        // hears about progress once, on release.
        applyProgress(Math.min(1, Math.max(0, p)));
      };
      const up = (ev: PointerEvent) => {
        if (pointer.current?.id !== ev.pointerId) return;
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
        dispatch({ type: "DRAG_MOVE", progress: progressRef.current });
        dispatch({ type: "DRAG_END", velocity: pointer.current.velocity });
        pointer.current = null;
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
    },
    [applyProgress, bookRef, dispatch, reducedMotion],
  );

  // Spring toward settleTarget whenever a settle is pending.
  useEffect(() => {
    if (state.sheet === null || state.settleTarget === null || state.dragging) return;
    if (reducedMotion || document.hidden) {
      // Hidden documents get no rAF ticks — never leave the book stuck mid-turn.
      applyProgress(state.settleTarget);
      const id = window.setTimeout(() => dispatch({ type: "TICK_COMPLETE" }), 30);
      return () => window.clearTimeout(id);
    }
    const target = state.settleTarget;
    const from = progressRef.current;
    const distance = Math.abs(target - from);
    const committing =
      (state.direction === 1 && target === 1) || (state.direction === -1 && target === 0);
    const auto = state.queue.length > 0;
    const proxy = { p: from };
    tween.current?.kill();
    tween.current = gsap.to(proxy, {
      p: target,
      duration: auto ? 0.32 : Math.max(0.28, (committing ? 0.75 : 0.45) * Math.max(distance, 0.35)),
      ease: committing ? COMMIT_EASE : REVERSE_EASE,
      onUpdate: () => applyProgress(proxy.p),
      onComplete: () => {
        tween.current = null;
        dispatch({ type: "TICK_COMPLETE" });
      },
    });
    const onHide = () => {
      if (document.hidden && tween.current) tween.current.progress(1);
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      tween.current?.kill();
      tween.current = null;
    };
  }, [applyProgress, dispatch, reducedMotion, state]);

  return { onPointerDown, progressRef };
}

export function usePrefersReducedMotion(): boolean {
  const [reduced] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  return reduced;
}
