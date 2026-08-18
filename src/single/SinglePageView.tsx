/* The issue on a phone: one printed face at a time, turned by thumb.

   The same pure reducer that drives the WebGL book drives this, at total = 20
   faces instead of 11 spreads — `engine.ts` indexes a 1-D sequence with sheets
   between adjacent entries and never assumes two pages per entry. What the
   book answers with Verlet cloth and a texture handoff, this answers with one
   rotated element and a spring, because there is only ever one renderer here. */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
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

interface SinglePageViewProps {
  targetSpread: number;
  onSpreadSettled?: (spread: number) => void;
  canOpenBook?: boolean;
  onOpenBook?: () => void;
  onOpenReader?: () => void;
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
  const { current, sheet, riffle, settleTarget, dragging } = state;
  const reducedMotion = usePrefersReducedMotion();
  const [contentsOpen, setContentsOpen] = useState(false);

  const paperRef = useRef<HTMLDivElement>(null);
  const leafRef = useRef<HTMLDivElement>(null);
  /* Progress is written straight to the element during a drag and a settle.
     Routing it through React would re-render ten live faces per frame. */
  const progressRef = useRef(0);
  /* Progress-units per second, converted from the pointer's px/ms at release
     so the settle continues the throw rather than restarting from rest. */
  const flungVelocityRef = useRef(0);

  const paint = useCallback((progress: number) => {
    progressRef.current = progress;
    leafRef.current?.style.setProperty("--flip", String(progress));
  }, []);

  const face = FACES[current];
  const leafFace = sheet;
  const underFace = sheet === null ? current : sheet + 1;

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
     crossfades rather than flicking twenty leaves past the reader. */
  useEffect(() => {
    if (riffle === null) return;
    const timer = window.setTimeout(
      () => dispatch({ type: "RIFFLE_COMPLETE" }),
      reducedMotion ? 0 : 260,
    );
    return () => window.clearTimeout(timer);
  }, [riffle, reducedMotion]);

  /* Paper at rest lies flat. Re-assert it after every landing, including the
     ones that arrive by riffle rather than by spring. */
  useLayoutEffect(() => {
    if (sheet === null) paint(0);
  }, [sheet, current, paint]);

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

  const onPointerDown = useCallback(
    (event: ReactPointerEvent) => {
      if (event.button !== 0 || sheet !== null || riffle !== null) return;
      gesture.current = {
        id: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        engaged: false,
        startProgress: 0,
        samples: [{ x: event.clientX, t: event.timeStamp }],
      };
    },
    [sheet, riffle],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent) => {
      const drag = gesture.current;
      if (!drag || drag.id !== event.pointerId) return;
      drag.samples.push({ x: event.clientX, t: event.timeStamp });
      if (drag.samples.length > 8) drag.samples.shift();

      if (!drag.engaged) {
        const dx = event.clientX - drag.startX;
        const dy = event.clientY - drag.startY;
        if (!shouldEngage(dx, dy)) return;
        const edge = edgeForDelta(dx);
        // A back-edge pull starts from a sheet already lying flipped left.
        drag.startProgress = edge === "fore" ? 0 : 1;
        drag.startX = event.clientX;
        drag.engaged = true;
        swallowClick.current = true;
        paperRef.current?.setPointerCapture(event.pointerId);
        dispatch({ type: "DRAG_START", edge });
        paint(drag.startProgress);
        return;
      }

      const width = paperRef.current?.clientWidth ?? 1;
      paint(dragProgress(drag.startProgress, drag.startX, event.clientX, width));
    },
    [paint],
  );

  const endGesture = useCallback(
    (event: ReactPointerEvent) => {
      const drag = gesture.current;
      if (!drag || drag.id !== event.pointerId) return;
      gesture.current = null;
      if (!drag.engaged) return;
      paperRef.current?.releasePointerCapture?.(event.pointerId);
      const velocity = flickVelocity(drag.samples);
      const span = Math.max(1, (paperRef.current?.clientWidth ?? 1) * DRAG_SPAN);
      // px/ms → progress/s: over the span that is a whole turn, times 1000.
      flungVelocityRef.current = (velocity / span) * 1000;
      dispatch({ type: "DRAG_MOVE", progress: progressRef.current });
      dispatch({ type: "DRAG_END", velocity });
    },
    [],
  );

  /* A drag that began on a link must not also follow it. */
  const onClickCapture = useCallback((event: ReactMouseEvent) => {
    if (!swallowClick.current) return;
    swallowClick.current = false;
    event.preventDefault();
    event.stopPropagation();
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

  /* Neighbours stay mounted but hidden so their images are already decoded
     when the leaf lifts. visibility, not display: a display:none image never
     starts fetching. */
  const neighbours = [current - 1, current + 1].filter(
    (index) => index >= 0 && index < TOTAL_FACES && index !== underFace,
  );

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
        onPointerMove={onPointerMove}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
        onClickCapture={onClickCapture}
      >
        <div className="single__face single__face--under">
          {FACES[underFace] ? (
            <PageFace
              spread={FACES[underFace].spread}
              side={FACES[underFace].side}
              mode="single"
            />
          ) : null}
        </div>

        {leafFace !== null && FACES[leafFace] ? (
          <div className="single__leaf" ref={leafRef}>
            <div className="single__leaf-front">
              <PageFace
                spread={FACES[leafFace]!.spread}
                side={FACES[leafFace]!.side}
                mode="single"
              />
            </div>
            <div className="single__leaf-back" aria-hidden />
          </div>
        ) : null}

        {neighbours.map((index) => (
          <div
            className="single__face single__face--ready"
            key={`${FACES[index]!.spread}:${FACES[index]!.side}`}
            aria-hidden
          >
            <PageFace
              spread={FACES[index]!.spread}
              side={FACES[index]!.side}
              mode="single"
            />
          </div>
        ))}
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
