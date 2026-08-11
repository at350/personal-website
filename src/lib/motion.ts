import gsap from "gsap";
import { SplitText } from "gsap/SplitText";

gsap.registerPlugin(SplitText);

export const motionOK = (): boolean =>
  typeof window !== "undefined" &&
  !window.matchMedia("(prefers-reduced-motion: reduce)").matches &&
  !document.hidden;

export const EASE_SETTLE = "power4.out";

/** The signature motif: elements settle like sheets laid on a desk. */
export function settleIn(targets: gsap.TweenTarget, delay = 0) {
  if (!motionOK()) return null;
  return gsap.from(targets, {
    y: 14,
    rotate: 0.4,
    opacity: 0,
    duration: 0.85,
    ease: EASE_SETTLE,
    stagger: 0.07,
    delay,
    clearProps: "all",
  });
}

/** Masked line-rise for display type. Returns a cleanup function. */
export function riseLines(el: Element, delay = 0): (() => void) | null {
  if (!motionOK()) return null;
  const split = SplitText.create(el, { type: "lines", mask: "lines", autoSplit: true });
  const tween = gsap.from(split.lines, {
    yPercent: 110,
    duration: 0.9,
    ease: EASE_SETTLE,
    stagger: 0.09,
    delay,
  });
  return () => {
    tween.kill();
    split.revert();
  };
}
