/* The v2 stage: a WebGL book under a live DOM spread.
   At rest you are reading real HTML. The moment paper moves, the mesh takes
   over with the same rasterized pages, real bend, real light. */

import { Suspense, useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { useReducedMotion } from "motion/react";
import * as THREE from "three";
import { ISSUE } from "@/magazine/issue-map";
import { SPREADS, pageLabel, spreadPages } from "@/magazine/folio";
import { initialEngineState, reduce, type EngineEvent } from "@/magazine/engine";
import { BookScene, type BookMotion } from "./BookScene";
import {
  bookPointerFrame,
  bookRestingShift,
  normalizeBookPointer,
  withinBookRegion,
} from "./bookPose";
import {
  CaptureFarm,
  pageRasterLayout,
  getTextureProgress,
  isSpreadTextureFresh,
  prefetchAround,
  refreshSpreadTextures,
  type TextureProgress,
} from "./pageTextures";
import { useLibraryFilter } from "@/components/MediaWall";
import {
  usePersistentInteraction,
  type PersistentInteractionSpread,
} from "@/magazine/persistent-interactions";
import { Folio } from "@/components/furniture/Folio";
import { RunningHead } from "@/components/furniture/RunningHead";
import { GridOverlay } from "@/components/furniture/GridOverlay";
import type { ExperienceMode } from "@/components/ExperienceDock";
import type { IgnitePointerState } from "@/ignite/types";
import "@/styles/book-stage.css";

const TOTAL = SPREADS.length;
type ArrowDirection = -1 | 1;

interface HeldArrowKeys {
  left: boolean;
  right: boolean;
  active: ArrowDirection | null;
}

const PERSISTENT_SPREAD_INDEX: Record<PersistentInteractionSpread, number> = {
  features: SPREADS.findIndex((def) => def.id === "features"),
  resume: SPREADS.findIndex((def) => def.id === "resume"),
};

/** Margin (px) beyond the paper where hover still flattens the book and a
    pull still starts a turn. */
const GRAB_PAD = 48;

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
    // Keep an 80px rail clear on each side when width is the limiting axis.
    // The left rail belongs to the experience dock; the right remains a
    // balanced page-turn gutter so the book never looks pushed off-center.
    const pw = Math.min(0.46 * w, 0.66 * h, (w - 160) / 2);
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

/** Exported so the parity suite can compare the live face with the capture
 * farm face without maintaining a third, test-only rendering path. */
export function OverlayFace({
  spread,
  face,
  showGrid,
}: {
  spread: number;
  face: "verso" | "recto";
  showGrid: boolean;
}) {
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
    <div className={`page-face page-face--${face} ov-face ov-face--${face}`}>
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
  experienceMode?: ExperienceMode;
}

export function BookStage({
  targetSpread,
  onSpreadSettled,
  experienceMode = "read",
}: BookStageProps) {
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
  const [textureRefreshPending, setTextureRefreshPending] = useState(false);
  const igniteActive = experienceMode === "ignite";
  const prefersReducedMotion = Boolean(useReducedMotion());
  const [igniteReady, setIgniteReady] = useState(false);
  const igniteReadyRef = useRef(false);
  const [igniteStarted, setIgniteStarted] = useState(false);
  const [igniteComplete, setIgniteComplete] = useState(false);
  const [igniteProgress, setIgniteProgress] = useState(0);
  const [igniteRevision, bumpIgniteRevision] = useReducer(
    (revision: number) => revision + 1,
    0,
  );
  const ignitePointer = useMemo<IgnitePointerState>(
    () => ({
      u: 0.5,
      v: 0.5,
      inside: false,
      pressed: false,
      pointerType: "mouse",
    }),
    [],
  );
  const textureRefreshesPending = useRef(0);
  const stageRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const tapQueue = useRef<ArrowDirection[]>([]);
  const [tapRevision, wakeTapDrain] = useReducer(
    (revision: number) => revision + 1,
    0,
  );
  const heldArrowKeys = useRef<HeldArrowKeys>({
    left: false,
    right: false,
    active: null,
  });
  const [heldDirection, setHeldDirection] = useState<ArrowDirection | null>(null);

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
      releasedDrag: false,
      sheetEnergy: 0,
      settleHold: 0,
      swapReady: false,
      shift: bookRestingShift(targetSpread, TOTAL, pw),
      turnShift: bookRestingShift(targetSpread, TOTAL, pw),
      coverVertices: null,
      pointerX: 0,
      pointerY: 0,
      pointerActive: false,
      foilPointerX: 0,
      foilPointerY: 0,
      turnPointerX: 0,
      turnPointerY: 0,
      turnPointerActive: false,
      foilTilt: 0,
      poseTarget: touchOnly ? 1 : 0,
      pose: touchOnly ? 1 : 0,
      turnPose: touchOnly ? 1 : 0,
      handoff: touchOnly ? 1 : 0,
      onPose: null,
      onSettled: null,
      riffleProgress: 0,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const wasIgniteActive = useRef(false);

  useEffect(() => {
    if (igniteActive === wasIgniteActive.current) return;
    wasIgniteActive.current = igniteActive;
    ignitePointer.inside = false;
    ignitePointer.pressed = false;
    igniteReadyRef.current = false;
    if (igniteActive) {
      motion.poseTarget = 1;
    }
    queueMicrotask(() => {
      if (wasIgniteActive.current !== igniteActive) return;
      setIgniteReady(false);
      setIgniteStarted(false);
      setIgniteComplete(false);
      setIgniteProgress(0);
      if (igniteActive) {
        bumpIgniteRevision();
        setTocOpen(false);
      }
    });
  }, [igniteActive, ignitePointer, motion]);

  const busy =
    state.sheet !== null ||
    state.dragging ||
    state.riffle !== null ||
    textureRefreshPending;
  const currentSpread = state.current;
  const launchingTurn = useRef(false);
  useEffect(() => {
    if (state.sheet !== null || state.riffle !== null) launchingTurn.current = false;
  }, [state.riffle, state.sheet]);
  const launchTurn = useCallback(
    (to: number) => {
      if (igniteActive) return false;
      if (launchingTurn.current) return false;
      if (!isSpreadTextureFresh(currentSpread)) return false;
      launchingTurn.current = true;
      motion.turnPose = motion.pose;
      motion.poseTarget = motion.turnPose;
      motion.turnShift = motion.shift;
      motion.coverVertices = null;
      motion.turnPointerX = motion.pointerX;
      motion.turnPointerY = motion.pointerY;
      motion.turnPointerActive = motion.pointerActive;
      dispatch({ type: "TURN", to });
      return true;
    },
    [currentSpread, igniteActive, motion],
  );
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
      if (motion.target === null) {
        // Only an explicit pointer-up marks a released drag. Sniffing exact
        // progress values misreads a drag released at an extreme (progress
        // pinned to 0/1) as an auto turn and replays the whole flight.
        motion.released = motion.releasedDrag;
        motion.releasedDrag = false;
        if (!motion.released) {
          // Auto turns (riffle/keyboard) start from the resting side.
          motion.grabY = 0;
          motion.grabOffsetY = 0;
          motion.progress = state.direction === 1 ? 0 : 1;
          motion.velocity = state.direction === 1 ? 1.1 : -1.1;
        }
        motion.turnDirection = state.direction === -1 ? -1 : 1;
        motion.swapReady = false;
      }
      motion.target = state.settleTarget;
      motion.onSettled = () => dispatch({ type: "TICK_COMPLETE" });
    }
    if (state.sheet === null) {
      motion.target = null;
      motion.progress = 0;
      motion.velocity = 0;
      motion.grabOffsetY = 0;
      motion.releasedDrag = false;
      motion.sheetEnergy = 0;
      motion.settleHold = 0;
      motion.swapReady = false;
      motion.riffleProgress = 0;
      motion.coverVertices = null;
    }
    motion.poseTarget =
      igniteActive
        ? state.sheet !== null || state.dragging || state.riffle !== null
          ? motion.turnPose
          : 1
        : state.sheet !== null || state.dragging || state.riffle !== null
        ? motion.turnPose
        : touchOnly
          ? 1
          : hoverRef.current
            ? 1
            : 0;
  }, [dispatch, igniteActive, motion, pw, state, touchOnly]);

  // The overlay only appears once the landed mesh reaches its new resting
  // center. During a cover turn, BookScene moves that center with the sheet.
  const atCover = state.current === 0;
  const atBack = state.current === TOTAL - 1;
  const restingShift = bookRestingShift(state.current, TOTAL, pw);
  const pointerFrame = useCallback(
    () =>
      bookPointerFrame({
        viewportCenterX: window.innerWidth / 2,
        viewportCenterY: window.innerHeight / 2,
        shift: motion.shift,
        pageWidth: pw,
        pageHeight: ph,
        visible: atCover ? "right" : atBack ? "left" : "spread",
      }),
    [atBack, atCover, motion, ph, pw],
  );

  const updateIgnitePointer = useCallback(
    (event: globalThis.PointerEvent) => {
      const spineX = window.innerWidth / 2 + motion.shift;
      const left = spineX - pw;
      const top = window.innerHeight / 2 - ph / 2;
      const u = (event.clientX - left) / (pw * 2);
      const v = 1 - (event.clientY - top) / ph;
      const target = event.target instanceof Element ? event.target : null;
      const overChrome = Boolean(
        target?.closest(".experience-dock, .ignite-hud, .bstage__nav"),
      );
      const onExistingFace = u < 0.5
        ? currentSpread > 0
        : currentSpread < TOTAL - 1;
      ignitePointer.u = Math.min(1, Math.max(0, u));
      ignitePointer.v = Math.min(1, Math.max(0, v));
      ignitePointer.pointerType = event.pointerType || "mouse";
      ignitePointer.inside =
        igniteActive &&
        igniteReady &&
        !overChrome &&
        onExistingFace &&
        u >= 0 &&
        u <= 1 &&
        v >= 0 &&
        v <= 1;
    },
    [
      currentSpread,
      igniteActive,
      ignitePointer,
      igniteReady,
      motion,
      ph,
      pw,
    ],
  );

  useEffect(() => {
    if (!igniteActive) return;
    const onMove = (event: globalThis.PointerEvent) => {
      updateIgnitePointer(event);
    };
    const onDown = (event: globalThis.PointerEvent) => {
      updateIgnitePointer(event);
      ignitePointer.pressed = event.button === 0 && ignitePointer.inside;
    };
    const release = () => {
      ignitePointer.pressed = false;
    };
    const park = () => {
      ignitePointer.inside = false;
      ignitePointer.pressed = false;
    };
    const onVisibilityChange = () => {
      if (document.hidden) park();
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointerup", release, { passive: true });
    window.addEventListener("pointercancel", park, { passive: true });
    window.addEventListener("blur", park);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", park);
      window.removeEventListener("blur", park);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      park();
    };
  }, [igniteActive, ignitePointer, updateIgnitePointer]);

  // Texture prefetch around the action.
  useEffect(() => {
    prefetchAround(state.current);
  }, [state]);

  // The library chips change the wall's DOM at rest; the captured textures a
  // future flip will fly must follow, or the turn shows the stale filter.
  const libraryFilter = useLibraryFilter();
  const featuresInteraction = usePersistentInteraction("features");
  const resumeInteraction = usePersistentInteraction("resume");
  const librarySpread = useMemo(
    () => SPREADS.findIndex((def) => def.id === "library"),
    [],
  );
  const trackTextureRefresh = useCallback((refresh: Promise<boolean>) => {
    textureRefreshesPending.current += 1;
    queueMicrotask(() => setTextureRefreshPending(true));
    void refresh.finally(() => {
      textureRefreshesPending.current = Math.max(
        0,
        textureRefreshesPending.current - 1,
      );
      setTextureRefreshPending(textureRefreshesPending.current > 0);
    });
  }, []);
  const seenFilter = useRef(libraryFilter);
  useEffect(() => {
    if (seenFilter.current === libraryFilter) return;
    seenFilter.current = libraryFilter;
    if (librarySpread < 0) return;
    trackTextureRefresh(refreshSpreadTextures(librarySpread));
  }, [libraryFilter, librarySpread, trackTextureRefresh]);

  const interactionRevisions = useMemo(
    () => ({
      features: featuresInteraction.revision,
      resume: resumeInteraction.revision,
    }),
    [featuresInteraction.revision, resumeInteraction.revision],
  );
  const seenInteractionRevisions = useRef(interactionRevisions);
  useEffect(() => {
    for (const spread of ["features", "resume"] as const) {
      if (seenInteractionRevisions.current[spread] === interactionRevisions[spread]) {
        continue;
      }
      seenInteractionRevisions.current = {
        ...seenInteractionRevisions.current,
        [spread]: interactionRevisions[spread],
      };
      const spreadIndex = PERSISTENT_SPREAD_INDEX[spread];
      if (spreadIndex < 0) continue;
      trackTextureRefresh(refreshSpreadTextures(spreadIndex));
    }
  }, [interactionRevisions, trackTextureRefresh]);

  // Absolute navigation may arrive while paper is moving. Keep only its latest
  // destination; completed previous/next activations use their own ordered
  // queue so every deliberate rapid tap remains one adjacent turn.
  const prevTarget = useRef(targetSpread);
  const reportedSpread = useRef<number | null>(null);
  const pendingTarget = useRef<number | null>(null);
  useEffect(() => {
    if (!igniteActive) return;
    pendingTarget.current = null;
    tapQueue.current = [];
    heldArrowKeys.current = { left: false, right: false, active: null };
  }, [igniteActive]);
  useEffect(() => {
    if (prevTarget.current === targetSpread) return;
    prevTarget.current = targetSpread;
    if (igniteActive) {
      pendingTarget.current = null;
      return;
    }
    const to = Math.min(Math.max(targetSpread, 0), TOTAL - 1);
    // The parent mirrors a settled spread into the URL. Consume that echo
    // without treating it as a new absolute request if another turn has
    // already started in the meantime.
    if (reportedSpread.current === to) {
      reportedSpread.current = null;
      return;
    }
    reportedSpread.current = null;
    if (busy) {
      pendingTarget.current = to;
      return;
    }
    pendingTarget.current = null;
    if (to !== currentSpread && !launchTurn(to)) pendingTarget.current = to;
  }, [busy, currentSpread, igniteActive, launchTurn, targetSpread]);

  useEffect(() => {
    if (igniteActive) return;
    if (busy || pendingTarget.current === null) return;
    const to = pendingTarget.current;
    if (to === currentSpread) pendingTarget.current = null;
    else if (launchTurn(to)) pendingTarget.current = null;
  }, [busy, currentSpread, igniteActive, launchTurn]);

  // One drag engine for edge zones (instant) and the page surface (threshold).
  const beginDrag = useCallback(
    (
      edge: "fore" | "back",
      startX: number,
      startY: number,
      pointerId: number,
    ) => {
      if (igniteActive) return;
      if (busy) return;
      if (motion.dragging) return;
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
      motion.releasedDrag = false;
      motion.swapReady = false;
      motion.grabOffsetY = 0;
      motion.turnPose = motion.pose;
      motion.poseTarget = motion.turnPose;
      motion.turnShift = motion.shift;
      motion.coverVertices = null;
      motion.turnPointerX = motion.pointerX;
      motion.turnPointerY = motion.pointerY;
      motion.turnPointerActive = motion.pointerActive;
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
        motion.releasedDrag = true;
        motion.grabOffsetY = 0;
        dispatch({ type: "DRAG_MOVE", progress: motion.progress });
        dispatch({ type: "DRAG_END", velocity: motion.velocity / 3 });
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
    },
    [busy, igniteActive, motion, ph, pw],
  );

  const onEdgeDown = useCallback(
    (edge: "fore" | "back") => (e: React.PointerEvent) => {
      e.preventDefault();
      if (igniteActive) return;
      if (busy) return;
      const { clientX, clientY, pointerId } = e;
      if (!isSpreadTextureFresh(currentSpread)) return;
      beginDrag(edge, clientX, clientY, pointerId);
    },
    [beginDrag, busy, currentSpread, igniteActive],
  );

  // Grab anywhere on or near the book — posed mesh and live DOM alike: a
  // horizontal pull past a small threshold becomes a page turn; a plain click
  // stays a click. Lives on the stage, not the overlay, so the paper is
  // grabbable even before the WebGL-to-DOM handoff makes the overlay
  // interactive. Never selects text.
  const onSurfaceDown = useCallback(
    (e: React.PointerEvent) => {
      if (igniteActive) return;
      if (!texturesReady) return;
      if (busy) return;
      if (e.button !== 0) return;
      if (motion.leaf !== null || motion.dragging) return;
      if (
        (e.target as HTMLElement | null)?.closest(
          ".bstage__nav, button, a, input, select, textarea, .letter__plate",
        )
      ) {
        return;
      }
      const frame = pointerFrame();
      if (
        !withinBookRegion({
          x: e.clientX,
          y: e.clientY,
          ...frame,
          halfWidth: frame.halfWidth + GRAB_PAD,
          halfHeight: frame.halfHeight + GRAB_PAD,
        })
      ) {
        return;
      }
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
          if (!isSpreadTextureFresh(state.current)) return;
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
    [
      beginDrag,
      busy,
      igniteActive,
      motion,
      pointerFrame,
      state,
      texturesReady,
    ],
  );

  // Pose choreography: the book rests as a display object and flattens for
  // reading when the pointer reaches it. One damped channel, no state pops.
  const hoverRef = useRef(false);
  const desiredPose = useCallback(() => {
    if (motion.leaf !== null || motion.dragging || state.riffle !== null) {
      return motion.turnPose;
    }
    if (igniteActive) return 1;
    if (touchOnly) return 1;
    return hoverRef.current ? 1 : 0;
  }, [igniteActive, motion, state.riffle, touchOnly]);

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const frame = pointerFrame();
      const point = {
        x: e.clientX,
        y: e.clientY,
        ...frame,
      };
      const pointer = normalizeBookPointer(point);
      motion.foilPointerX = pointer.x;
      motion.foilPointerY = pointer.y;
      // Pointer capture keeps delivering moves while a page is held. Do not
      // feed that drag path back into the chassis pose: it would rotate the
      // whole magazine on release and create a second apparent recenter. The
      // foil uses its separate live channel above, so its light still follows
      // the hand throughout the turn.
      const poseLocked =
        motion.leaf !== null || motion.dragging || state.riffle !== null;
      if (!poseLocked) {
        motion.pointerX = pointer.x;
        motion.pointerY = pointer.y;
        motion.pointerActive = true;
        hoverRef.current = withinBookRegion({
          ...point,
          halfWidth: frame.halfWidth + GRAB_PAD,
          halfHeight: frame.halfHeight + GRAB_PAD,
        });
        motion.poseTarget = desiredPose();
      }
    },
    [desiredPose, motion, pointerFrame, state.riffle],
  );

  // The scene reports exact transform alignment every frame. The DOM only
  // replaces the canvas once rotation, scale, and center are all subpixel.
  useEffect(() => {
    motion.onPose = (_pose: number, handoff: number) => {
      const el = overlayRef.current;
      if (!el) return;
      if (igniteActive) {
        if (
          !igniteReadyRef.current &&
          !busy &&
          handoff > 0.985
        ) {
          igniteReadyRef.current = true;
          setIgniteReady(true);
        }
        if (igniteReadyRef.current) {
          el.style.opacity = "0";
          el.style.visibility = "hidden";
          el.style.pointerEvents = "none";
          return;
        }
      }
      el.style.opacity = String(handoff);
      el.style.visibility = handoff < 0.02 ? "hidden" : "visible";
      el.style.pointerEvents = handoff > 0.98 ? "auto" : "none";
    };
    return () => {
      motion.onPose = null;
    };
  }, [busy, igniteActive, motion]);

  // Deliberate absolute jumps (TOC, Home/End) keep their latest destination.
  const goAbsolute = useCallback(
    (to: number) => {
      if (igniteActive) return;
      if (!texturesReady) return;
      const clamped = Math.min(Math.max(to, 0), TOTAL - 1);
      if (busy) pendingTarget.current = clamped;
      else {
        pendingTarget.current = null;
        if (clamped !== currentSpread && !launchTurn(clamped)) {
          pendingTarget.current = clamped;
        }
      }
    },
    [busy, currentSpread, igniteActive, launchTurn, texturesReady],
  );

  // Held arrows advance one page at a time. Button activations use the finite
  // queue below so each deliberate tap survives an in-flight animation.
  const goAdjacent = useCallback(
    (offset: ArrowDirection) => {
      if (
        igniteActive ||
        !texturesReady ||
        busy ||
        launchingTurn.current ||
        pendingTarget.current !== null ||
        tapQueue.current.length > 0
      ) {
        return false;
      }
      const to = Math.min(Math.max(currentSpread + offset, 0), TOTAL - 1);
      return to !== currentSpread && launchTurn(to);
    },
    [busy, currentSpread, igniteActive, launchTurn, texturesReady],
  );

  const enqueueAdjacent = useCallback(
    (offset: ArrowDirection) => {
      if (igniteActive) return;
      if (!texturesReady) return;
      const to = Math.min(Math.max(currentSpread + offset, 0), TOTAL - 1);
      if (
        !busy &&
        !launchingTurn.current &&
        pendingTarget.current === null &&
        tapQueue.current.length === 0 &&
        to === currentSpread
      ) {
        return;
      }
      tapQueue.current.push(offset);
      wakeTapDrain();
    },
    [busy, currentSpread, igniteActive, texturesReady],
  );

  const onRiffleComplete = useCallback(() => {
    dispatch({ type: "RIFFLE_COMPLETE" });
  }, []);

  // Keyboard. Native repeats only tell us that a key is still physically
  // held; page settlement supplies the cadence so repeats cannot skip pages.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!texturesReady) return;
      if (e.defaultPrevented) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target instanceof Element ? e.target : null;
      if (
        t?.closest(
          "button, a, input, textarea, select, [contenteditable='true'], [role='toolbar']",
        )
      ) {
        return;
      }
      if (igniteActive) {
        if (
          ["ArrowRight", "ArrowLeft", "Home", "End", "g"].includes(e.key)
        ) {
          e.preventDefault();
        }
        if (e.key === "Escape") setTocOpen(false);
        return;
      }
      const arrowDirection: ArrowDirection | null =
        e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : null;
      if (arrowDirection !== null) {
        e.preventDefault();
        const key = arrowDirection === 1 ? "right" : "left";
        if (e.repeat || heldArrowKeys.current[key]) return;
        heldArrowKeys.current[key] = true;
        heldArrowKeys.current.active = arrowDirection;
        setHeldDirection(arrowDirection);
        goAdjacent(arrowDirection);
        return;
      }
      if ((e.key === "Home" || e.key === "End") && e.repeat) {
        e.preventDefault();
        return;
      }
      if (e.key === "Home") goAbsolute(0);
      else if (e.key === "End") goAbsolute(TOTAL - 1);
      else if (e.key === "g") setShowGrid((v) => !v);
      else if (e.key === "Escape") setTocOpen(false);
      else return;
      e.preventDefault();
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const released: ArrowDirection | null =
        e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : null;
      if (released === null) return;
      const key = released === 1 ? "right" : "left";
      heldArrowKeys.current[key] = false;
      if (heldArrowKeys.current.active !== released) return;
      const fallback =
        released === 1 && heldArrowKeys.current.left
          ? -1
          : released === -1 && heldArrowKeys.current.right
            ? 1
            : null;
      heldArrowKeys.current.active = fallback;
      setHeldDirection(fallback);
    };

    const clearHeldArrows = () => {
      heldArrowKeys.current = { left: false, right: false, active: null };
      setHeldDirection(null);
    };
    const onVisibilityChange = () => {
      if (document.hidden) clearHeldArrows();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", clearHeldArrows);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", clearHeldArrows);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [goAbsolute, goAdjacent, igniteActive, texturesReady]);

  // Every completed button activation is one relative turn intent. Drain at
  // most one valid entry per resting boundary so rapid taps remain distinct,
  // ordered page flips instead of collapsing into a jump. Impossible entries
  // at a physical boundary are discarded without blocking later input.
  useEffect(() => {
    if (igniteActive) return;
    if (busy || launchingTurn.current || pendingTarget.current !== null) return;
    while (tapQueue.current.length > 0) {
      const offset = tapQueue.current[0]!;
      const to = Math.min(Math.max(currentSpread + offset, 0), TOTAL - 1);
      if (to === currentSpread) {
        tapQueue.current.shift();
        continue;
      }
      if (launchTurn(to)) tapQueue.current.shift();
      return;
    }
  }, [busy, currentSpread, igniteActive, launchTurn, tapRevision]);

  // A held arrow advances once at each resting boundary. Deliberate absolute
  // navigation and finite button taps win first, and the synchronous launch
  // latch prevents the route effect from publishing an intermediate spread.
  useEffect(() => {
    if (igniteActive) return;
    const direction = heldArrowKeys.current.active;
    if (
      busy ||
      direction === null ||
      pendingTarget.current !== null ||
      tapQueue.current.length > 0 ||
      launchingTurn.current
    ) {
      return;
    }
    goAdjacent(direction);
  }, [busy, goAdjacent, heldDirection, igniteActive, tapRevision]);

  useEffect(() => {
    if (
      !busy &&
      !launchingTurn.current &&
      pendingTarget.current === null &&
      tapQueue.current.length === 0
    ) {
      reportedSpread.current = state.current;
      onSpreadSettled?.(state.current);
    }
  }, [busy, onSpreadSettled, state]);

  const onIgnition = useCallback(() => {
    setIgniteStarted(true);
  }, []);
  const onIgniteProgress = useCallback((progress: number) => {
    setIgniteProgress(progress);
  }, []);
  const onIgniteComplete = useCallback(() => {
    setIgniteProgress(1);
    setIgniteComplete(true);
  }, []);
  const resetIgnite = useCallback(() => {
    ignitePointer.inside = false;
    ignitePointer.pressed = false;
    setIgniteStarted(false);
    setIgniteComplete(false);
    setIgniteProgress(0);
    bumpIgniteRevision();
  }, [ignitePointer]);

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
      className={`bstage${igniteActive ? " bstage--ignite" : ""}${igniteReady ? " bstage--ignite-ready" : ""}`}
      ref={stageRef}
      data-experience={experienceMode}
      // Native image dragging wins before the surface gesture reaches its
      // horizontal threshold. Keep drag ownership with the page-turn engine.
      onDragStart={(event) => event.preventDefault()}
      onPointerDown={onSurfaceDown}
      onPointerMove={onPointerMove}
      aria-busy={!texturesReady || busy}
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
            <BookScene
              motion={motion}
              riffle={state.riffle}
              pw={pw}
              ph={ph}
              onRiffleComplete={onRiffleComplete}
              ignite={
                igniteActive && igniteReady
                  ? {
                      active: true,
                      revision: igniteRevision,
                      pointer: ignitePointer,
                      reducedMotion: prefersReducedMotion,
                      onIgnition,
                      onProgress: onIgniteProgress,
                      onComplete: onIgniteComplete,
                    }
                  : undefined
              }
            />
          </Suspense>
        </Canvas>
      ) : null}

      {igniteActive ? (
        <aside
          className={`ignite-hud${igniteStarted ? " is-burning" : ""}${igniteComplete ? " is-complete" : ""}`}
        >
          <span className="ignite-hud__eyebrow mono-label">Ignite / armed</span>
          <p className="ignite-hud__message" role="status" aria-live="polite">
            {!igniteReady
              ? "Flattening the paper…"
              : igniteComplete
                ? "Only ash remains."
                : igniteStarted
                  ? igniteProgress < 0.01
                    ? "The paper has caught. The flame is spreading."
                    : `${Math.max(1, Math.round(igniteProgress * 100))}% consumed`
                  : "Move the flame across the paper. Hold to burn deeper."}
          </p>
          <span className="ignite-hud__track" aria-hidden="true">
            <span style={{ transform: `scaleX(${igniteProgress})` }} />
          </span>
          {igniteComplete ? (
            <button
              type="button"
              className="ignite-hud__reset mono-label"
              onClick={resetIgnite}
            >
              restore issue
            </button>
          ) : null}
        </aside>
      ) : null}

      <div
        ref={overlayRef}
        className="bstage__spread"
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

      {/* Fore-edge drag zones sit over everything at the page edges: the one
          place a press grabs the sheet instantly, no pull threshold. */}
      <div
        className="bstage__edge bstage__edge--back"
        style={{ left: `calc(50% + ${shift}px - ${pw}px - ${GRAB_PAD}px)` }}
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
          onClick={() => enqueueAdjacent(-1)}
          disabled={!texturesReady || igniteActive}
          aria-disabled={!busy && currentSpread === 0}
          aria-label="Previous spread"
        >
          ←
        </button>
        <button
          className="bstage__folio mono-label"
          aria-expanded={tocOpen}
          aria-label="Contents"
          disabled={igniteActive}
          onClick={() => setTocOpen((v) => !v)}
        >
          {folioLine}
        </button>
        <button
          className="bstage__arrow mono-label"
          onClick={() => enqueueAdjacent(1)}
          disabled={!texturesReady || igniteActive}
          aria-disabled={!busy && currentSpread === TOTAL - 1}
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
                    goAbsolute(i);
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
