/* The handoff contract (handoff.ts) covers geometry: the DOM replaces the
   canvas only when their transforms match to the subpixel. This module owns
   the content half of that contract. A freshly mounted spread arrives with
   `<img>` elements that have not fetched or decoded and entrance animations
   still mid-flight; revealing it then paints paper-white boxes and rising
   tiles over a mesh that was already showing the finished page. The overlay
   may appear only once its pixels are really there. */

/** An uncooperative asset must never hold the swap hostage. Past this the
    overlay appears anyway and the browser finishes painting in place. */
export const OVERLAY_SETTLE_TIMEOUT = 1500;

function imageSettled(image: HTMLImageElement): Promise<void> {
  // The capture farm promotes its own lazy images before rasterizing; the
  // overlay's copies need the same treatment, or the fetch may not even have
  // started while the spread waits hidden behind the canvas.
  if (image.loading === "lazy") image.loading = "eager";
  const decoded = () =>
    typeof image.decode === "function"
      ? image.decode().then(
          () => undefined,
          () => undefined,
        )
      : Promise.resolve(undefined);
  if (image.complete) return decoded();
  return new Promise<void>((resolve) => {
    const settle = (event: Event) => {
      image.removeEventListener("load", settle);
      image.removeEventListener("error", settle);
      if (event.type === "load") void decoded().then(resolve);
      else resolve();
    };
    image.addEventListener("load", settle);
    image.addEventListener("error", settle);
  });
}

/** Animations that end (entrance rises, thumb fades) are awaited; unbounded
    loops (skeleton pulses over a still-missing asset) must not wedge the
    gate. Exported for the test suite. */
export function finiteAnimations(
  animations: readonly Animation[],
): Animation[] {
  return animations.filter((animation) => {
    const end = animation.effect?.getComputedTiming().endTime;
    return typeof end === "number" && Number.isFinite(end);
  });
}

async function animationsSettled(root: HTMLElement): Promise<void> {
  if (typeof root.getAnimations !== "function") return;
  // One frame, so styles committed alongside freshly loaded images (a thumb's
  // fade starts when React marks it loaded) have started their transitions
  // and are visible to getAnimations.
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
  await Promise.all(
    finiteAnimations(root.getAnimations({ subtree: true })).map((animation) =>
      animation.finished.then(
        () => undefined,
        () => undefined,
      ),
    ),
  );
}

/** Resolves once every image under `root` is fetched and decoded and every
    finite animation has finished — or after `timeout`, whichever comes first. */
export function settleOverlay(
  root: HTMLElement | null,
  timeout = OVERLAY_SETTLE_TIMEOUT,
): Promise<void> {
  if (!root) return Promise.resolve();
  const work = Promise.all(
    Array.from(root.querySelectorAll("img"), imageSettled),
  ).then(() => animationsSettled(root));
  return new Promise<void>((resolve) => {
    const timer = window.setTimeout(resolve, timeout);
    void work.then(() => {
      window.clearTimeout(timer);
      resolve();
    });
  });
}
