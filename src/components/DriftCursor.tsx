import { useEffect, useRef } from "react";
import {
  driftCursorGust,
  driftGustBurst,
  stepDriftOrbBody,
  type DriftOrbBodyState,
} from "@/drift/cursorMotion";
import "@/styles/drift.css";

const VERTEX_SHADER = /* glsl */ `
  attribute vec2 aCorner;

  uniform vec2 uResolution;
  uniform vec2 uCenter;
  uniform float uDpr;

  varying vec2 vLocal;

  void main() {
    // Generous transparent room around the orb so gust streaks and the click
    // ring never reveal the edge of the draw quad.
    float halfExtent = 190.0 * uDpr;
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
  uniform vec2 uBodyOffset;

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

    // The swirl orbits an inertial air parcel that trails the hand; the tiny
    // contact dot below stays registered to the exact pointer pixel.
    vec2 p = vLocal - uBodyOffset;
    float r = length(p);
    // atan(0,0) is spec-undefined; the exact center belongs to the lens.
    float theta = r > 0.0001 ? atan(p.y, p.x) : 0.0;
    // Noise sampled on the unit circle, not raw angle: no seam at the wrap.
    vec2 rim = vec2(cos(theta), sin(theta));

    float breathe = 1.0 + 0.05 * sin(time * 1.7);

    // Three streamline arcs orbit at different radii and rates: a radial
    // gaussian band times an angular comet — bright head, long dissolving
    // tail — is the whole calligraphy of the wind glyph.
    float wind = 0.0;
    float head = 0.0;
    for (int k = 0; k < 3; k += 1) {
      float fk = float(k);
      float baseRadius = (15.0 + fk * 12.5) * breathe;
      float wobble = (windFbm(rim * 2.2 + vec2(fk * 7.3, time * 0.6)) - 0.5) * 7.0;
      // Squared by hand: pow() is undefined for negative bases in ES 1.00.
      float bandArm = (r - baseRadius - wobble) / (5.2 - fk * 0.5);
      float band = exp(-bandArm * bandArm);
      // uSwirl is the CPU-integrated orbit phase (speed folded in per frame),
      // so a speed change bends the orbit rate instead of teleporting the
      // comets — frequency modulation must integrate, not multiply raw time.
      float phase = theta - uSwirl * (1.15 - fk * 0.22) - fk * 2.4;
      float lap = fract(phase * 0.159155);
      float comet = pow(1.0 - lap, 1.9);
      wind += band * comet * (0.95 - fk * 0.16);
      head += band * smoothstep(0.93, 1.0, 1.0 - lap) * (1.0 - fk * 0.3);
    }

    // Gust streaks trail opposite the motion while the hand moves — the
    // orb's wake, three flickering wind lines with ragged ends.
    float streaks = 0.0;
    float motionLength = length(motion);
    if (speed > 0.02 && motionLength > 0.001) {
      vec2 direction = motion / motionLength;
      float along = dot(p, -direction);
      float across = dot(p, vec2(-direction.y, direction.x));
      for (int s = 0; s < 3; s += 1) {
        float fs = float(s) - 1.0;
        float lane = across - fs * 13.0 -
          (windFbm(vec2(along * 0.05, time * 1.3 + fs * 9.0)) - 0.5) * 8.0;
        float reach = 46.0 + speed * 120.0 + fs * 12.0;
        float body = smoothstep(4.0, 18.0, along) *
          (1.0 - smoothstep(reach * 0.55, reach, along));
        float tube = exp(-lane * lane / 26.0);
        float flicker = 0.6 +
          0.4 * windNoise(vec2(along * 0.07 - time * 3.1, fs * 4.7));
        streaks += body * tube * flicker;
      }
      streaks *= speed;
    }

    // The click gust: one expanding ring, thickening and fading as it grows,
    // matching the radial shove the click gives the floating leaves. (The
    // ring also fires when a click catches a leaf — the hand still moves
    // air.) Guarded so the idle sentinel age never reaches the ring math:
    // NaN from a negative-base pow would survive the step() multiplier.
    float ring = 0.0;
    if (uBurstAge >= 0.0 && stillness < 0.5) {
      float burstRadius = 30.0 + uBurstAge * 430.0;
      float ringArm = (r - burstRadius) / (7.0 + uBurstAge * 26.0);
      // Dissolve fully inside the quad: the expanding gust thins into air
      // well before the draw region's edge could clip it into an arc.
      ring = exp(-ringArm * ringArm) * exp(-uBurstAge * 3.4) *
        (1.0 - smoothstep(110.0, 160.0, burstRadius));
    }

    // Registration: a precise contact dot on the raw pointer plus the
    // faintest glassy lens where the air parcel sits.
    float pointerDistance = length(vLocal);
    float contact = exp(-pointerDistance * pointerDistance / 6.0);
    float lens = exp(-r * r / 256.0) * 0.5;

    float wisps = clamp(wind * 0.8 + streaks * 0.85 + ring * 0.7, 0.0, 1.0);
    float alpha = wisps * 0.52 + lens * 0.1 + contact * 0.4;

    // Ink wisps on the white page; the site's red rides only the leading
    // arc head, a fleck rather than a costume.
    vec3 pale = vec3(0.5, 0.54, 0.6);
    vec3 ink = vec3(0.24, 0.27, 0.32);
    vec3 color = mix(pale, ink, clamp(wind + streaks, 0.0, 1.0));
    color = mix(color, vec3(0.84, 0.18, 0.12), clamp(head, 0.0, 1.0) * 0.5);
    color = mix(color, vec3(0.30, 0.33, 0.38), ring * 0.6);

    float quadFade = (1.0 - smoothstep(168.0, 184.0, abs(vLocal.x))) *
      (1.0 - smoothstep(168.0, 184.0, abs(vLocal.y)));
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

/** A swirling orb of air that leans, streaks, and gusts with the pointer —
    Drift's counterpart to the ignite flame cursor. */
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
    const timeUniform = context.getUniformLocation(program, "uTime");
    const motionUniform = context.getUniformLocation(program, "uMotion");
    const speedUniform = context.getUniformLocation(program, "uSpeed");
    const swirlUniform = context.getUniformLocation(program, "uSwirl");
    const burstUniform = context.getUniformLocation(program, "uBurstAge");
    const reducedUniform = context.getUniformLocation(program, "uReducedMotion");
    const bodyOffsetUniform = context.getUniformLocation(program, "uBodyOffset");
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
    let orbBody: DriftOrbBodyState = {
      x: cursorX,
      y: cursorY,
      velocityX: 0,
      velocityY: 0,
    };
    let orbBodyInitialized = false;
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

    const resetOrbBody = () => {
      orbBody = { x: cursorX, y: cursorY, velocityX: 0, velocityY: 0 };
      orbBodyInitialized = true;
    };

    const render = (timeSeconds: number) => {
      context.clearColor(0, 0, 0, 0);
      context.clear(context.COLOR_BUFFER_BIT);
      if (!visible) return;

      const gust = driftCursorGust(pointerVelocityX, pointerVelocityY);
      const burst = driftGustBurst(burstAge);

      let bodyOffsetX = orbBody.x - cursorX;
      let bodyOffsetY = cursorY - orbBody.y;
      const bodyOffsetLength = Math.hypot(bodyOffsetX, bodyOffsetY);
      if (bodyOffsetLength > 26) {
        const scale = 26 / bodyOffsetLength;
        bodyOffsetX *= scale;
        bodyOffsetY *= scale;
      }
      if (reducedMotion.matches) {
        bodyOffsetX = 0;
        bodyOffsetY = 0;
      }

      context.useProgram(program);
      context.uniform2f(resolutionUniform, canvas.width, canvas.height);
      context.uniform2f(
        centerUniform,
        cursorX * dpr,
        (window.innerHeight - cursorY) * dpr,
      );
      context.uniform1f(dprUniform, dpr);
      context.uniform1f(timeUniform, timeSeconds);
      // The shader's local frame is y-up; every directional upload flips y
      // the way uBodyOffset already does, or vertical wakes would lead the
      // pointer instead of trailing it.
      context.uniform2f(motionUniform, motionX, -motionY);
      context.uniform1f(speedUniform, gust.speed);
      context.uniform1f(swirlUniform, swirlPhase);
      context.uniform1f(
        burstUniform,
        burst.strength > 0.01 ? Math.max(0, burstAge) : -1,
      );
      context.uniform1f(reducedUniform, reducedMotion.matches ? 1 : 0);
      context.uniform2f(bodyOffsetUniform, bodyOffsetX, bodyOffsetY);
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
      if (!orbBodyInitialized) resetOrbBody();
      orbBody = stepDriftOrbBody(orbBody, cursorX, cursorY, delta);
      const gust = driftCursorGust(pointerVelocityX, pointerVelocityY);
      const response = 1 - Math.exp(-delta * 26);
      motionX += (gust.x - motionX) * response;
      motionY += (gust.y - motionY) * response;
      // Integrated orbit phase: speed bends the arcs' rate smoothly.
      swirlPhase += (1 + gust.speed * 1.6) * delta;
      if (burstAge >= 0) burstAge += delta;
      if (burstAge > 0.6) burstAge = -1;
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
      const samples = event.getCoalescedEvents?.() ?? [event];
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
      if (visible && !wasVisible) resetOrbBody();
      if (reducedMotion.matches) render(7.3);
      else wake();
    };

    const onPointerDown = (event: PointerEvent) => {
      const wasVisible = visible;
      updatePointer(event);
      visible = !overChrome(event);
      if (visible && !wasVisible) resetOrbBody();
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
      orbBodyInitialized = false;
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
