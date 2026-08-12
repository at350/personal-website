import { useEffect, useRef } from "react";
import { Link } from "react-router";
import gsap from "gsap";
import { SplitText } from "gsap/SplitText";
import type { SpreadFaceProps } from "@/magazine/spread-types";
import { withBasePath } from "@/lib/basePath";
import { Barcode } from "@/components/furniture/Barcode";
import { motionOK } from "@/lib/motion";
import "@/styles/spreads/cover.css";

gsap.registerPlugin(SplitText);

const COVER_LINES = [
  { page: "04", text: "a letter", href: "/about" },
  { page: "08", text: "five prototypes", href: "/projects" },
  { page: "12", text: "the annotated resume", href: "/resume" },
] as const;

/* The masthead is the artwork: the name in Tanker, full measure, with the
   counter of the final A printed red — the mark the rest of the site reuses. */
export function Cover({ face, mode }: SpreadFaceProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!motionOK() || !rootRef.current) return;
    // Never animate inside the texture farm: a capture taken mid-entrance
    // rasterizes a cover with no name on it.
    if (rootRef.current.closest("[data-capture-farm]")) return;
    const lines = rootRef.current.querySelectorAll(".cover2__word");
    const split = new SplitText(lines, { type: "chars" });
    const tween = gsap.from(split.chars, {
      yPercent: 108,
      duration: 0.9,
      ease: "power4.out",
      stagger: 0.045,
      delay: 0.15,
    });
    const rule = rootRef.current.querySelector(".cover2__rule");
    const ruleTween = rule
      ? gsap.from(rule, { scaleX: 0, duration: 1.1, ease: "power4.inOut", delay: 0.5 })
      : null;
    return () => {
      tween.kill();
      ruleTween?.kill();
      split.revert();
    };
  }, []);

  if (face === "verso" && mode === "book") return null;

  return (
    <div className="cover2" ref={rootRef}>
      <header className="cover2__issue mono-label">
        <span>A PERSONAL ISSUE</span>
        <span>NO. 01 / 2026</span>
      </header>

      <h1 className="cover2__masthead">
        <span className="cover2__word-mask">
          <span className="cover2__word">ALAN</span>
        </span>
        <span className="cover2__word-mask">
          <span className="cover2__word">
            T<span className="cover2__a">A</span>I
          </span>
        </span>
      </h1>

      <figure className="cover2__art" aria-hidden>
        <img
          src={withBasePath("/images/editorial/cover-fold.webp")}
          alt=""
          decoding="async"
        />
      </figure>

      <div className="cover2__rule" aria-hidden />

      <nav className="cover2__lines" aria-label="In this issue">
        {COVER_LINES.map((line) => (
          <Link key={line.page} className="cover2__line" to={line.href}>
            <span className="cover2__line-no">{line.page}</span>
            <span className="cover2__line-text">{line.text}</span>
          </Link>
        ))}
      </nav>

      <footer className="cover2__foot">
        <span className="mono-label cover2__place">EVANSTON, ILLINOIS</span>
        <div className="cover2__barcode">
          <Barcode text="ALANTAI.01" height={26} />
        </div>
      </footer>
    </div>
  );
}

export function BackCover({ face, mode }: SpreadFaceProps) {
  if (face === "recto" && mode === "book") return null;
  return (
    <div className="back2">
      <p className="back2__mark" aria-hidden>
        T<span className="back2__a">A</span>I
      </p>
      <p className="back2__issue mono-label">NO. 01 / 2026</p>
      <div className="back2__barcode">
        <Barcode text="ALANTAI.01" height={22} />
      </div>
    </div>
  );
}
