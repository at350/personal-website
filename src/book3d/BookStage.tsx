/* The v2 stage: a WebGL book under a live DOM spread.
   At rest you are reading real HTML. The moment paper moves, the mesh takes
   over with the same rasterized pages, real bend, real light. */

import { Suspense, useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { ISSUE } from "@/magazine/issue-map";
import { SPREADS, pageLabel, spreadPages } from "@/magazine/folio";
import { initialEngineState, reduce, type EngineEvent } from "@/magazine/engine";
import { BookScene, type BookMotion } from "./BookScene";
import { CaptureFarm, prefetchAround } from "./pageTextures";
import { Folio } from "@/components/furniture/Folio";
import { RunningHead } from "@/components/furniture/RunningHead";
import { GridOverlay } from "@/components/furniture/GridOverlay";
import "@/styles/book-stage.css";

const TOTAL = SPREADS.length;

function usePageSize() {
  const compute = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const pw = Math.min(0.42 * w, 0.6 * h);
    return { pw, ph: (pw * 4) / 3 };
  };
  const [size, setSize] = useState(compute);
  useEffect(() => {
    const onResize = () => setSize(compute());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return size;
}

function OverlayFace({ spread, face, showGrid }: { spread: number; face: "verso" | "recto"; showGrid: boolean }) {
  const def = SPREADS[spread];
  const binding = ISSUE[spread];
  if (!def || !binding) return <div className="ov-face ov-face--void" />;
  if ((def.kind === "cover" && face === "verso") || (def.kind === "back" && face === "recto")) {
    return <div className="ov-face ov-face--void" />;
  }
  const pages = spreadPages(spread);
  const page = pages ? (face === "verso" ? pages[0] : pages[1]) : null;
  const fullBleed = binding.fullBleed?.[face] ?? false;
  const { Component } = binding;
  return (
    <div className={`ov-face ov-face--${face}`}>
      <Component face={face} mode="book" />
      {!fullBleed && def.runningHead ? <RunningHead text={def.runningHead} side={face} /> : null}
      {!fullBleed && page !== null ? <Folio page={page} side={face} /> : null}
      {showGrid ? <GridOverlay /> : null}
    </div>
  );
}

interface BookStageProps {
  targetSpread: number;
  onSpreadSettled?: (index: number) => void;
}

export function BookStage({ targetSpread, onSpreadSettled }: BookStageProps) {
  const [state, dispatch] = useReducer(
    (s: ReturnType<typeof initialEngineState>, e: EngineEvent) => reduce(s, e, TOTAL),
    targetSpread,
    initialEngineState,
  );
  const { pw, ph } = usePageSize();
  const [showGrid, setShowGrid] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const motion = useMemo<BookMotion>(
    () => ({
      leaf: null,
      current: targetSpread,
      progress: 0,
      velocity: 0,
      target: null,
      dragging: false,
      released: false,
      shift: 0,
      pointerX: 0,
      pointerY: 0,
      onSettled: null,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const busy = state.sheet !== null || state.dragging;

  // Mirror reducer state into the mutable motion channel.
  useEffect(() => {
    motion.current = state.current;
    motion.leaf = state.sheet;
    if (state.sheet !== null && !state.dragging && state.settleTarget !== null) {
      // Auto turns (riffle/keyboard) start from the resting side.
      if (motion.target === null) {
        motion.released = motion.progress !== 0 && motion.progress !== 1;
        if (!motion.released) {
          motion.progress = state.direction === 1 ? 0 : 1;
          motion.velocity = state.direction === 1 ? 1.1 : -1.1;
        }
      }
      motion.target = state.settleTarget;
      motion.onSettled = () => dispatch({ type: "TICK_COMPLETE" });
    }
    if (state.sheet === null) {
      motion.target = null;
      motion.progress = 0;
      motion.velocity = 0;
    }
  }, [dispatch, motion, pw, state]);

  // Shift is pure derivation — computed in render so the overlay and the mesh
  // always agree on where the book sits.
  const atCover = state.current === 0 && state.sheet === null;
  const atBack = state.current === TOTAL - 1 && state.sheet === null;
  motion.shift = atCover ? -pw / 2 : atBack ? pw / 2 : 0;

  // Texture prefetch around the action.
  useEffect(() => {
    prefetchAround(state.current);
  }, [state.current]);

  // External navigation. Requests that land mid-turn are queued, not dropped —
  // rapid keyboard/TOC input must never feel ignored.
  const prevTarget = useRef(targetSpread);
  const pendingTarget = useRef<number | null>(null);
  useEffect(() => {
    if (prevTarget.current === targetSpread) return;
    prevTarget.current = targetSpread;
    if (targetSpread === state.current) return;
    if (busy) pendingTarget.current = targetSpread;
    else dispatch({ type: "TURN", to: targetSpread });
  }, [busy, state, targetSpread]);

  useEffect(() => {
    if (busy || pendingTarget.current === null) return;
    const to = pendingTarget.current;
    pendingTarget.current = null;
    if (to !== state.current) dispatch({ type: "TURN", to });
  }, [busy, state]);

  useEffect(() => {
    if (!busy) onSpreadSettled?.(state.current);
  }, [busy, onSpreadSettled, state]);

  // Drag from the fore-edges.
  const onEdgeDown = useCallback(
    (edge: "fore" | "back") => (e: React.PointerEvent) => {
      if (motion.leaf !== null && motion.target !== null) return;
      dispatch({ type: "DRAG_START", edge });
      const startX = e.clientX;
      const startProgress = edge === "fore" ? 0 : 1;
      motion.progress = startProgress;
      motion.velocity = 0;
      motion.dragging = true;
      let lastX = e.clientX;
      let lastT = performance.now();
      const width = pw * 2;
      const move = (ev: PointerEvent) => {
        const now = performance.now();
        const dt = Math.max(now - lastT, 1);
        motion.velocity = (-(ev.clientX - lastX) / width) * (1000 / dt);
        lastX = ev.clientX;
        lastT = now;
        const delta = (startX - ev.clientX) / (width * 0.82);
        motion.progress = Math.min(1, Math.max(0, startProgress + delta));
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
        motion.dragging = false;
        dispatch({ type: "DRAG_MOVE", progress: motion.progress });
        dispatch({ type: "DRAG_END", velocity: motion.velocity / 2.5 });
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
    },
    [motion, pw],
  );

  // Pointer tilt (rest = CSS on the overlay; flight = mesh).
  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const nx = (e.clientX / window.innerWidth) * 2 - 1;
      const ny = (e.clientY / window.innerHeight) * 2 - 1;
      motion.pointerX = nx;
      motion.pointerY = ny;
      overlayRef.current?.style.setProperty("--tilt-x", String(nx));
      overlayRef.current?.style.setProperty("--tilt-y", String(ny));
    },
    [motion],
  );

  // Queued turn helper: never drop an intent because paper was moving.
  const go = useCallback(
    (to: number) => {
      const clamped = Math.min(Math.max(to, 0), TOTAL - 1);
      if (busy) pendingTarget.current = clamped;
      else dispatch({ type: "TURN", to: clamped });
    },
    [busy],
  );

  // Keyboard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && /^(input|textarea|select)$/i.test(t.tagName)) return;
      if (e.key === "ArrowRight") go(state.current + 1);
      else if (e.key === "ArrowLeft") go(state.current - 1);
      else if (e.key === "Home") go(0);
      else if (e.key === "End") go(TOTAL - 1);
      else if (e.key === "g") setShowGrid((v) => !v);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, state]);

  const pages = spreadPages(state.current);
  const folioLine = pages
    ? `${String(pages[0]).padStart(2, "0")}–${String(pages[1]).padStart(2, "0")}`
    : state.current === 0
      ? "COVER"
      : "END";

  const overlayVisible = state.sheet === null;
  const shift = motion.shift;

  return (
    <div className="bstage" ref={stageRef} onPointerMove={onPointerMove}>
      <Canvas
        className="bstage__canvas"
        shadows
        gl={{ antialias: true, alpha: true }}
        dpr={[1, 2]}
      >
        <Suspense fallback={null}>
          <BookScene motion={motion} pw={pw} ph={ph} />
        </Suspense>
      </Canvas>

      <div
        ref={overlayRef}
        className={`bstage__spread ${overlayVisible ? "" : "bstage__spread--hidden"}`}
        style={{
          width: pw * 2,
          height: ph,
          transform: `translate(calc(-50% + ${shift}px), -50%)`,
        }}
      >
        <OverlayFace spread={state.current} face="verso" showGrid={showGrid} />
        <OverlayFace spread={state.current} face="recto" showGrid={showGrid} />
      </div>

      {/* Fore-edge drag zones sit over everything at the page edges. */}
      <div
        className="bstage__edge bstage__edge--back"
        style={{ left: `calc(50% + ${shift}px - ${pw}px - 24px)` }}
        onPointerDown={onEdgeDown("back")}
        role="presentation"
      />
      <div
        className="bstage__edge bstage__edge--fore"
        style={{ left: `calc(50% + ${shift}px + ${pw}px - 40px)` }}
        onPointerDown={onEdgeDown("fore")}
        role="presentation"
      />

      <nav className="bstage__nav" aria-label="Pages">
        <button
          className="bstage__arrow mono-label"
          onClick={() => go(state.current - 1)}
          disabled={state.current === 0}
          aria-label="Previous spread"
        >
          ←
        </button>
        <p className="bstage__folio mono-label" aria-hidden>
          {folioLine}
        </p>
        <button
          className="bstage__arrow mono-label"
          onClick={() => go(state.current + 1)}
          disabled={state.current === TOTAL - 1}
          aria-label="Next spread"
        >
          →
        </button>
      </nav>

      <div aria-live="polite" className="visually-hidden">
        {`${pageLabel(state.current)} · ${SPREADS[state.current]?.label ?? ""}`}
      </div>

      <CaptureFarm />
    </div>
  );
}
