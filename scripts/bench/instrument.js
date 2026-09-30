/* Injected before any page script. Collects paint/long-task/LCP entries,
   counts WebGL draw calls and texture uploads, timestamps the book's load
   milestones, and records rAF frame timelines on demand. */
(() => {
  if (window.__perf) return;
  const P = (window.__perf = {
    longTasks: [],
    lcp: 0,
    fcp: 0,
    cls: 0,
    marks: {},
    captureTimes: [],
    draws: 0,
    uploads: 0,
    uploadPixels: 0,
    firstDraw: 0,
    frames: null,
    frameDraws: null,
    frameUploads: null,
  });
  const obs = (type, fn) => {
    try {
      new PerformanceObserver((list) => list.getEntries().forEach(fn)).observe({
        type,
        buffered: true,
      });
    } catch {
      // An entry type this browser does not report.
    }
  };
  obs("longtask", (e) => P.longTasks.push([e.startTime, e.duration]));
  obs("largest-contentful-paint", (e) => (P.lcp = e.startTime));
  obs("paint", (e) => {
    if (e.name === "first-contentful-paint") P.fcp = e.startTime;
  });
  obs("layout-shift", (e) => {
    if (!e.hadRecentInput) P.cls += e.value;
  });

  const wrap = (proto, name, before) => {
    const orig = proto[name];
    if (typeof orig !== "function") return;
    proto[name] = function (...args) {
      before(args);
      return orig.apply(this, args);
    };
  };
  const draw = () => {
    P.draws += 1;
    if (!P.firstDraw) P.firstDraw = performance.now();
  };
  const upload = (args) => {
    P.uploads += 1;
    // texImage2D(target, level, internalformat, width, height, ...) or
    // texImage2D(target, level, internalformat, format, type, source)
    const src = args[args.length - 1];
    if (src && typeof src === "object" && "width" in src && "height" in src) {
      P.uploadPixels += (src.width || 0) * (src.height || 0);
    } else if (typeof args[3] === "number" && typeof args[4] === "number") {
      P.uploadPixels += args[3] * args[4];
    }
  };
  for (const proto of [
    window.WebGLRenderingContext?.prototype,
    window.WebGL2RenderingContext?.prototype,
  ]) {
    if (!proto) continue;
    for (const name of [
      "drawElements",
      "drawArrays",
      "drawElementsInstanced",
      "drawArraysInstanced",
      "drawRangeElements",
    ])
      wrap(proto, name, draw);
    for (const name of ["texImage2D", "texSubImage2D", "texImage3D", "texSubImage3D"])
      wrap(proto, name, upload);
  }

  let lastCount = null;
  const check = () => {
    const now = performance.now();
    const stage = document.querySelector(".bstage");
    if (stage && !P.marks.stage) P.marks.stage = now;
    const count = document.querySelector(".entry-loader__count");
    if (count) {
      const text = count.textContent;
      if (text !== lastCount) {
        lastCount = text;
        P.captureTimes.push([now, text]);
      }
    }
    if (
      !P.marks.ready &&
      stage &&
      stage.getAttribute("aria-busy") === "false" &&
      document.querySelector(".bstage__canvas")
    ) {
      P.marks.ready = now;
    }
    if (!P.marks.single && document.querySelector(".single, .single-view, [class*='single']")) {
      P.marks.single = now;
    }
  };
  const mo = new MutationObserver(check);
  const start = () =>
    mo.observe(document.documentElement, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["aria-busy"],
    });
  if (document.documentElement) start();
  else document.addEventListener("readystatechange", start, { once: true });
  P.stopObserving = () => mo.disconnect();

  P.startFrames = () => {
    P.frames = [];
    P.frameDraws = [];
    P.frameUploads = [];
    let lastDraws = P.draws;
    let lastUploads = P.uploads;
    const loop = (t) => {
      if (!P.frames) return;
      P.frames.push(t);
      P.frameDraws.push(P.draws - lastDraws);
      P.frameUploads.push(P.uploads - lastUploads);
      lastDraws = P.draws;
      lastUploads = P.uploads;
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  };
  P.stopFrames = () => {
    const out = { t: P.frames, draws: P.frameDraws, uploads: P.frameUploads };
    P.frames = null;
    return out;
  };
})();
