import { useCallback, useEffect, useRef, useState } from "react";
import type { SpreadFaceProps } from "@/magazine/spread-types";
import { about } from "@/lib/content";
import "@/styles/spreads/profile.css";

const STATEMENT = ["Systems with", "people still", "visible", "inside them"] as const;

const bleed = about.photos[1];

interface PrintSpec {
  photo: (typeof about.photos)[number];
  /** Base position inside the desk, cqw units. */
  left: number;
  top: number;
  width: number;
  tilt: number;
}

/* Three prints scattered on the lower third. The third rides up past the
   desk band — the spread's one deliberate grid break. */
const PRINTS: readonly PrintSpec[] = [
  { photo: about.photos[2], left: 4, top: 6, width: 21, tilt: -4.5 },
  { photo: about.photos[3], left: 28.5, top: 9.5, width: 18.5, tilt: 2 },
  { photo: about.photos[4], left: 61, top: -4, width: 20, tilt: -1.5 },
];

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

const resting = (x: number, y: number, tilt: number) =>
  `translate(${x}px, ${y}px) rotate(${tilt}deg)`;

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduced;
}

interface DragState {
  id: number;
  originX: number;
  originY: number;
  baseX: number;
  baseY: number;
  scale: number;
  minDx: number;
  maxDx: number;
  minDy: number;
  maxDy: number;
  lastClientX: number;
  dir: number;
  x: number;
  y: number;
}

/** A loose photographic print: pointer-draggable within the page,
 *  arrow-key nudgeable when focused. */
function Print({ spec, front }: { spec: PrintSpec; front: () => number }) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<DragState | null>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [z, setZ] = useState<number>();

  const measure = useCallback(() => {
    const el = ref.current;
    const page = el?.closest<HTMLElement>(".profile");
    if (!el || !page) return null;
    const pageRect = page.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    /* The book stage may render the page scaled; pointer deltas arrive in
       screen px and must be mapped back into element px. */
    const scale = pageRect.width / page.offsetWidth || 1;
    return { pageRect, elRect, scale };
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const m = measure();
    const el = ref.current;
    if (!m || !el) return;
    e.stopPropagation();
    e.preventDefault();
    drag.current = {
      id: e.pointerId,
      originX: e.clientX,
      originY: e.clientY,
      baseX: pos.x,
      baseY: pos.y,
      scale: m.scale,
      minDx: m.pageRect.left - m.elRect.left,
      maxDx: m.pageRect.right - m.elRect.right,
      minDy: m.pageRect.top - m.elRect.top,
      maxDy: m.pageRect.bottom - m.elRect.bottom,
      lastClientX: e.clientX,
      dir: 0,
      x: pos.x,
      y: pos.y,
    };
    el.setPointerCapture(e.pointerId);
    el.style.transition = "none";
    setZ(front());
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const el = ref.current;
    if (!d || d.id !== e.pointerId || !el) return;
    e.stopPropagation();
    if (e.clientX !== d.lastClientX) d.dir = e.clientX > d.lastClientX ? 1 : -1;
    d.lastClientX = e.clientX;
    const dx = clamp(e.clientX - d.originX, d.minDx, d.maxDx);
    const dy = clamp(e.clientY - d.originY, d.minDy, d.maxDy);
    d.x = d.baseX + dx / d.scale;
    d.y = d.baseY + dy / d.scale;
    el.style.transform = `translate(${d.x}px, ${d.y}px) rotate(${spec.tilt + d.dir * 2}deg) scale(1.03)`;
  };

  const release = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const el = ref.current;
    if (!d || d.id !== e.pointerId || !el) return;
    drag.current = null;
    el.style.transition = "";
    el.style.transform = resting(d.x, d.y, spec.tilt);
    setPos({ x: d.x, y: d.y });
    setDragging(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step: Record<string, [number, number]> = {
      ArrowLeft: [-8, 0],
      ArrowRight: [8, 0],
      ArrowUp: [0, -8],
      ArrowDown: [0, 8],
    };
    const move = step[e.key];
    if (!move) return;
    e.preventDefault();
    e.stopPropagation();
    const m = measure();
    if (!m) return;
    const dx =
      clamp(move[0] * m.scale, m.pageRect.left - m.elRect.left, m.pageRect.right - m.elRect.right) /
      m.scale;
    const dy =
      clamp(move[1] * m.scale, m.pageRect.top - m.elRect.top, m.pageRect.bottom - m.elRect.bottom) /
      m.scale;
    setZ(front());
    setPos((p) => ({ x: p.x + dx, y: p.y + dy }));
  };

  return (
    <div
      ref={ref}
      className={dragging ? "profile__print is-dragging" : "profile__print"}
      style={{
        left: `${spec.left}cqw`,
        top: `${spec.top}cqw`,
        width: `${spec.width}cqw`,
        zIndex: z,
        transform: resting(pos.x, pos.y, spec.tilt),
      }}
      role="button"
      tabIndex={0}
      aria-roledescription="draggable print"
      aria-label={spec.photo.alt}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={release}
      onPointerCancel={release}
      onKeyDown={onKeyDown}
    >
      <img src={spec.photo.src} alt="" draggable={false} loading="lazy" decoding="async" />
    </div>
  );
}

/** THE PROFILE (pages 06–07). Verso: Apfel Fett statement flush left,
 *  the four notes as a numbered ledger stepped right, loose prints on the
 *  lower third. Recto: full-bleed hutong photo, mono caption plate. */
export function Profile({ face }: SpreadFaceProps) {
  const reduced = usePrefersReducedMotion();
  const zRef = useRef(4);
  const front = useCallback(() => {
    zRef.current += 1;
    return zRef.current;
  }, []);

  if (face === "recto") {
    return (
      <div className="profile" data-face="recto">
        <img
          className="profile__bleed"
          src={bleed.src}
          alt={bleed.alt}
          loading="lazy"
          decoding="async"
        />
        <p className="profile__plate mono-label">
          <span className="profile__plate-no">07</span>
          <span>Beijing — hutong</span>
        </p>
      </div>
    );
  }

  return (
    <div className="profile" data-face="verso">
      <h2 className="profile__statement">
        {STATEMENT.map((line, i) => (
          <span key={line} className="profile__statement-line">
            {line}
            {i === STATEMENT.length - 1 && (
              <span className="profile__dot" aria-hidden>
                .
              </span>
            )}
          </span>
        ))}
      </h2>

      <ol className="profile__ledger">
        {about.notes.map((note, i) => (
          <li key={note.label} className="profile__entry">
            <span className="profile__num" aria-hidden>
              {String(i + 1).padStart(2, "0")}
            </span>
            <p className="profile__note">{note.text}</p>
          </li>
        ))}
      </ol>

      {reduced ? (
        <div className="profile__sheet">
          {PRINTS.map(({ photo }) => (
            <figure key={photo.src} className="profile__flat">
              <img src={photo.src} alt={photo.alt} loading="lazy" decoding="async" />
            </figure>
          ))}
        </div>
      ) : (
        <div className="profile__desk">
          {PRINTS.map((spec) => (
            <Print key={spec.photo.src} spec={spec} front={front} />
          ))}
        </div>
      )}
    </div>
  );
}
