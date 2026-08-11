"use client";
/* eslint-disable jsx-a11y/no-noninteractive-element-interactions */

import Image from "next/image";
import Link from "next/link";
import {
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useMemo,
  useRef,
  useState,
} from "react";
import { LazyMotion, m, useReducedMotion } from "motion/react";
import { about, dispatches, projects, resume, siteMeta } from "@/lib/content";

interface Spread {
  label: string;
  left: ReactNode;
  right: ReactNode;
}

interface TurnState {
  from: number;
  to: number;
  direction: 1 | -1;
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

export function Magazine() {
  const reduceMotion = useReducedMotion();
  const [spreadIndex, setSpreadIndex] = useState(0);
  const [turn, setTurn] = useState<TurnState | null>(null);
  const gesture = useRef<{
    x: number;
    y: number;
    pointerId: number;
    captured: boolean;
  } | null>(null);
  const bookWrap = useRef<HTMLDivElement>(null);

  const spreads = useMemo<Spread[]>(
    () => [
      {
        label: "Cover",
        left: (
          <article className="magazine-page magazine-page--inside-cover">
            <div>
              <p className="magazine-kicker">Open edition / 01</p>
              <h2>Things I have made, noticed, and kept.</h2>
            </div>
            <ol className="inside-contents">
              <li>
                <span>02</span>
                <Link href="/about">Notes from the editor</Link>
              </li>
              <li>
                <span>06</span>
                <Link href="/projects">Five working prototypes</Link>
              </li>
              <li>
                <span>12</span>
                <Link href="/resume">A resume with side notes</Link>
              </li>
              <li>
                <span>18</span>
                <Link href="/library">The media cabinet</Link>
              </li>
            </ol>
            <p className="magazine-small-copy">
              Drag a page, use the arrow keys, or tap an edge. Every department
              also has a plain URL for quiet reading.
            </p>
          </article>
        ),
        right: (
          <article className="magazine-page magazine-cover">
            <div className="magazine-cover__rail">
              <span>{siteMeta.issue.title}</span>
              <span>Issue {siteMeta.issue.number}</span>
              <span>Summer 2026</span>
            </div>
            <p className="magazine-cover__name" aria-label="Alan Tai">
              <span>Alan</span>
              <span>Tai</span>
            </p>
            <div className="magazine-cover__portrait">
              <Image
                src="/images/about/alan-headshot.webp"
                alt="Alan Tai smiling outdoors"
                fill
                priority
                sizes="(max-width: 832px) 72vw, 32vw"
              />
            </div>
            <p className="magazine-cover__line">
              Builder / researcher / former newsroom kid
            </p>
            <span className="magazine-cover__seal" aria-hidden="true">
              01
            </span>
          </article>
        ),
      },
      {
        label: "Notes from the editor",
        left: (
          <article className="magazine-page magazine-photo-page">
            <div className="magazine-photo-page__image">
              <Image
                src="/images/about/alan-hutong.webp"
                alt="Alan in a lantern-lined Beijing hutong"
                fill
                sizes="(max-width: 832px) 92vw, 45vw"
              />
            </div>
            <p className="magazine-caption">
              Beijing, somewhere between a wrong turn and the right photo.
            </p>
            <span className="magazine-folio">02</span>
          </article>
        ),
        right: (
          <article className="magazine-page magazine-editor-note">
            <p className="magazine-kicker">{about.eyebrow}</p>
            <h2>{about.heading}</h2>
            <p className="magazine-dropcap">{about.lede}</p>
            <blockquote>{about.pullQuote}</blockquote>
            <Link className="magazine-inline-link" href="/about">
              Continue reading <span aria-hidden="true">↗</span>
            </Link>
            <span className="magazine-folio">03</span>
          </article>
        ),
      },
      {
        label: "Selected projects",
        left: (
          <article className="magazine-page magazine-feature-page magazine-feature-page--red">
            <p className="magazine-kicker">Selected work / 01</p>
            <h2>{projects[0].name}</h2>
            <p className="magazine-feature-page__discipline">
              {projects[0].discipline}
            </p>
            <p>{projects[0].summary}</p>
            <div className="magazine-diagram" aria-label="Architec process diagram">
              <span>bill</span>
              <i aria-hidden="true">→</i>
              <span>model</span>
              <i aria-hidden="true">→</i>
              <span>retrofit</span>
            </div>
            <p className="magazine-small-copy">{projects[0].recognition}</p>
            <span className="magazine-folio">06</span>
          </article>
        ),
        right: (
          <article className="magazine-page magazine-project-index">
            <p className="magazine-kicker">Five working prototypes</p>
            <h2>Built to survive the demo.</h2>
            <ol>
              {projects.slice(1, 4).map((project, index) => (
                <li key={project.id}>
                  <span>0{index + 2}</span>
                  <div>
                    <h3>{project.name}</h3>
                    <p>{project.summary}</p>
                  </div>
                  <b>{project.year}</b>
                </li>
              ))}
            </ol>
            <Link className="magazine-inline-link" href="/projects">
              Open project index <span aria-hidden="true">↗</span>
            </Link>
            <span className="magazine-folio">07</span>
          </article>
        ),
      },
      {
        label: "Annotated resume",
        left: (
          <article className="magazine-page magazine-resume-page">
            <p className="magazine-kicker">{resume.eyebrow}</p>
            <h2>Now</h2>
            {resume.entries.slice(0, 3).map((entry) => (
              <div className="magazine-resume-line" key={entry.id}>
                <span>{entry.dates}</span>
                <div>
                  <h3>{entry.organization}</h3>
                  <p>{entry.role}</p>
                </div>
              </div>
            ))}
            <span className="magazine-folio">12</span>
          </article>
        ),
        right: (
          <article className="magazine-page magazine-margin-page">
            <p className="magazine-kicker">Notes that missed the PDF</p>
            <blockquote>
              “Production nights meant crashing InDesign and missing photo credits.”
            </blockquote>
            <div className="magazine-margin-page__rule" />
            <p>
              The resume is fully readable without its notes. Tap, focus, or
              hover a marked entry to open one anyway.
            </p>
            <Link className="magazine-inline-link" href="/resume">
              Read the annotated version <span aria-hidden="true">↗</span>
            </Link>
            <span className="magazine-folio">13</span>
          </article>
        ),
      },
      {
        label: "Media and dispatches",
        left: (
          <article className="magazine-page magazine-library-page">
            <p className="magazine-kicker">The media cabinet</p>
            <h2>Recently filed</h2>
            <div className="mini-mosaic">
              <div className="mini-mosaic__large">
                <span>Watch</span>
                <p>Chip design from the bottom up</p>
              </div>
              <div>
                <span>Read</span>
                <p>Services: The New Software</p>
              </div>
              <div>
                <span>Note</span>
                <p>Why Postgres keeps winning</p>
              </div>
            </div>
            <Link className="magazine-inline-link" href="/library">
              Browse the cabinet <span aria-hidden="true">↗</span>
            </Link>
            <span className="magazine-folio">18</span>
          </article>
        ),
        right: (
          <article className="magazine-page magazine-dispatch-page">
            <p className="magazine-kicker">Dispatch 001 / Site sample</p>
            <h2>{dispatches[0].title}</h2>
            <p className="magazine-dispatch-page__dek">{dispatches[0].dek}</p>
            <p>{dispatches[0].body[0]}</p>
            <Link
              className="magazine-inline-link"
              href={`/writing/${dispatches[0].id}`}
            >
              Read dispatch <span aria-hidden="true">↗</span>
            </Link>
            <span className="magazine-folio">19</span>
          </article>
        ),
      },
      {
        label: "Colophon",
        left: (
          <article className="magazine-page magazine-colophon-page">
            <p className="magazine-kicker">Colophon</p>
            <h2>Made with restraint and a suspicious amount of CSS.</h2>
            <dl>
              <div>
                <dt>Type</dt>
                <dd>Shippori Mincho / Hanken Grotesk / IBM Plex Mono</dd>
              </div>
              <div>
                <dt>Material</dt>
                <dd>React, semantic HTML, pointer events, warm pixels</dd>
              </div>
              <div>
                <dt>Quiet mode</dt>
                <dd>Reduced motion keeps every word and loses the page curl</dd>
              </div>
            </dl>
            <span className="magazine-folio">26</span>
          </article>
        ),
        right: (
          <article className="magazine-page magazine-back-cover">
            <div>
              <p className="magazine-kicker">That is the issue.</p>
              <h2>Now give me a strange problem.</h2>
              <Link href="mailto:alantai@u.northwestern.edu">
                alantai@u.northwestern.edu
              </Link>
            </div>
            <div className="magazine-back-cover__mark" aria-hidden="true">
              AT
            </div>
            <p>Connect with me, please.</p>
          </article>
        ),
      },
    ],
    [],
  );

  const goTo = (nextIndex: number) => {
    if (
      turn ||
      nextIndex < 0 ||
      nextIndex >= spreads.length ||
      nextIndex === spreadIndex
    ) {
      return;
    }

    if (reduceMotion) {
      setSpreadIndex(nextIndex);
      return;
    }

    const direction = nextIndex > spreadIndex ? 1 : -1;
    setTurn({ from: spreadIndex, to: nextIndex, direction });
    setSpreadIndex(nextIndex);
  };

  const resetDrag = () => {
    if (bookWrap.current) {
      bookWrap.current.style.transform = "";
    }
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary || turn) return;
    gesture.current = {
      x: event.clientX,
      y: event.clientY,
      pointerId: event.pointerId,
      captured: false,
    };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = gesture.current;
    if (!start || start.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    const horizontalIntent = Math.abs(deltaX) > 12 && Math.abs(deltaX) > Math.abs(deltaY);

    if (horizontalIntent && !start.captured) {
      event.currentTarget.setPointerCapture(event.pointerId);
      start.captured = true;
    }

    if (start.captured && bookWrap.current) {
      event.preventDefault();
      const nudge = clamp(deltaX * 0.08, -18, 18);
      bookWrap.current.style.transform = `translateX(${nudge}px) rotateZ(${nudge * 0.025}deg)`;
    }
  };

  const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = gesture.current;
    if (!start || start.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - start.x;
    if (start.captured && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    gesture.current = null;
    resetDrag();

    if (Math.abs(deltaX) < 64) return;
    goTo(deltaX < 0 ? spreadIndex + 1 : spreadIndex - 1);
  };

  const current = spreads[spreadIndex];
  const turnFront = turn
    ? turn.direction === 1
      ? spreads[turn.from].right
      : spreads[turn.from].left
    : null;
  const turnBack = turn
    ? turn.direction === 1
      ? spreads[turn.to].left
      : spreads[turn.to].right
    : null;

  return (
    <LazyMotion
      features={() => import("./motion-features").then((module) => module.default)}
      strict
    >
    <section className="magazine" id="cover" aria-labelledby="magazine-title">
      <div className="magazine-heading-row">
        <p id="magazine-title">Interactive edition</p>
        <p>Drag / Arrow keys / Tap edge</p>
        <p>Issue {siteMeta.issue.number}</p>
      </div>

      <div
        className="magazine-stage"
        role="group"
        aria-roledescription="interactive magazine"
        aria-label={`${current.label}. Spread ${spreadIndex + 1} of ${spreads.length}`}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight") goTo(spreadIndex + 1);
          if (event.key === "ArrowLeft") goTo(spreadIndex - 1);
          if (event.key === "Home") goTo(0);
          if (event.key === "End") goTo(spreads.length - 1);
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={(event) => {
          if (gesture.current?.pointerId === event.pointerId) {
            gesture.current = null;
            resetDrag();
          }
        }}
      >
        <m.div
          className="magazine-book-wrap"
          ref={bookWrap}
          initial={
            reduceMotion
              ? false
              : { opacity: 1, scale: 0.97, rotateX: 2, rotateZ: -0.6 }
          }
          animate={{ opacity: 1, scale: 1, rotateX: 0, rotateZ: 0 }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="magazine-book">
            <div className="magazine-book__left">{current.left}</div>
            <div className="magazine-book__right">{current.right}</div>

            {turn ? (
              <m.div
                key={`${turn.from}-${turn.to}`}
                className={`turn-sheet ${turn.direction === -1 ? "turn-sheet--reverse" : ""}`}
                initial={{ rotateY: 0 }}
                animate={{ rotateY: turn.direction === 1 ? -180 : 180 }}
                transition={{ duration: 0.86, ease: [0.64, 0, 0.26, 1] }}
                onAnimationComplete={() => setTurn(null)}
                aria-hidden="true"
              >
                <div className="turn-sheet__face turn-sheet__front">{turnFront}</div>
                <div className="turn-sheet__face turn-sheet__back">{turnBack}</div>
              </m.div>
            ) : null}

            <button
              type="button"
              className="magazine-edge magazine-edge--left"
              aria-label="Turn to the previous spread"
              disabled={spreadIndex === 0 || Boolean(turn)}
              onClick={() => goTo(spreadIndex - 1)}
            />
            <button
              type="button"
              className="magazine-edge magazine-edge--right"
              aria-label="Turn to the next spread"
              disabled={spreadIndex === spreads.length - 1 || Boolean(turn)}
              onClick={() => goTo(spreadIndex + 1)}
            />
          </div>
        </m.div>
      </div>

      <div className="magazine-controls">
        <button
          type="button"
          onClick={() => goTo(spreadIndex - 1)}
          disabled={spreadIndex === 0 || Boolean(turn)}
        >
          <span aria-hidden="true">←</span> Previous
        </button>
        <div className="magazine-progress" aria-label="Choose a spread">
          {spreads.map((spread, index) => (
            <button
              key={spread.label}
              type="button"
              className={index === spreadIndex ? "is-current" : ""}
              aria-label={`Open ${spread.label}, spread ${index + 1}`}
              aria-current={index === spreadIndex ? "page" : undefined}
              onClick={() => goTo(index)}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => goTo(spreadIndex + 1)}
          disabled={spreadIndex === spreads.length - 1 || Boolean(turn)}
        >
          Next <span aria-hidden="true">→</span>
        </button>
      </div>
      <p className="visually-hidden" aria-live="polite" aria-atomic="true">
        {current.label}. Spread {spreadIndex + 1} of {spreads.length}.
      </p>
    </section>
    </LazyMotion>
  );
}
