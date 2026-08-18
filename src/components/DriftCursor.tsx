import { useEffect, useRef } from "react";
import {
  DRIFT_TRAIL_CAPACITY,
  DRIFT_TRAIL_SPAN,
  ageDriftTrail,
  collectDriftTrail,
  createDriftTrail,
  driftCursorGust,
  driftGustBurst,
  resetDriftTrail,
  shedDriftTrail,
} from "@/drift/cursorMotion";
import "@/styles/drift.css";

/** Room for the whorl, the widest shed parcel at the far end of the trail,
    and the edge fade — the trail span is bounded by construction (fixed
    spacing x capacity), so this containment holds at any pointer speed. */
const MAX_PUFF_RADIUS = 39;
const EDGE_FADE = 16;
const QUAD_HALF_EXTENT =
  DRIFT_TRAIL_SPAN + MAX_PUFF_RADIUS + EDGE_FADE + 35;

const VERTEX_SHADER = /* glsl */ `
  attribute vec2 aCorner;

  uniform vec2 uResolution;
  uniform vec2 uCenter;
  uniform float uDpr;
  uniform float uHalfExtent;

  varying vec2 vLocal;

  void main() {
    // Generous transparent room around the orb so the shed trail and the
    // click ring never reveal the edge of the draw quad.
    float halfExtent = uHalfExtent * uDpr;
    vec2 pixel = uCenter + aCorner * halfExtent;
    vec2 clip = pixel / uResolution * 2.0 - 1.0;

    gl_Position = vec4(clip, 0.0, 1.0);
    vLocal = aCorner * halfExtent / uDpr;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform vec2 uMotion;
  uniform float uSpeed;
  uniform float uSwirl;
  uniform float uBurstAge;
  uniform float uReducedMotion;
  uniform float uHalfExtent;
  // Shed air: xy = position local to the pointer, z = opacity envelope
  // (0 for empty slots), w = radius. The envelope curve lives in TypeScript
  // where it can be unit tested; this shader only draws what it is handed.
  uniform vec4 uPuffs[${DRIFT_TRAIL_CAPACITY}];

  varying vec2 vLocal;

  float windHash(vec2 point) {
    point = fract(point * vec2(123.34, 345.45));
    point += dot(point, point + 34.345);
    return fract(point.x * point.y);
  }

  float windNoise(vec2 point) {
    vec2 cell = floor(point);
    vec2 local = fract(point);
    local = local * local * (3.0 - 2.0 * local);
    return mix(
      mix(windHash(cell), windHash(cell + vec2(1.0, 0.0)), local.x),
      mix(windHash(cell + vec2(0.0, 1.0)), windHash(cell + vec2(1.0)), local.x),
      local.y
    );
  }

  float windFbm(vec2 point) {
    float value = 0.0;
    float weight = 0.55;
    mat2 turn = mat2(0.80, -0.60, 0.60, 0.80);
    for (int octave = 0; octave < 3; octave += 1) {
      value += weight * windNoise(point);
      point = turn * point * 2.03 + vec2(1.7, 4.1);
      weight *= 0.47;
    }
    return value / 0.97;
  }

  void main() {
    float stillness = step(0.5, uReducedMotion);
    float time = mix(uTime, 7.3, stillness);
    float speed = mix(uSpeed, 0.0, stillness);
    vec2 motion = mix(uMotion, vec2(0.0), stillness);
    float swirlPhase = mix(uSwirl, 4.2, stillness);

    // The whorl sits ON the pointer. Nothing here lags behind it: a trailing
    // mass would swing like a pendulum when the hand circles, which is the
    // one thing moving air never does.
    vec2 p = vLocal;
    float r = length(p);
    vec2 pn = r > 0.0001 ? p / r : vec2(1.0, 0.0);

    // Differential rotation: inner air turns faster than outer air, so no
    // circular structure can survive — everything shears into spiral wisps.
    // This is what keeps the glyph reading as moving air, never as rings.
    float ang = swirlPhase * (0.7 + 26.0 / (r + 12.0));
    float ca = cos(ang);
    float sa = sin(ang);
    vec2 qn = vec2(pn.x * ca - pn.y * sa, pn.x * sa + pn.y * ca);

    // Windsock envelope: a soft donut of air, stretched downwind while the
    // hand moves so the whole glyph leans into the stroke. This is the ONLY
    // motion response still attached to the pointer — a shape change, never
    // a swinging offset. Computed first so it can gate the costly noise:
    // the vast majority of this quad's fragments lie outside the whorl.
    float motionLength = length(motion);
    vec2 direction = motionLength > 0.001 ? motion / motionLength : vec2(0.0);
    float tail = motionLength > 0.001
      ? max(0.0, dot(pn, -direction)) * speed
      : 0.0;
    float rEffective = r / (1.0 + tail * 0.9);
    float donut = smoothstep(3.0, 13.0, rEffective) *
      (1.0 - smoothstep(30.0, 58.0, rEffective));

    // Filaments are BORN from noise, not drawn: ridged fbm sampled on
    // slowly growing circles in noise space gives long tangential wisps of
    // uneven length and brightness, with no seam anywhere.
    float wind = 0.0;
    float fieldA = 0.0;
    if (donut > 0.002) {
      vec2 domain = qn * (1.3 + r * 0.05) +
        vec2(swirlPhase * 0.21, -swirlPhase * 0.12);
      fieldA = windFbm(domain);
      float fieldB = windFbm(domain * 1.9 + vec2(4.7, 9.2));
      wind = smoothstep(0.5, 0.74, fieldA * 0.72 + fieldB * 0.38) * donut;
    }

    // Shed air: parcels left along the path the hand actually took, fixed
    // where they were dropped and dissolving in place. Circling the pointer
    // leaves a dissipating spiral instead of dragging a tail around after it.
    float shed = 0.0;
    for (int i = 0; i < ${DRIFT_TRAIL_CAPACITY}; i += 1) {
      vec4 puff = uPuffs[i];
      // A plain guard rather than continue/early-return keeps this inside
      // the most conservative GLSL ES 1.00 loop forms, and the squared
      // distance reject skips the costly noise for fragments this parcel
      // cannot reach — which is nearly all of them.
      if (puff.z > 0.0) {
        vec2 delta = p - puff.xy;
        float squared = dot(delta, delta);
        float radiusSquared = puff.w * puff.w;
        if (squared < radiusSquared * 4.0) {
          // Break each parcel into filaments rather than a soft blob: a low
          // floor and a finer domain make the wake read as torn air.
          float wisp = 0.22 + 0.78 * windFbm(
            delta * 0.115 + vec2(float(i) * 5.1, time * 0.35)
          );
          shed += exp(-squared / radiusSquared) * puff.z * wisp * wisp;
        }
      }
    }
    shed *= 1.0 - stillness;

    // The click gust: one expanding ring, noise-broken so it reads as a
    // pressure front rather than drawn geometry, dissolving into air well
    // before the draw region's edge could clip it. Guarded so the idle
    // sentinel age never reaches the ring math: NaN from a negative-base
    // pow would survive a step() multiplier.
    float ring = 0.0;
    if (uBurstAge >= 0.0 && stillness < 0.5) {
      float burstRadius = 30.0 + uBurstAge * 430.0;
      float ringArm = (r - burstRadius) / (7.0 + uBurstAge * 26.0);
      float front = 0.55 + 0.45 * windNoise(qn * 3.0 + vec2(time * 0.9, 2.3));
      ring = exp(-ringArm * ringArm) * exp(-uBurstAge * 3.4) * front *
        (1.0 - smoothstep(150.0, 205.0, burstRadius));
    }

    // Registration: a precise contact dot on the raw pointer, with the
    // faintest glassy lens around it.
    float contact = exp(-r * r / 6.0);
    float lens = exp(-r * r / 256.0) * 0.5;

    float wisps = clamp(wind * 0.95 + shed * 0.8 + ring * 0.7, 0.0, 1.0);
    float alpha = wisps * 0.44 + lens * 0.09 + contact * 0.4;

    // Ink wisps on the white page; the site's red rides only the brightest
    // filament tips, a fleck rather than a costume.
    vec3 pale = vec3(0.5, 0.54, 0.6);
    vec3 ink = vec3(0.24, 0.27, 0.32);
    vec3 color = mix(pale, ink, clamp(wind + shed, 0.0, 1.0));
    float tips = smoothstep(0.82, 0.95, fieldA) * donut;
    color = mix(color, vec3(0.84, 0.18, 0.12), tips * 0.4);
    color = mix(color, vec3(0.30, 0.33, 0.38), ring * 0.6);

    // The fade band sits beyond everything the shader can draw, so it only
    // ever guards against the quad edge itself, never clips live content.
    float edge = uHalfExtent - 6.0;
    float band = ${EDGE_FADE}.0;
    float quadFade = (1.0 - smoothstep(edge - band, edge, abs(vLocal.x))) *
      (1.0 - smoothstep(edge - band, edge, abs(vLocal.y)));
    alpha *= quadFade;

    if (alpha < 0.0015) discard;
    gl_FragColor = vec4(color * alpha, alpha);
  }
`;

