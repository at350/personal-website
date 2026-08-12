import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { motion, useReducedMotion } from "motion/react";
import "@/styles/experience-dock.css";

export type ExperienceMode = "read" | "ignite" | "drift" | "focus" | "shuffle";

interface ExperienceDockProps {
  defaultMode?: ExperienceMode;
  onModeChange?: (mode: ExperienceMode) => void;
}

interface IconProps {
  className?: string;
}

interface ModeDefinition {
  id: ExperienceMode;
  label: string;
  detail: string;
  Icon: (props: IconProps) => React.ReactNode;
}

const ITEM_SIZE = 44;
const ITEM_GAP = 7;
const DOCK_PADDING = 7;
const CLOSED_HEIGHT = ITEM_SIZE + DOCK_PADDING * 2;
const OPEN_DELAY_MS = 70;
const CLOSE_DELAY_MS = 170;

const OPEN_TRANSITION = {
  type: "tween" as const,
  duration: 0.52,
  ease: [0.34, 1.56, 0.64, 1] as const,
};

const CLOSE_TWEEN = {
  duration: 0.25,
  ease: [0.22, 1, 0.36, 1] as const,
};

const VIEWPORT_MARGIN = 12;

function viewportHeight() {
  return typeof window === "undefined" ? 800 : window.innerHeight;
}

function ReadIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4.75 5.25c2.65-.42 4.88.18 6.75 1.8v11.7c-1.87-1.62-4.1-2.22-6.75-1.8V5.25Z" />
      <path d="M19.25 5.25c-2.65-.42-4.88.18-6.75 1.8v11.7c1.87-1.62 4.1-2.22 6.75-1.8V5.25Z" />
    </svg>
  );
}

function FlameIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M13.25 3.5c.5 3.15-1.04 4.64-2.36 6.02-1.1 1.16-2.07 2.18-1.63 4.02.3 1.25 1.28 2.18 2.58 2.46-.53-1.54.13-2.8 1.24-4.05.34 1.7 1.86 2.62 2.1 4.42.15 1.08-.2 2.1-.94 2.88 3.16-.96 5.01-3.58 4.48-6.53-.54-3.01-2.87-5.8-5.47-9.22Z" />
      <path d="M9.03 8.17C6.76 10.3 5.4 12.6 5.74 15.25c.4 3.13 2.76 5.25 6.05 5.25" />
    </svg>
  );
}

function DriftIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 8.25h9.25c1.55 0 2.5-.74 2.5-1.85 0-1.03-.8-1.75-1.82-1.75-.83 0-1.45.4-1.82 1.08" />
      <path d="M4.5 12h13.25c1.25 0 2.25.82 2.25 2s-1 2-2.25 2c-.88 0-1.58-.36-2.03-1.05" />
      <path d="M5 15.75h6.25" />
    </svg>
  );
}

function FocusIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 4.75H5.75a1 1 0 0 0-1 1V8M16 4.75h2.25a1 1 0 0 1 1 1V8M19.25 16v2.25a1 1 0 0 1-1 1H16M8 19.25H5.75a1 1 0 0 1-1-1V16" />
      <circle cx="12" cy="12" r="3.1" />
    </svg>
  );
}

function ShuffleIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4.5 7h2.1c4.85 0 5.32 10 10.35 10h2.55" />
      <path d="m17.25 14.75 2.25 2.25-2.25 2.25" />
      <path d="M4.5 17h2.1c1.88 0 3.1-1.5 4.16-3.36M13.32 8.9c.96-1.12 2.08-1.9 3.63-1.9h2.55" />
      <path d="m17.25 4.75 2.25 2.25-2.25 2.25" />
    </svg>
  );
}

const EXPERIENCE_MODES: readonly ModeDefinition[] = [
  { id: "read", label: "Read", detail: "Regular experience", Icon: ReadIcon },
  { id: "ignite", label: "Ignite", detail: "Flame playground", Icon: FlameIcon },
  { id: "drift", label: "Drift", detail: "Weightless mode", Icon: DriftIcon },
  { id: "focus", label: "Focus", detail: "Spotlight mode", Icon: FocusIcon },
  { id: "shuffle", label: "Shuffle", detail: "Remix the issue", Icon: ShuffleIcon },
];

const OPEN_HEIGHT =
  ITEM_SIZE * EXPERIENCE_MODES.length +
  ITEM_GAP * (EXPERIENCE_MODES.length - 1) +
  DOCK_PADDING * 2;

/**
 * A compact, global mode switcher. The selected mode collapses into the lone
 * orb; hovering, focusing, or tapping it reveals the remaining experiences.
 */
