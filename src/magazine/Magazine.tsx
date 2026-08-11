import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { ISSUE } from "./issue-map";
import { SPREADS, pageLabel, spreadPages } from "./folio";
import { initialEngineState, reduce, type EngineEvent } from "./engine";
import { useFlipDrag, usePrefersReducedMotion } from "./useFlipDrag";
import { Folio } from "@/components/furniture/Folio";
import { RunningHead } from "@/components/furniture/RunningHead";
import { GridOverlay } from "@/components/furniture/GridOverlay";
import "@/styles/magazine.css";

const TOTAL = SPREADS.length;

interface MagazineProps {
  targetSpread: number;
  onSpreadSettled?: (index: number) => void;
}

function PageFace({ spread, face }: { spread: number; face: "verso" | "recto" }) {
  const def = SPREADS[spread];
  const binding = ISSUE[spread];
  if (!def || !binding) return null;
  const pages = spreadPages(spread);
  const page = pages ? (face === "verso" ? pages[0] : pages[1]) : null;
  const fullBleed = binding.fullBleed?.[face] ?? false;
  const { Component } = binding;
  return (
    <div className={`page-face page-face--${face}`} data-spread={def.id}>
      <Component face={face} mode="book" />
      {!fullBleed && def.runningHead ? <RunningHead text={def.runningHead} side={face} /> : null}
      {!fullBleed && page !== null ? <Folio page={page} side={face} /> : null}
    </div>
  );
}

