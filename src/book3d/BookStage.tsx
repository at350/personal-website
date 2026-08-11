/* The v2 stage: a WebGL book under a live DOM spread.
   At rest you are reading real HTML. The moment paper moves, the mesh takes
   over with the same rasterized pages, real bend, real light. */

import { Suspense, useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { ISSUE } from "@/magazine/issue-map";
import { SPREADS, pageLabel, spreadPages } from "@/magazine/folio";
import { initialEngineState, reduce, type EngineEvent } from "@/magazine/engine";
import { BookScene, type BookMotion } from "./BookScene";
import { normalizeBookPointer } from "./bookPose";
import {
  CaptureFarm,
  pageRasterLayout,
  getTextureProgress,
  prefetchAround,
  type TextureProgress,
} from "./pageTextures";
import { Folio } from "@/components/furniture/Folio";
import { RunningHead } from "@/components/furniture/RunningHead";
import { GridOverlay } from "@/components/furniture/GridOverlay";
import "@/styles/book-stage.css";

const TOTAL = SPREADS.length;

function EntryLoader({ progress }: { progress: TextureProgress }) {
  const ratio = progress.total === 0 ? 0 : progress.completed / progress.total;
  return (
    <div className="entry-loader" role="status" aria-live="polite">
      <p className="entry-loader__name">ALAN TAI</p>
      <div className="entry-loader__track" aria-hidden>
        <span style={{ transform: `scaleX(${ratio})` }} />
      </div>
      <p className="entry-loader__count mono-label">
        {String(progress.completed).padStart(2, "0")}/
        {String(progress.total).padStart(2, "0")}
      </p>
    </div>
  );
}

function usePageSize() {
  const compute = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const pw = Math.min(0.46 * w, 0.66 * h);
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
  const [tocOpen, setTocOpen] = useState(false);
  const [textureProgress, setTextureProgress] = useState(getTextureProgress);
  const [texturesReady, setTexturesReady] = useState(
    () => textureProgress.total > 0 && textureProgress.loaded === textureProgress.total,
  );
  const stageRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const touchOnly = useMemo(
    () => typeof window !== "undefined" && window.matchMedia("(hover: none)").matches,
    [],
  );

  const motion = useMemo<BookMotion>(
    () => ({
      leaf: null,
      current: targetSpread,
      progress: 0,
      velocity: 0,
      target: null,
      dragTarget: 0,
      dragging: false,
      grabY: 0,
      grabOffsetY: 0,
      turnDirection: 1,
      released: false,
      shift:
        targetSpread === 0
          ? -pw / 2
          : targetSpread === TOTAL - 1
            ? pw / 2
            : 0,
      turnShift:
        targetSpread === 0
          ? -pw / 2
          : targetSpread === TOTAL - 1
            ? pw / 2
            : 0,
      pointerX: 0,
      pointerY: 0,
      poseTarget: touchOnly ? 1 : 0,
      pose: touchOnly ? 1 : 0,
      turnPose: touchOnly ? 1 : 0,
      handoff: touchOnly ? 1 : 0,
      onPose: null,
      onSettled: null,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const busy = state.sheet !== null || state.dragging;
  const onTextureProgress = useCallback((progress: TextureProgress) => {
    setTextureProgress(progress);
  }, []);
  const onTexturesReady = useCallback((progress: TextureProgress) => {
    setTextureProgress(progress);
    setTexturesReady(progress.loaded === progress.total);
  }, []);

  // Mirror reducer state into the mutable motion channel.
  useEffect(() => {
    motion.current = state.current;
    motion.leaf = state.sheet;
    if (state.sheet !== null && !state.dragging && state.settleTarget !== null) {
      // Auto turns (riffle/keyboard) start from the resting side.
      if (motion.target === null) {
        motion.released = motion.progress !== 0 && motion.progress !== 1;
        if (!motion.released) {
          motion.grabY = 0;
          motion.grabOffsetY = 0;
          motion.progress = state.direction === 1 ? 0 : 1;
          motion.velocity = state.direction === 1 ? 1.1 : -1.1;
        }
        motion.turnDirection = state.direction === -1 ? -1 : 1;
      }
      motion.target = state.settleTarget;
      motion.onSettled = () => dispatch({ type: "TICK_COMPLETE" });
    }
    if (state.sheet === null) {
      motion.target = null;
      motion.progress = 0;
      motion.velocity = 0;
      motion.grabOffsetY = 0;
    }
    motion.poseTarget =
      state.sheet !== null || state.dragging
        ? motion.turnPose
        : touchOnly
          ? 1
          : hoverRef.current
            ? 1
            : 0;
  }, [dispatch, motion, pw, state, touchOnly]);

  // The overlay only appears once the landed mesh reaches its new resting
  // center. During the turn, BookScene keeps the original spine under the hand.
  const atCover = state.current === 0;
  const atBack = state.current === TOTAL - 1;
  const restingShift = atCover ? -pw / 2 : atBack ? pw / 2 : 0;

  // Texture prefetch around the action.
  useEffect(() => {
    prefetchAround(state.current);
  }, [state]);

  // External navigation. Requests that land mid-turn are queued, not dropped —
  // rapid keyboard/TOC input must never feel ignored.
  const prevTarget = useRef(targetSpread);
  const pendingTarget = useRef<number | null>(null);
  useEffect(() => {
    if (prevTarget.current === targetSpread) return;
    prevTarget.current = targetSpread;
    if (targetSpread === state.current) return;
    if (busy) pendingTarget.current = targetSpread;
    else {
      motion.turnPose = motion.pose;
      motion.poseTarget = motion.turnPose;
      motion.turnShift = motion.shift;
      dispatch({ type: "TURN", to: targetSpread });
    }
  }, [busy, motion, state, targetSpread]);

  useEffect(() => {
    if (busy || pendingTarget.current === null) return;
    const to = pendingTarget.current;
    pendingTarget.current = null;
    if (to !== state.current) {
      motion.turnPose = motion.pose;
      motion.poseTarget = motion.turnPose;
      motion.turnShift = motion.shift;
      dispatch({ type: "TURN", to });
    }
  }, [busy, motion, state]);

  useEffect(() => {
    if (!busy) onSpreadSettled?.(state.current);
  }, [busy, onSpreadSettled, state]);

  // One drag engine for edge zones (instant) and the page surface (threshold).
  const beginDrag = useCallback(
    (
      edge: "fore" | "back",
      startX: number,
      startY: number,
      pointerId: number,
    ) => {
      if (motion.leaf !== null && motion.target !== null) return;
      dispatch({ type: "DRAG_START", edge });
      const stage = stageRef.current;
      stage?.classList.add("bstage--dragging");
      try {
        stage?.setPointerCapture(pointerId);
      } catch {
        /* capture is a nicety, not a requirement */
      }
      window.getSelection()?.removeAllRanges();
      const startProgress = edge === "fore" ? 0 : 1;
      motion.progress = startProgress;
      motion.dragTarget = startProgress;
      motion.velocity = 0;
      motion.dragging = true;
      motion.grabOffsetY = 0;
      motion.turnPose = motion.pose;
      motion.poseTarget = motion.turnPose;
      motion.turnShift = motion.shift;
      motion.turnDirection = edge === "fore" ? 1 : -1;
      const paperRect = overlayRef.current?.getBoundingClientRect();
      const paperCenterY = paperRect
        ? paperRect.top + paperRect.height / 2
        : window.innerHeight / 2;
      motion.grabY = Math.min(
        1,
        Math.max(-1, (paperCenterY - startY) / (ph / 2)),
      );
      const width = pw * 2;
      const move = (ev: PointerEvent) => {
        const delta = (startX - ev.clientX) / (width * 0.82);
        motion.dragTarget = Math.min(1, Math.max(0, startProgress + delta));
        motion.grabOffsetY = Math.min(
          ph * 0.2,
          Math.max(-ph * 0.2, startY - ev.clientY),
        );
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
        stage?.classList.remove("bstage--dragging");
        try {
          stage?.releasePointerCapture(pointerId);
        } catch {
          /* released with the pointer */
        }
        motion.dragging = false;
        motion.grabOffsetY = 0;
        dispatch({ type: "DRAG_MOVE", progress: motion.progress });
        dispatch({ type: "DRAG_END", velocity: motion.velocity / 3 });
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
    },
    [motion, ph, pw],
  );

  const onEdgeDown = useCallback(
    (edge: "fore" | "back") => (e: React.PointerEvent) => {
      e.preventDefault();
      beginDrag(edge, e.clientX, e.clientY, e.pointerId);
    },
    [beginDrag],
  );

  // Grab anywhere on the paper: a horizontal pull past a small threshold
  // becomes a page turn; a plain click stays a click. Never selects text.
  const onSurfaceDown = useCallback(
    (e: React.PointerEvent) => {
      if (!texturesReady) return;
      if (e.button !== 0) return;
      if (motion.leaf !== null || motion.dragging) return;
      const downX = e.clientX;
      const downY = e.clientY;
      const pointerId = e.pointerId;
      let engaged = false;
      const move = (ev: PointerEvent) => {
        if (engaged) return;
        const dx = ev.clientX - downX;
        const dy = ev.clientY - downY;
        if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.2) {
          engaged = true;
          cleanup();
          const edge = dx < 0 ? "fore" : "back";
          if (edge === "fore" && state.current >= TOTAL - 1) return;
          if (edge === "back" && state.current <= 0) return;
          // A drag is not a click: swallow the click that would follow.
          window.addEventListener(
            "click",
            (ce) => {
              ce.stopPropagation();
              ce.preventDefault();
            },
            { capture: true, once: true },
          );
          beginDrag(edge, downX, downY, pointerId);
        }
      };
      const cleanup = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", cleanup);
        window.removeEventListener("pointercancel", cleanup);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", cleanup);
      window.addEventListener("pointercancel", cleanup);
    },
    [beginDrag, motion, state, texturesReady],
  );

  // Pose choreography: the book rests as a display object and flattens for
  // reading when the pointer reaches it. One damped channel, no state pops.
  const hoverRef = useRef(false);
  const desiredPose = useCallback(() => {
    if (motion.leaf !== null || motion.dragging) return motion.turnPose;
    if (touchOnly) return 1;
    return hoverRef.current ? 1 : 0;
  }, [motion, touchOnly]);

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const cx = window.innerWidth / 2 + motion.shift;
      const cy = window.innerHeight / 2;
      const pointer = normalizeBookPointer({
        x: e.clientX,
        y: e.clientY,
        centerX: cx,
        centerY: cy,
        halfWidth: pw + 48,
        halfHeight: ph / 2 + 48,
      });
      motion.pointerX = pointer.x;
      motion.pointerY = pointer.y;
      hoverRef.current =
        Math.abs(e.clientX - cx) < pw + 48 && Math.abs(e.clientY - cy) < ph / 2 + 48;
      motion.poseTarget = desiredPose();
    },
    [desiredPose, motion, ph, pw],
  );

  // The scene reports exact transform alignment every frame. The DOM only
  // replaces the canvas once rotation, scale, and center are all subpixel.
  useEffect(() => {
    motion.onPose = (_pose: number, handoff: number) => {
      const el = overlayRef.current;
      if (!el) return;
      el.style.opacity = String(handoff);
      el.style.visibility = handoff < 0.02 ? "hidden" : "visible";
      el.style.pointerEvents = handoff > 0.98 ? "auto" : "none";
    };
    return () => {
      motion.onPose = null;
    };
  }, [motion]);

  // Queued turn helper: never drop an intent because paper was moving.
  const go = useCallback(
    (to: number) => {
      if (!texturesReady) return;
      const clamped = Math.min(Math.max(to, 0), TOTAL - 1);
      if (busy) pendingTarget.current = clamped;
      else {
        motion.turnPose = motion.pose;
        motion.poseTarget = motion.turnPose;
        motion.turnShift = motion.shift;
        dispatch({ type: "TURN", to: clamped });
      }
    },
    [busy, motion, texturesReady],
  );

  // Keyboard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!texturesReady) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && /^(input|textarea|select)$/i.test(t.tagName)) return;
      if (e.key === "ArrowRight") go(state.current + 1);
      else if (e.key === "ArrowLeft") go(state.current - 1);
      else if (e.key === "Home") go(0);
      else if (e.key === "End") go(TOTAL - 1);
      else if (e.key === "g") setShowGrid((v) => !v);
      else if (e.key === "Escape") setTocOpen(false);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, state, texturesReady]);

  const pages = spreadPages(state.current);
  const rasterLayout = pageRasterLayout(pw);
  const folioLine = pages
    ? `${String(pages[0]).padStart(2, "0")}-${String(pages[1]).padStart(2, "0")}`
    : state.current === 0
      ? "COVER"
      : "END";

  const shift = restingShift;

  return (
    <div
      className="bstage"
      ref={stageRef}
      onPointerMove={onPointerMove}
      aria-busy={!texturesReady}
    >
      {texturesReady ? (
        <Canvas
          className="bstage__canvas"
          shadows
          gl={{ antialias: true, alpha: true }}
          onCreated={({ gl }) => {
            gl.shadowMap.type = THREE.PCFShadowMap;
          }}
          dpr={[1, 2]}
        >
          <Suspense fallback={null}>
            <BookScene motion={motion} pw={pw} ph={ph} />
          </Suspense>
        </Canvas>
      ) : null}

      <div
        ref={overlayRef}
        className="bstage__spread"
        onPointerDown={onSurfaceDown}
        style={{
          width: pw * 2,
          height: ph,
          opacity: touchOnly ? 1 : 0,
          transform: `translate(calc(-50% + ${shift}px), -50%)`,
        }}
      >
        <div
          className="bstage__spread-pages"
          style={{
            width: rasterLayout.spreadWidth,
            height: rasterLayout.pageHeight,
            transform: `scale(${rasterLayout.scale})`,
          }}
        >
          <OverlayFace spread={state.current} face="verso" showGrid={showGrid} />
          <OverlayFace spread={state.current} face="recto" showGrid={showGrid} />
        </div>
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
        <button
          className="bstage__folio mono-label"
          aria-expanded={tocOpen}
          aria-label="Contents"
          onClick={() => setTocOpen((v) => !v)}
        >
          {folioLine}
        </button>
        <button
          className="bstage__arrow mono-label"
          onClick={() => go(state.current + 1)}
          disabled={state.current === TOTAL - 1}
          aria-label="Next spread"
        >
          →
        </button>
        {tocOpen ? (
          <div className="bstage__toc" role="menu">
            {SPREADS.map((def, i) => {
              const p = spreadPages(i);
              return (
                <button
                  key={def.id}
                  role="menuitem"
                  className={`bstage__toc-row ${i === state.current ? "bstage__toc-row--here" : ""}`}
                  onClick={() => {
                    setTocOpen(false);
                    go(i);
                  }}
                >
                  <span className="mono-label bstage__toc-no">
                    {p ? String(p[0]).padStart(2, "0") : i === 0 ? "-" : "··"}
                  </span>
                  <span className="bstage__toc-label">{def.label.toLowerCase()}</span>
                </button>
              );
            })}
          </div>
        ) : null}
      </nav>

      <div aria-live="polite" className="visually-hidden">
        {`${pageLabel(state.current)} · ${SPREADS[state.current]?.label ?? ""}`}
      </div>

      {!texturesReady ? <EntryLoader progress={textureProgress} /> : null}

      <CaptureFarm onProgress={onTextureProgress} onReady={onTexturesReady} />
    </div>
  );
}