export function ExperienceDock({
  defaultMode = "read",
  onModeChange,
}: ExperienceDockProps) {
  const [selectedMode, setSelectedMode] = useState<ExperienceMode>(defaultMode);
  const [expanded, setExpanded] = useState(false);
  const [availableHeight, setAvailableHeight] = useState(viewportHeight);
  const dockRef = useRef<HTMLDivElement>(null);
  const buttonsRef = useRef<Array<HTMLButtonElement | null>>([]);
  const restoringFocusRef = useRef(false);
  const keyboardFocusRef = useRef(false);
  const expandedAtPointerDownRef = useRef<boolean | null>(null);
  const openTimerRef = useRef<number | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const glintFrameRef = useRef<number | null>(null);
  const pointerYRef = useRef(0);
  const reduceMotion = useReducedMotion();

  const selectedIndex = Math.max(
    0,
    EXPERIENCE_MODES.findIndex((mode) => mode.id === selectedMode),
  );
  const selectedDefinition = EXPERIENCE_MODES[selectedIndex] ?? EXPERIENCE_MODES[0];
  const selectedCenter =
    DOCK_PADDING + selectedIndex * (ITEM_SIZE + ITEM_GAP) + ITEM_SIZE / 2;
  const desiredOpenTop = availableHeight / 2 - selectedCenter;
  const maximumOpenTop = Math.max(
    VIEWPORT_MARGIN,
    availableHeight - OPEN_HEIGHT - VIEWPORT_MARGIN,
  );
  const openTop = Math.min(
    Math.max(desiredOpenTop, VIEWPORT_MARGIN),
    maximumOpenTop,
  );
  const transition = reduceMotion
    ? { duration: 0.01 }
    : expanded
      ? OPEN_TRANSITION
      : CLOSE_TWEEN;

  const cancelScheduledOpen = useCallback(() => {
    if (openTimerRef.current === null) return;
    window.clearTimeout(openTimerRef.current);
    openTimerRef.current = null;
  }, []);

  const cancelScheduledClose = useCallback(() => {
    if (closeTimerRef.current === null) return;
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }, []);

  const openDock = useCallback(() => {
    cancelScheduledOpen();
    cancelScheduledClose();
    setExpanded(true);
  }, [cancelScheduledClose, cancelScheduledOpen]);

  const closeDock = useCallback(() => {
    cancelScheduledOpen();
    cancelScheduledClose();
    setExpanded(false);
  }, [cancelScheduledClose, cancelScheduledOpen]);

  const scheduleOpen = useCallback(() => {
    cancelScheduledOpen();
    cancelScheduledClose();
    openTimerRef.current = window.setTimeout(() => {
      setExpanded(true);
      openTimerRef.current = null;
    }, OPEN_DELAY_MS);
  }, [cancelScheduledClose, cancelScheduledOpen]);

  const scheduleClose = useCallback(() => {
    cancelScheduledOpen();
    cancelScheduledClose();
    closeTimerRef.current = window.setTimeout(() => {
      if (
        keyboardFocusRef.current &&
        dockRef.current?.contains(document.activeElement)
      ) {
        closeTimerRef.current = null;
        return;
      }
      setExpanded(false);
      closeTimerRef.current = null;
    }, CLOSE_DELAY_MS);
  }, [cancelScheduledClose, cancelScheduledOpen]);

  useEffect(
    () => () => {
      cancelScheduledOpen();
      cancelScheduledClose();
      if (glintFrameRef.current !== null) {
        window.cancelAnimationFrame(glintFrameRef.current);
      }
    },
    [cancelScheduledClose, cancelScheduledOpen],
  );

  useEffect(() => {
    const onResize = () => setAvailableHeight(viewportHeight());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!expanded) return;

    const onDocumentPointerDown = (event: globalThis.PointerEvent) => {
      if (dockRef.current?.contains(event.target as Node)) return;

      keyboardFocusRef.current = false;
      restoringFocusRef.current = true;
      buttonsRef.current[selectedIndex]?.focus({ preventScroll: true });
      restoringFocusRef.current = false;
      closeDock();
    };

    document.addEventListener("pointerdown", onDocumentPointerDown, true);
    return () => document.removeEventListener("pointerdown", onDocumentPointerDown, true);
  }, [closeDock, expanded, selectedIndex]);

  const selectMode = useCallback(
    (mode: ExperienceMode) => {
      const expandedAtPointerDown = expandedAtPointerDownRef.current;
      expandedAtPointerDownRef.current = null;

      if (
        mode === selectedMode &&
        (!expanded || expandedAtPointerDown === false)
      ) {
        openDock();
        return;
      }

      setSelectedMode(mode);
      onModeChange?.(mode);
      closeDock();
    },
    [closeDock, expanded, onModeChange, openDock, selectedMode],
  );
  const onPointerEnter = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (event.pointerType !== "touch") scheduleOpen();
    },
    [scheduleOpen],
  );

  const onPointerLeave = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (event.pointerType !== "touch") scheduleClose();
    },
    [scheduleClose],
  );

  const onPointerMove = useCallback((event: PointerEvent<HTMLElement>) => {
    pointerYRef.current = event.clientY;
    if (glintFrameRef.current !== null) return;

    glintFrameRef.current = window.requestAnimationFrame(() => {
      glintFrameRef.current = null;
      const element = dockRef.current;
      if (!element) return;
      const bounds = element.getBoundingClientRect();
      const y = ((pointerYRef.current - bounds.top) / bounds.height) * 100;
      element.style.setProperty(
        "--dock-glint-y",
        `${Math.min(92, Math.max(8, y))}%`,
      );
    });
  }, []);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      keyboardFocusRef.current = true;

      if (event.key === "Escape") {
        closeDock();
        restoringFocusRef.current = true;
        buttonsRef.current[selectedIndex]?.focus();
        restoringFocusRef.current = false;
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;

      openDock();
      const focusedIndex = buttonsRef.current.findIndex(
        (button) => button === document.activeElement,
      );
      const currentIndex = focusedIndex >= 0 ? focusedIndex : selectedIndex;
      let nextIndex = currentIndex;

      if (event.key === "ArrowDown") {
        nextIndex = (currentIndex + 1) % EXPERIENCE_MODES.length;
      } else if (event.key === "ArrowUp") {
        nextIndex =
          (currentIndex - 1 + EXPERIENCE_MODES.length) % EXPERIENCE_MODES.length;
      } else if (event.key === "Home") {
        nextIndex = 0;
      } else if (event.key === "End") {
        nextIndex = EXPERIENCE_MODES.length - 1;
      }

      buttonsRef.current[nextIndex]?.focus();
      event.preventDefault();
      event.stopPropagation();
    },
    [closeDock, openDock, selectedIndex],
  );

  return (
    <motion.div
      ref={dockRef}
      className="experience-dock"
      role="toolbar"
      aria-label="Experience modes"
      aria-orientation="vertical"
      data-expanded={expanded}
      initial={false}
      animate={{
        height: expanded ? OPEN_HEIGHT : CLOSED_HEIGHT,
        y: expanded ? openTop - availableHeight / 2 : -CLOSED_HEIGHT / 2,
      }}
      transition={transition}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onPointerMove={onPointerMove}
      onFocusCapture={() => {
        if (restoringFocusRef.current) return;
        if (expandedAtPointerDownRef.current === null) {
          keyboardFocusRef.current = true;
        }
        openDock();
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          keyboardFocusRef.current = false;
          scheduleClose();
        }
      }}
      onKeyDown={onKeyDown}
    >
      <div className="experience-dock__surface" aria-hidden="true" />

      <motion.span
        className="experience-dock__selection"
        aria-hidden="true"
        initial={false}
        animate={{
          y: expanded
            ? DOCK_PADDING + selectedIndex * (ITEM_SIZE + ITEM_GAP) + 4
            : DOCK_PADDING + 4,
          scale: expanded ? 1 : 1.04,
        }}
        transition={transition}
      />

      {EXPERIENCE_MODES.map(({ id, label, detail, Icon }, index) => {
        const selected = id === selectedMode;
        const openY = DOCK_PADDING + index * (ITEM_SIZE + ITEM_GAP);

        return (
          <motion.button
            key={id}
            ref={(node) => {
              buttonsRef.current[index] = node;
            }}
            type="button"
            className="experience-dock__mode"
            aria-label={`${label}: ${detail}${selected ? ", selected" : ""}`}
            aria-pressed={selected}
            aria-expanded={selected ? expanded : undefined}
            aria-hidden={!expanded && !selected}
            tabIndex={expanded ? (selected ? 0 : -1) : selected ? 0 : -1}
            initial={false}
            animate={{
              y: expanded ? openY : DOCK_PADDING,
              opacity: expanded || selected ? 1 : 0,
              scale: expanded || selected ? 1 : 0.44,
            }}
            whileTap={reduceMotion ? undefined : { scale: 0.88 }}
            transition={
              reduceMotion
                ? { duration: 0.01 }
                : expanded
                  ? {
                      ...OPEN_TRANSITION,
                      delay: Math.abs(index - selectedIndex) * 0.03,
                    }
                  : CLOSE_TWEEN
            }
            style={{
              pointerEvents: expanded || selected ? "auto" : "none",
              zIndex: selected ? 2 : 1,
            }}
            onPointerDown={() => {
              keyboardFocusRef.current = false;
              expandedAtPointerDownRef.current = expanded;
            }}
            onClick={() => selectMode(id)}
          >
            <motion.span
              className="experience-dock__icon-wrap"
              initial={false}
              animate={{
                opacity: expanded || selected ? 1 : 0,
                filter: expanded || selected ? "blur(0px)" : "blur(3px)",
                scale: expanded || selected ? 1 : 0.72,
              }}
              transition={
                reduceMotion
                  ? { duration: 0.01 }
                  : {
                      duration: expanded ? 0.18 : 0.1,
                      delay:
                        expanded && !selected
                          ? 0.12 + Math.abs(index - selectedIndex) * 0.03
                          : 0,
                    }
              }
            >
              <Icon className="experience-dock__icon" />
            </motion.span>
            <span className="experience-dock__label" aria-hidden="true">
              <span>{label}</span>
              <small>{detail}</small>
            </span>
          </motion.button>
        );
      })}

      <span className="visually-hidden" role="status" aria-live="polite">
        {selectedDefinition?.label} mode selected
      </span>
    </motion.div>
  );
}
