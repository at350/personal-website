/* The issue on a phone: one printed face at a time, turned by thumb.

   The same pure reducer that drives the WebGL book drives this, at total = 20
   faces instead of 11 spreads — `engine.ts` indexes a 1-D sequence with sheets
   between adjacent entries and never assumes two pages per entry. What the
   book answers with Verlet cloth and a texture handoff, this answers with one
   rotated element and a spring, because there is only ever one renderer here.

   Every face mounts once and stays mounted; a turn only changes each sheet's
   role. Faces used to move between three positional slots (under / leaf /
   ready), and React treats a slot change as an unmount, so every turn
   replayed entrance animations and re-decoded images on the pages involved.
   Stable identity is what makes a landed page arrive settled — the same
   contract the book keeps by rasterizing its moving pages. */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import {
  FACES,
  SPREADS,
  faceForSpread,
  pageLabel,
  spreadForFace,
} from "@/magazine/folio";
import {
  initialEngineState,
  reduce,
  type EngineEvent,
  type EngineState,
} from "@/magazine/engine";
import { PageFace } from "@/magazine/PageFace";
import { usePrefersReducedMotion } from "@/magazine/useViewportMode";
import {
  DRAG_SPAN,
  dragProgress,
  edgeForDelta,
  flickVelocity,
  shouldEngage,
  type PointerSample,
} from "./dragMath";
import { springAtRest, stepSpring } from "./flipSpring";
import "@/styles/single.css";

const TOTAL_FACES = FACES.length;

type SheetRole = "under" | "leaf" | "idle";

interface SinglePageViewProps {
  targetSpread: number;
  onSpreadSettled?: (spread: number) => void;
  canOpenBook?: boolean;
  onOpenBook?: () => void;
  onOpenReader?: () => void;
}

/** The paper fades behind the folio and running head are honest only on pages
    that actually scroll: painting them over the cover's barcode or the
    colophon's closing mark washes out content that was never going anywhere.
    Track where the page's scroller stands and expose it as data attributes
    the stylesheet keys on. */
function useOverflowState(frontRef: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const front = frontRef.current;
    if (!front) return;
    const scroller = front.querySelector<HTMLElement>(
      ":scope > *:not(.running-head):not(.folio):not([data-paper-overlay])",
    );
    if (!scroller) return;

    const sync = () => {
      const above = scroller.scrollTop > 2;
      const below =
        scroller.scrollTop + scroller.clientHeight < scroller.scrollHeight - 2;
      front.dataset.overflowTop = above ? "true" : "false";
      front.dataset.overflowBottom = below ? "true" : "false";
    };
    sync();

    scroller.addEventListener("scroll", sync, { passive: true });
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(sync);
      observer.observe(front);
      observer.observe(scroller);
      // Content can grow after mount (images, the library restocking).
      if (scroller.firstElementChild) observer.observe(scroller.firstElementChild);
    }
    return () => {
      scroller.removeEventListener("scroll", sync);
      observer?.disconnect();
    };
  }, [frontRef]);
}

function Sheet({
  index,
  role,
  sheetRef,
}: {
  index: number;
  role: SheetRole;
  sheetRef: (node: HTMLDivElement | null) => void;
}) {
  const frontRef = useRef<HTMLDivElement>(null);
  useOverflowState(frontRef);
  const def = FACES[index]!;

  return (
    <div
      className="single__sheet"
      data-role={role}
      ref={sheetRef}
      aria-hidden={role !== "under" || undefined}
      inert={role === "idle" || undefined}
    >
      <div className="single__sheet-front" ref={frontRef}>
        <PageFace spread={def.spread} side={def.side} mode="single" />
        <div className="single__shade" data-paper-overlay aria-hidden />
        <div className="single__fade single__fade--top" data-paper-overlay aria-hidden />
        <div
          className="single__fade single__fade--bottom"
          data-paper-overlay
          aria-hidden
        />
      </div>
      <div className="single__sheet-back" aria-hidden />
    </div>
  );
}