function compileShader(
  context: WebGLRenderingContext,
  type: number,
  source: string,
) {
  const shader = context.createShader(type);
  if (!shader) throw new Error("Unable to allocate Drift cursor shader.");
  context.shaderSource(shader, source);
  context.compileShader(shader);
  if (!context.getShaderParameter(shader, context.COMPILE_STATUS)) {
    const log = context.getShaderInfoLog(shader) ?? "Unknown shader error.";
    context.deleteShader(shader);
    throw new Error(log);
  }
  return shader;
}

function createWindProgram(context: WebGLRenderingContext) {
  const vertexShader = compileShader(context, context.VERTEX_SHADER, VERTEX_SHADER);
  const fragmentShader = compileShader(context, context.FRAGMENT_SHADER, FRAGMENT_SHADER);
  const program = context.createProgram();
  if (!program) throw new Error("Unable to allocate Drift cursor program.");
  context.attachShader(program, vertexShader);
  context.attachShader(program, fragmentShader);
  context.linkProgram(program);
  context.deleteShader(vertexShader);
  context.deleteShader(fragmentShader);
  if (!context.getProgramParameter(program, context.LINK_STATUS)) {
    const log = context.getProgramInfoLog(program) ?? "Unknown program error.";
    context.deleteProgram(program);
    throw new Error(log);
  }
  return program;
}