export function Magazine({ targetSpread, onSpreadSettled }: MagazineProps) {
  const reducedMotion = usePrefersReducedMotion();
  const [state, rawDispatch] = useReducer(
    (s: ReturnType<typeof initialEngineState>, e: EngineEvent) => reduce(s, e, TOTAL),
    targetSpread,
    initialEngineState,
  );
  const bookRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [showGrid, setShowGrid] = useState(false);
  const dispatch = useCallback((e: EngineEvent) => rawDispatch(e), []);
  const { onPointerDown } = useFlipDrag(state, dispatch, bookRef, reducedMotion);

  const busy = state.sheet !== null || state.dragging;

  // External navigation (routes, TOC) → TURN. React to *changes* of the target
  // only — the target also follows us around via onSpreadSettled, and treating
  // that echo as a command would turn the book right back.
  const prevTarget = useRef(targetSpread);
  const pendingTarget = useRef<number | null>(null);
  useEffect(() => {
    if (prevTarget.current === targetSpread) return;
    prevTarget.current = targetSpread;
    if (targetSpread === state.current) return;
    if (busy) {
      pendingTarget.current = targetSpread;
    } else {
      dispatch({ type: "TURN", to: targetSpread });
    }
  }, [busy, dispatch, state.current, targetSpread]);

  // Apply a navigation that arrived mid-turn.
  useEffect(() => {
    if (busy || pendingTarget.current === null) return;
    const to = pendingTarget.current;
    pendingTarget.current = null;
    if (to !== state.current) dispatch({ type: "TURN", to });
  }, [busy, dispatch, state.current]);

  // Report settles upward (router sync).
  const settled = !busy;
  useEffect(() => {
    if (settled) onSpreadSettled?.(state.current);
  }, [onSpreadSettled, settled, state.current]);

  // Keyboard chrome.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && /^(input|textarea|select)$/i.test(target.tagName)) return;
      if (e.key === "ArrowRight") dispatch({ type: "TURN", to: state.current + 1 });
      else if (e.key === "ArrowLeft") dispatch({ type: "TURN", to: state.current - 1 });
      else if (e.key === "Home") dispatch({ type: "TURN", to: 0 });
      else if (e.key === "End") dispatch({ type: "TURN", to: TOTAL - 1 });
      else if (e.key === "g") setShowGrid((v) => !v);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dispatch, state.current]);

  // Horizontal wheel flick.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    let cooling = false;
    const onWheel = (e: WheelEvent) => {
      const dx = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.shiftKey ? e.deltaY : 0;
      if (cooling || Math.abs(dx) < 24) return;
      cooling = true;
      window.setTimeout(() => (cooling = false), 650);
      dispatch({ type: "TURN", to: state.current + (dx > 0 ? 1 : -1) });
    };
    stage.addEventListener("wheel", onWheel, { passive: true });
    return () => stage.removeEventListener("wheel", onWheel);
  }, [dispatch, state.current]);

  const flight = state.sheet;
  const leftSpread = flight !== null ? flight : state.current;
  const rightSpread = flight !== null ? flight + 1 : state.current;
  const showLeft = SPREADS[leftSpread]?.kind !== "cover";
  const showRight = SPREADS[rightSpread]?.kind !== "back";
  const atCover = state.current === 0 && flight === null;
  const atBack = state.current === TOTAL - 1 && flight === null;
  const announcement = `${pageLabel(state.current)} · ${SPREADS[state.current]?.label ?? ""}`;

  return (
    <div
      className={[
        "stage",
        showGrid ? "stage--grid" : "",
        state.teleported && reducedMotion === false ? "stage--teleported" : "",
      ].join(" ")}
      ref={stageRef}
    >
      <div
        ref={bookRef}
        className={[
          "book",
          atCover ? "book--at-cover" : "",
          atBack ? "book--at-back" : "",
          flight !== null ? "book--turning" : "",
          state.dragging ? "book--dragging" : "",
          reducedMotion ? "book--calm" : "",
        ].join(" ")}
      >
        <div className="book__edges book__edges--left" aria-hidden style={{ "--n": leftSpread } as React.CSSProperties} />
        <div className="book__edges book__edges--right" aria-hidden style={{ "--n": TOTAL - 1 - rightSpread } as React.CSSProperties} />

        <div className={`page page--verso ${showLeft ? "" : "page--void"}`}>
          {showLeft ? <PageFace spread={leftSpread} face="verso" /> : null}
          {showLeft && showGrid ? <GridOverlay /> : null}
        </div>
        <div className={`page page--recto ${showRight ? "" : "page--void"}`}>
          {showRight ? <PageFace spread={rightSpread} face="recto" /> : null}
          {showRight && showGrid ? <GridOverlay /> : null}
        </div>

        {flight !== null && !reducedMotion ? (
          <div className="sheet" aria-hidden={state.dragging ? undefined : true}>
            <div className="sheet__face sheet__face--front">
              <PageFace spread={flight} face="recto" />
              <div className="sheet__shade" />
            </div>
            <div className="sheet__face sheet__face--back">
              <PageFace spread={flight + 1} face="verso" />
              <div className="sheet__light" />
            </div>
          </div>
        ) : null}

        {flight !== null ? <div className="book__cast" aria-hidden /> : null}

        <div
          className="hotzone hotzone--back"
          onPointerDown={onPointerDown("back")}
          role="presentation"
        />
        <div
          className="hotzone hotzone--fore"
          onPointerDown={onPointerDown("fore")}
          role="presentation"
        />
      </div>

      <nav className="stage__nav" aria-label="Page navigation">
        <button
          className="stage__turn stage__turn--prev mono-label"
          onClick={() => dispatch({ type: "TURN", to: state.current - 1 })}
          disabled={state.current === 0 || busy}
          aria-label="Previous spread"
        >
          ←
        </button>
        <p className="stage__where mono-label" aria-hidden>
          {announcement}
        </p>
        <button
          className="stage__turn stage__turn--next mono-label"
          onClick={() => dispatch({ type: "TURN", to: state.current + 1 })}
          disabled={state.current === TOTAL - 1 || busy}
          aria-label="Next spread"
        >
          →
        </button>
      </nav>

      <div aria-live="polite" className="visually-hidden">
        {announcement}
      </div>
    </div>
  );
}