export function SinglePageView({
  targetSpread,
  onSpreadSettled,
  canOpenBook = false,
  onOpenBook,
  onOpenReader,
}: SinglePageViewProps) {
  const [state, dispatch] = useReducer(
    (s: EngineState, e: EngineEvent) => reduce(s, e, TOTAL_FACES),
    faceForSpread(targetSpread),
    initialEngineState,
  );
  const { current, sheet, riffle, settleTarget, dragging, progress } = state;
  const reducedMotion = usePrefersReducedMotion();
  const [contentsOpen, setContentsOpen] = useState(false);

  const paperRef = useRef<HTMLDivElement>(null);
  /* One element per face, stable for the life of the view. */
  const sheetRefs = useRef<(HTMLDivElement | null)[]>([]);
  /* The sheet element the current turn rotates. */
  const paintTargetRef = useRef<HTMLDivElement | null>(null);
  /* Progress is written straight to the element during a drag and a settle.
     Routing it through React would re-render twenty live faces per frame. */
  const progressRef = useRef(0);
  /* Progress-units per second, converted from the pointer's px/ms at release
     so the settle continues the throw rather than restarting from rest. */
  const flungVelocityRef = useRef(0);

  const paint = useCallback((value: number) => {
    progressRef.current = value;
    paintTargetRef.current?.style.setProperty("--flip", String(value));
  }, []);

  const face = FACES[current];
  const underFace = sheet === null ? current : sheet + 1;

  /* Aim the paint at the turning sheet before the browser shows the commit —
     a backward turn's leaf must already lie flipped (--flip: 1) on its first
     visible frame, or the previous page flashes flat over the current one.
     At rest, clear every inline --flip so each sheet lies flat for its next
     role. */
  useLayoutEffect(() => {
    if (sheet === null) {
      paintTargetRef.current = null;
      progressRef.current = 0;
      for (const node of sheetRefs.current) node?.style.removeProperty("--flip");
      return;
    }
    paintTargetRef.current = sheetRefs.current[sheet] ?? null;
    paint(progress);
  }, [sheet, progress, paint]);

  /* ---- settle -------------------------------------------------------- */

  const settling = sheet !== null && !dragging && settleTarget !== null;

  useEffect(() => {
    if (!settling || settleTarget === null) return;
    if (reducedMotion) {
      paint(settleTarget);
      dispatch({ type: "TICK_COMPLETE" });
      return;
    }

    let frame = 0;
    let last = performance.now();
    let spring = {
      value: progressRef.current,
      velocity: flungVelocityRef.current,
    };
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      spring = stepSpring(spring, settleTarget, dt);
      if (springAtRest(spring, settleTarget)) {
        paint(settleTarget);
        dispatch({ type: "TICK_COMPLETE" });
        return;
      }
      paint(spring.value);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [settling, settleTarget, reducedMotion, paint]);

  /* A riffle (a jump of more than one face, from the contents or a deep link)
     lands after a beat rather than flicking twenty leaves past the reader. */
  useEffect(() => {
    if (riffle === null) return;
    const timer = window.setTimeout(
      () => dispatch({ type: "RIFFLE_COMPLETE" }),
      reducedMotion ? 0 : 260,
    );
    return () => window.clearTimeout(timer);
  }, [riffle, reducedMotion]);

  /* iOS rubber-bands the document under a position:fixed stage unless the
     root itself cannot scroll. */
  useEffect(() => {
    document.documentElement.classList.add("fn-lock-scroll");
    return () => document.documentElement.classList.remove("fn-lock-scroll");
  }, []);

  /* ---- gesture ------------------------------------------------------- */

  const gesture = useRef<{
    id: number;
    startX: number;
    startY: number;
    engaged: boolean;
    startProgress: 0 | 1;
    samples: PointerSample[];
  } | null>(null);
  const swallowClick = useRef(false);
  const detachGesture = useRef<(() => void) | null>(null);

  const stopListening = useCallback(() => {
    detachGesture.current?.();
    detachGesture.current = null;
  }, []);

  useEffect(() => () => stopListening(), [stopListening]);

  const endGesture = useCallback((event: { pointerId: number }) => {
    const drag = gesture.current;
    if (!drag || drag.id !== event.pointerId) return;
    gesture.current = null;
    stopListening();
    if (!drag.engaged) return;
    try {
      paperRef.current?.releasePointerCapture?.(event.pointerId);
    } catch {
      /* capture is a nicety; iOS Safari often never granted it */
    }
    const velocity = flickVelocity(drag.samples);
    const span = Math.max(1, (paperRef.current?.clientWidth ?? 1) * DRAG_SPAN);
    // px/ms → progress/s: over the span that is a whole turn, times 1000.
    flungVelocityRef.current = (velocity / span) * 1000;
    dispatch({ type: "DRAG_MOVE", progress: progressRef.current });
    dispatch({ type: "DRAG_END", velocity });
  }, [stopListening]);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent) => {
      if (event.button !== 0 || sheet !== null || riffle !== null) return;
      stopListening();
      gesture.current = {
        id: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        engaged: false,
        startProgress: 0,
        samples: [{ x: event.clientX, t: event.timeStamp }],
      };

      const onMove = (move: PointerEvent) => {
        const drag = gesture.current;
        if (!drag || drag.id !== move.pointerId) return;
        drag.samples.push({ x: move.clientX, t: move.timeStamp });
        if (drag.samples.length > 8) drag.samples.shift();

        if (!drag.engaged) {
          const dx = move.clientX - drag.startX;
          const dy = move.clientY - drag.startY;
          if (!shouldEngage(dx, dy)) return;
          const edge = edgeForDelta(dx);
          // A back-edge pull starts from a sheet already lying flipped left.
          drag.startProgress = edge === "fore" ? 0 : 1;
          drag.startX = move.clientX;
          drag.engaged = true;
          swallowClick.current = true;
          try {
            paperRef.current?.setPointerCapture(move.pointerId);
          } catch {
            /* window listeners keep the gesture without capture */
          }
          /* Every sheet is always mounted, so an unguarded paint would rotate
             real paper even when the engine refuses the turn at either cover.
             Only aim at a sheet the engine will actually fly. */
          const canTurn =
            edge === "fore" ? current < TOTAL_FACES - 1 : current > 0;
          paintTargetRef.current = canTurn
            ? (sheetRefs.current[edge === "fore" ? current : current - 1] ?? null)
            : null;
          dispatch({ type: "DRAG_START", edge });
          paint(drag.startProgress);
          return;
        }

        const width = paperRef.current?.clientWidth ?? 1;
        paint(dragProgress(drag.startProgress, drag.startX, move.clientX, width));
      };

      const onUp = (up: PointerEvent) => endGesture(up);
      const onTouchMove = (touch: TouchEvent) => {
        if (gesture.current?.engaged) touch.preventDefault();
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
      window.addEventListener("touchmove", onTouchMove, { passive: false });
      detachGesture.current = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        window.removeEventListener("touchmove", onTouchMove);
      };
    },
    [sheet, riffle, current, paint, endGesture, stopListening],
  );

  /* A drag that began on a link must not also follow it. */
  const onClickCapture = useCallback((event: ReactMouseEvent) => {
    if (!swallowClick.current) return;
    swallowClick.current = false;
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const onDragStart = useCallback((event: ReactDragEvent) => {
    event.preventDefault();
  }, []);

  /* ---- navigation ---------------------------------------------------- */

  const turnTo = useCallback((to: number) => {
    dispatch({ type: "TURN", to });
  }, []);

  /* An address bar change turns the page. Only an actual *change* of target
     counts: reacting to any disagreement instead would fight the reader, since
     the page lands before the parent echoes the new route back, and the stale
     target would immediately turn it home again. Two faces also share one
     route, so turning from a verso to its own recto must not yank back. */
  const appliedTarget = useRef(targetSpread);
  useEffect(() => {
    if (appliedTarget.current === targetSpread) return;
    appliedTarget.current = targetSpread;
    if (spreadForFace(current) === targetSpread) return;
    turnTo(faceForSpread(targetSpread));
  }, [targetSpread, current, turnTo]);

  const settledSpread =
    sheet === null && riffle === null ? spreadForFace(current) : null;
  useEffect(() => {
    if (settledSpread !== null) onSpreadSettled?.(settledSpread);
  }, [settledSpread, onSpreadSettled]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "Escape" && contentsOpen) {
        setContentsOpen(false);
        return;
      }
      // A key event can be dispatched at the window itself, which is not an
      // Element and has no closest().
      const target = event.target instanceof Element ? event.target : null;
      if (
        target?.closest(
          "button, a, input, textarea, select, [contenteditable='true']",
        )
      ) {
        return;
      }
      if (event.key === "ArrowRight") turnTo(current + 1);
      else if (event.key === "ArrowLeft") turnTo(current - 1);
      else if (event.key === "Home") turnTo(0);
      else if (event.key === "End") turnTo(TOTAL_FACES - 1);
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, turnTo, contentsOpen]);

  /* ---- render -------------------------------------------------------- */

  const busy = sheet !== null || riffle !== null;
  const announcement = useMemo(() => {
    const spread = spreadForFace(current);
    return `${pageLabel(spread)} · ${SPREADS[spread]?.label ?? ""}`;
  }, [current]);

  return (
    <main className="single" data-busy={busy || undefined}>
      <header className="single__chrome single__chrome--top">
        <p className="mono-label single__mast">ALAN TAI / NO. 01</p>
        <button
          type="button"
          className="mono-label single__toc-open"
          aria-expanded={contentsOpen}
          onClick={() => setContentsOpen((open) => !open)}
        >
          contents
        </button>
      </header>

      <div
        className="single__paper"
        ref={paperRef}
        onPointerDown={onPointerDown}
        onDragStart={onDragStart}
        onClickCapture={onClickCapture}
      >
        {FACES.map((def, index) => {
          const role: SheetRole =
            sheet !== null && index === sheet
              ? "leaf"
              : index === underFace
                ? "under"
                : "idle";
          return (
            <Sheet
              key={`${def.spread}:${def.side}`}
              index={index}
              role={role}
              sheetRef={(node) => {
                sheetRefs.current[index] = node;
              }}
            />
          );
        })}
      </div>

      <nav className="single__chrome single__chrome--bottom" aria-label="Pages">
        <button
          type="button"
          className="single__step"
          aria-label="Previous page"
          disabled={current === 0}
          onClick={() => turnTo(current - 1)}
        >
          ←
        </button>
        <p className="mono-label single__folio" aria-hidden>
          {face?.page === null || face?.page === undefined
            ? SPREADS[spreadForFace(current)]?.kind === "back"
              ? "END"
              : "COVER"
            : String(face.page).padStart(2, "0")}
        </p>
        <button
          type="button"
          className="single__step"
          aria-label="Next page"
          disabled={current === TOTAL_FACES - 1}
          onClick={() => turnTo(current + 1)}
        >
          →
        </button>
      </nav>

      {contentsOpen ? (
        <div className="single__toc">
          <ul>
            {SPREADS.map((def, spread) => (
              <li key={def.id}>
                <button
                  type="button"
                  className="mono-label"
                  onClick={() => {
                    turnTo(faceForSpread(spread));
                    setContentsOpen(false);
                  }}
                >
                  <span>{def.label}</span>
                  <span aria-hidden>{pageLabel(spread)}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="single__toc-modes">
            {canOpenBook ? (
              <button type="button" className="mono-label" onClick={onOpenBook}>
                open as book
              </button>
            ) : null}
            <button type="button" className="mono-label" onClick={onOpenReader}>
              read as one page
            </button>
          </div>
        </div>
      ) : null}

      <p className="visually-hidden" role="status" aria-live="polite">
        {announcement}
      </p>
    </main>
  );
}