/** A whorl of air that leans into the stroke and sheds dissolving parcels
    along the path — Drift's counterpart to the ignite flame cursor. */
export function DriftCursor() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    // Screenshot-driven QA needs the drawing buffer to survive compositing
    // and rendering to continue in a headless pane that always reports
    // document.hidden; real visitors keep the cheaper discarding swap and the
    // battery-saving hidden-tab pause.
    const qaMode = typeof window !== "undefined" &&
      /[?&]driftqa\b/.test(window.location.search);
    const context = canvas?.getContext("webgl", {
      alpha: true,
      antialias: false,
      depth: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: qaMode,
      stencil: false,
    });
    if (!canvas || !context) return;

    let program: WebGLProgram;
    try {
      program = createWindProgram(context);
    } catch (error) {
      console.warn("Drift cursor shader could not be initialized.", error);
      return;
    }

    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const corners = context.createBuffer();
    if (!corners) {
      context.deleteProgram(program);
      return;
    }

    context.bindBuffer(context.ARRAY_BUFFER, corners);
    context.bufferData(
      context.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      context.STATIC_DRAW,
    );
    context.useProgram(program);

    const cornerAttribute = context.getAttribLocation(program, "aCorner");
    const resolutionUniform = context.getUniformLocation(program, "uResolution");
    const centerUniform = context.getUniformLocation(program, "uCenter");
    const dprUniform = context.getUniformLocation(program, "uDpr");
    const halfExtentUniform = context.getUniformLocation(program, "uHalfExtent");
    const timeUniform = context.getUniformLocation(program, "uTime");
    const motionUniform = context.getUniformLocation(program, "uMotion");
    const speedUniform = context.getUniformLocation(program, "uSpeed");
    const swirlUniform = context.getUniformLocation(program, "uSwirl");
    const burstUniform = context.getUniformLocation(program, "uBurstAge");
    const reducedUniform = context.getUniformLocation(program, "uReducedMotion");
    const puffsUniform = context.getUniformLocation(program, "uPuffs[0]");
    context.enableVertexAttribArray(cornerAttribute);
    context.vertexAttribPointer(cornerAttribute, 2, context.FLOAT, false, 0, 0);
    context.enable(context.BLEND);
    context.blendEquation(context.FUNC_ADD);
    context.blendFunc(context.ONE, context.ONE_MINUS_SRC_ALPHA);

    let cursorX = -200;
    let cursorY = -200;
    let previousCursorX = cursorX;
    let previousCursorY = cursorY;
    let previousPointerTime = 0;
    let pointerVelocityX = 0;
    let pointerVelocityY = 0;
    let motionX = 0;
    let motionY = 0;
    let swirlPhase = 0;
    let burstAge = -1;
    let sessionStart = 0;
    const trail = createDriftTrail();
    const puffData = new Float32Array(DRIFT_TRAIL_CAPACITY * 4);
    let visible = false;
    let frameId = 0;
    let previousFrameTime = 0;
    let dpr = 1;

    const resize = () => {
      // Soft air needs no retina sampling; capping the ratio at 1.5 keeps
      // the full-screen pass cheap on 2x displays with no visible change in
      // the blurred wisps.
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.max(1, Math.round(window.innerWidth * dpr));
      canvas.height = Math.max(1, Math.round(window.innerHeight * dpr));
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      context.viewport(0, 0, canvas.width, canvas.height);
    };

    const render = (timeSeconds: number) => {
      context.clearColor(0, 0, 0, 0);
      context.clear(context.COLOR_BUFFER_BIT);
      if (!visible) return;

      const gust = driftCursorGust(pointerVelocityX, pointerVelocityY);
      collectDriftTrail(trail, puffData, cursorX, cursorY);

      context.useProgram(program);
      context.uniform2f(resolutionUniform, canvas.width, canvas.height);
      context.uniform2f(
        centerUniform,
        cursorX * dpr,
        (window.innerHeight - cursorY) * dpr,
      );
      context.uniform1f(dprUniform, dpr);
      context.uniform1f(halfExtentUniform, QUAD_HALF_EXTENT);
      context.uniform1f(timeUniform, timeSeconds);
      // The shader's local frame is y-up; directional uploads flip y, or the
      // windsock would lean the wrong way on vertical strokes.
      context.uniform2f(motionUniform, motionX, -motionY);
      context.uniform1f(speedUniform, gust.speed);
      context.uniform1f(swirlUniform, swirlPhase);
      context.uniform1f(burstUniform, burstAge);
      context.uniform1f(reducedUniform, reducedMotion.matches ? 1 : 0);
      context.uniform4fv(puffsUniform, puffData);
      context.drawArrays(context.TRIANGLE_STRIP, 0, 4);
    };

    const frame = (now: number) => {
      frameId = 0;
      if (document.hidden && !qaMode) return;

      const delta = Math.min(
        previousFrameTime ? (now - previousFrameTime) / 1000 : 1 / 60,
        0.05,
      );
      previousFrameTime = now;
      if (!sessionStart) sessionStart = now;
      const velocityDecay = Math.exp(-delta * 10.5);
      pointerVelocityX *= velocityDecay;
      pointerVelocityY *= velocityDecay;
      const gust = driftCursorGust(pointerVelocityX, pointerVelocityY);
      const response = 1 - Math.exp(-delta * 26);
      motionX += (gust.x - motionX) * response;
      motionY += (gust.y - motionY) * response;
      // Integrated orbit phase: speed bends the whorl's rate smoothly.
      swirlPhase += (1 + gust.speed * 1.6) * delta;
      ageDriftTrail(trail, delta);
      if (burstAge >= 0) {
        burstAge += delta;
        // Retire on the shared envelope rather than a second hard-coded
        // lifetime, so the ring's visible life is defined in one place.
        if (driftGustBurst(burstAge).strength < 0.02) burstAge = -1;
      }
      render((now - sessionStart) / 1000);

      if (!reducedMotion.matches && visible) {
        frameId = window.requestAnimationFrame(frame);
      }
    };

    const wake = () => {
      if (frameId || (document.hidden && !qaMode)) return;
      previousFrameTime = 0;
      frameId = window.requestAnimationFrame(frame);
    };

    const updatePointer = (event: PointerEvent) => {
      // An empty coalesced list still describes one real move: falling back
      // to the event keeps velocity and shedding alive rather than freezing
      // the whole wind response.
      const coalesced = event.getCoalescedEvents?.();
      const samples = coalesced && coalesced.length > 0 ? coalesced : [event];
      for (const sample of samples) {
        const eventTime = sample.timeStamp;
        const delta = (eventTime - previousPointerTime) / 1000;
        if (previousPointerTime > 0 && delta > 0.0001 && delta < 0.2) {
          const instantaneousX = (sample.clientX - previousCursorX) / delta;
          const instantaneousY = (sample.clientY - previousCursorY) / delta;
          const response = 1 - Math.exp(-delta * 64);
          pointerVelocityX += (instantaneousX - pointerVelocityX) * response;
          pointerVelocityY += (instantaneousY - pointerVelocityY) * response;
        } else if (delta >= 0.2) {
          pointerVelocityX = 0;
          pointerVelocityY = 0;
        }
        previousCursorX = sample.clientX;
        previousCursorY = sample.clientY;
        previousPointerTime = eventTime;
        // Shed along the real path, coalesced samples included: a fast flick
        // leaves the same even spacing a slow drag does.
        if (!reducedMotion.matches) {
          const sampled = driftCursorGust(pointerVelocityX, pointerVelocityY);
          shedDriftTrail(trail, sample.clientX, sample.clientY, sampled.speed);
        }
      }
      cursorX = event.clientX;
      cursorY = event.clientY;
      previousCursorX = cursorX;
      previousCursorY = cursorY;
    };

    const overChrome = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      return Boolean(
        target?.closest(".experience-dock, .drift-hud, .bstage__nav"),
      );
    };

    const onPointerMove = (event: PointerEvent) => {
      const wasVisible = visible;
      updatePointer(event);
      visible = !overChrome(event) &&
        (event.pointerType !== "touch" || event.pressure > 0);
      if (visible && !wasVisible) resetDriftTrail(trail, cursorX, cursorY);
      if (reducedMotion.matches) render(7.3);
      else wake();
    };

    const onPointerDown = (event: PointerEvent) => {
      const wasVisible = visible;
      updatePointer(event);
      visible = !overChrome(event);
      if (visible && !wasVisible) resetDriftTrail(trail, cursorX, cursorY);
      // The click-gust ring launches with the same click that shoves leaves.
      // Never under reduced motion: the frame loop that ages the ring out is
      // not running there, and a stale age would replay a phantom ring if
      // the preference were lifted mid-session.
      if (visible && event.button === 0 && !reducedMotion.matches) {
        burstAge = 0;
      }
      if (reducedMotion.matches) render(7.3);
      else wake();
    };

    const hide = () => {
      visible = false;
      pointerVelocityX = 0;
      pointerVelocityY = 0;
      motionX = 0;
      motionY = 0;
      burstAge = -1;
      resetDriftTrail(trail, cursorX, cursorY);
      trail.seeded = false;
      render(0);
    };

    const onPointerOut = (event: PointerEvent) => {
      if (event.relatedTarget === null) hide();
    };

    const onVisibilityChange = () => {
      if (document.hidden && !qaMode) {
        if (frameId) window.cancelAnimationFrame(frameId);
        frameId = 0;
      } else if (visible) {
        if (reducedMotion.matches) render(7.3);
        else wake();
      }
    };

    const syncCursorMode = () => {
      document.documentElement.classList.toggle(
        "drift-hides-cursor",
        finePointer.matches && !reducedMotion.matches,
      );
      if (reducedMotion.matches) render(7.3);
      else wake();
    };

    document.documentElement.classList.add("drift-active");
    syncCursorMode();
    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    window.addEventListener("blur", hide);
    document.addEventListener("pointerout", onPointerOut);
    document.addEventListener("visibilitychange", onVisibilityChange);
    finePointer.addEventListener("change", syncCursorMode);
    reducedMotion.addEventListener("change", syncCursorMode);
    wake();

    return () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("blur", hide);
      document.removeEventListener("pointerout", onPointerOut);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      finePointer.removeEventListener("change", syncCursorMode);
      reducedMotion.removeEventListener("change", syncCursorMode);
      context.deleteBuffer(corners);
      context.deleteProgram(program);
      document.documentElement.classList.remove(
        "drift-active",
        "drift-hides-cursor",
      );
    };
  }, []);

  return <canvas ref={canvasRef} className="drift-cursor" aria-hidden="true" />;
}
