/* The keys: a small printed slip that lists what the book answers to.
   Arrows, Home/End, the printer's grid and the pointer gestures are all
   invisible until someone finds them; this sheet is where they are written
   down. It shares the contents menu's vocabulary — paper, an ink rule, the
   hard offset shadow — so it reads as one more piece of the stage's
   furniture rather than a modal from somewhere else. */

import { useEffect, useRef, type KeyboardEvent, type Ref } from "react";
import "@/styles/shortcut-sheet.css";

export const SHORTCUT_SHEET_ID = "bstage-keys";
const TITLE_ID = `${SHORTCUT_SHEET_ID}-title`;

/** A row either names keys (set in <kbd>) or a gesture word in plain mono;
    the desc column explains what the book does about it. */
interface ShortcutRow {
  keys?: readonly string[];
  gesture?: string;
  desc: string;
}

interface ShortcutGroup {
  title: string;
  rows: readonly ShortcutRow[];
}

const SHORTCUT_GROUPS: readonly ShortcutGroup[] = [
  {
    title: "turn",
    rows: [
      { keys: ["←", "→"], desc: "previous / next spread. hold to keep turning." },
      { keys: ["home", "end"], desc: "cover / back cover." },
      { gesture: "drag", desc: "a corner or edge turns the page with the pointer." },
    ],
  },
  {
    title: "contents",
    rows: [
      { gesture: "click", desc: "the folio (page number) in the nav." },
      { keys: ["g"], desc: "printer's grid." },
    ],
  },
  {
    title: "modes",
    rows: [
      { gesture: "dock", desc: "at the left: read, ignite, drift." },
      { keys: ["esc"], desc: "land drift, close menus." },
      { keys: ["?"], desc: "this sheet." },
    ],
  },
];

const FOCUSABLE = "button:not(:disabled), [href], [tabindex]:not([tabindex='-1'])";

interface ShortcutSheetProps {
  onClose: () => void;
  /** Lets the stage tell a press on the sheet apart from one beside it. */
  ref?: Ref<HTMLDialogElement>;
}

export function ShortcutSheet({ onClose, ref }: ShortcutSheetProps) {
  const sheetRef = useRef<HTMLDialogElement>(null);

  // Focus walks onto the slip when it opens and back to whatever held it
  // when it closes — usually the "?" button in the nav, or nothing at all
  // when the key was pressed with the page itself in focus. An opener that
  // has since been disabled or hidden (the nav folds away in ignite and
  // drift) is not a place to send focus back to; the hand-off is skipped and
  // focus settles on the document, where the next Tab starts from the top.
  useEffect(() => {
    const previous = document.activeElement;
    sheetRef.current?.focus();
    return () => {
      if (
        previous instanceof HTMLElement &&
        previous.isConnected &&
        !previous.matches(":disabled, [hidden], [aria-hidden='true'] *")
      ) {
        previous.focus();
      }
    };
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    // aria-modal promises that Tab stays inside; the sheet is small enough
    // that a hand-rolled loop is the honest way to keep that promise.
    if (event.key !== "Tab") return;
    const sheet = sheetRef.current;
    if (!sheet) return;
    const focusable = Array.from(sheet.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === sheet)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  /* A real <dialog>, left open rather than shown modally: the stage owns
     its position and its lifetime, and the browser's own top layer would
     put it above the dock, which is the one thing it must sit beneath. */
  return (
    <dialog
      id={SHORTCUT_SHEET_ID}
      className="keys"
      open
      aria-modal="true"
      aria-labelledby={TITLE_ID}
      tabIndex={-1}
      ref={(node) => {
        sheetRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      }}
      onKeyDown={onKeyDown}
      // A press on the slip is a press on the slip, not a grab at the paper
      // that may lie underneath it.
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="keys__head">
        <h2 className="keys__title mono-label" id={TITLE_ID}>
          Keys
        </h2>
        <button
          type="button"
          className="keys__close mono-label"
          onClick={onClose}
          aria-label="Close keyboard shortcuts"
        >
          close
        </button>
      </div>
      {SHORTCUT_GROUPS.map((group) => (
        <section className="keys__group" key={group.title}>
          <h3 className="keys__group-title mono-label">{group.title}</h3>
          <dl className="keys__rows">
            {group.rows.map((row) => (
              <div className="keys__row" key={row.desc}>
                <dt className="keys__term">
                  {row.keys
                    ? row.keys.map((key) => (
                        <kbd className="keys__key" key={key}>
                          {key}
                        </kbd>
                      ))
                    : <span className="keys__gesture">{row.gesture}</span>}
                </dt>
                <dd className="keys__desc">{row.desc}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </dialog>
  );
}
