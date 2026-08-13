import { useEffect, useRef } from "react";
import {
  cursorFlameBottomResponse,
  cursorFlameMotion,
  stepCursorFlameBody,
  type CursorFlameBodyState,
} from "@/ignite/cursorMotion";
import "@/styles/ignite.css";

const VERTEX_SHADER = /* glsl */ `
  attribute vec2 aCorner;

  uniform vec2 uResolution;
  uniform vec2 uCenter;
  uniform float uDpr;

  varying vec2 vLocal;

  void main() {
    // Leave generous transparent room around both the flame and its smoke.
    // The CPU keeps this padded volume in the viewport, so neither effect can
    // reveal the edge of the draw quad when the pointer nears the screen edge.
    float halfWidth = 170.0 * uDpr;
    float bottom = -180.0 * uDpr;
    float top = 220.0 * uDpr;
    float localY = mix(bottom, top, aCorner.y * 0.5 + 0.5);
    float localX = aCorner.x * halfWidth;
    vec2 pixel = uCenter + vec2(localX, localY);
    vec2 clip = pixel / uResolution * 2.0 - 1.0;

    gl_Position = vec4(clip, 0.0, 1.0);
    vLocal = vec2(localX, localY) / uDpr;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform vec2 uMotion;
  uniform float uSpeed;
  uniform float uImpulse;
  uniform float uSmokeRoom;
  uniform float uReducedMotion;
  uniform vec2 uAnchor;
  uniform vec2 uBodyOffset;
  uniform vec2 uViewportBias;
  uniform float uBottomPressure;

  varying vec2 vLocal;

  float flameHash(vec2 point) {
    point = fract(point * vec2(123.34, 345.45));
    point += dot(point, point + 34.345);
    return fract(point.x * point.y);
  }

  float flameNoise(vec2 point) {
    vec2 cell = floor(point);
    vec2 local = fract(point);
    local = local * local * (3.0 - 2.0 * local);
    return mix(
      mix(flameHash(cell), flameHash(cell + vec2(1.0, 0.0)), local.x),
      mix(flameHash(cell + vec2(0.0, 1.0)), flameHash(cell + vec2(1.0)), local.x),
      local.y
    );
  }

  float flameFbm(vec2 point) {
    float value = 0.0;
    float weight = 0.55;
    mat2 turn = mat2(0.80, -0.60, 0.60, 0.80);
    for (int octave = 0; octave < 4; octave += 1) {
      value += weight * flameNoise(point);
      point = turn * point * 2.03 + vec2(1.7, 4.1);
      weight *= 0.47;
    }
    return value / 1.018;
  }

  float flameBlob(vec2 point, vec2 center, vec2 radii) {
    vec2 delta = (point - center) / radii;
    return exp(-dot(delta, delta) * 1.42);
  }

  void main() {
    float stillness = step(0.5, uReducedMotion);
    float time = mix(uTime, .83, stillness);
    float speed = mix(uSpeed, 0.0, stillness);
    vec2 motion = mix(uMotion, vec2(0.0), stillness);
    vec2 local = vLocal - uAnchor;

    // The body follows a separate inertial point while this local origin stays
    // exactly on the pointer. Near a viewport boundary, only the gaseous body
    // bends inward; the small ignition contact never loses its registration.
    vec2 bodyOrigin = uBodyOffset + uViewportBias;
    float stretch = clamp(
      1.0 + speed * .16 + motion.y * .075 + uImpulse * .045,
      .84,
      1.24
    );
    float compression = clamp(
      1.0 - speed * .13 + abs(motion.x) * .035 - uImpulse * .025,
      .78,
      1.04
    );

    // Two advecting flow octaves distort the sampling domain rather than
    // drawing noise on top of an outline. The resulting boundary remains soft,
    // connected, asymmetric and gaseous at every phase of the animation.
    vec2 relativeToBody = local - bodyOrigin;
    float bodyDistance = length(relativeToBody);
    float warpRamp = smoothstep(3.0, 60.0, bodyDistance);
    float broadFlow = flameFbm(vec2(
      relativeToBody.y * .025 - time * .76,
      relativeToBody.x * .021 + time * .11
    )) - .5;
    float crossFlow = flameFbm(vec2(
      relativeToBody.y * .052 + time * .08 + 31.0,
      relativeToBody.x * .043 - time * 1.13
    )) - .5;
    vec2 warped = local + vec2(
      broadFlow * 9.5 + crossFlow * 3.2,
      crossFlow * 5.2 - broadFlow * 2.4
    ) * (.38 + .62 * warpRamp);

    float lagLean = -motion.x * (4.0 + 9.0 * speed);
    float slowSway = sin(time * 1.83) * 2.4;
    float middleSway = sin(time * 2.57 + 1.4) * 3.4;
    float tipSway = sin(time * 3.31 + .3) * 4.8;
    float forkSide = mix(
      -1.0,
      1.0,
      smoothstep(-.32, .32, sin(time * .51 + 2.1))
    );

    // A flame is modeled as a scalar density carried by several overlapping
    // buoyant pockets. Similar lower and middle widths produce a rounded,
    // breathing plume instead of the straight sides of a geometric cone.
    vec2 lowerCenter = bodyOrigin + vec2(
      slowSway - 2.8,
      13.0 * stretch
    );
    vec2 bellyCenter = bodyOrigin + vec2(
      middleSway + 2.4 + lagLean * .22,
      31.0 * stretch
    );
    vec2 crownCenter = bodyOrigin + vec2(
      tipSway + lagLean * .52,
      49.0 * stretch
    );
    vec2 upperCenter = bodyOrigin + vec2(
      middleSway * .6 + tipSway * .55 + lagLean * .82,
      65.0 * stretch
    );
    vec2 forkCenter = bodyOrigin + vec2(
      forkSide * (9.0 + speed * 4.0) + slowSway + lagLean * .66,
      58.0 * stretch
    );

    float lower = flameBlob(
      warped,
      lowerCenter,
      vec2(19.5 * compression, 17.5 * stretch)
    );
    float belly = flameBlob(
      warped,
      bellyCenter,
      vec2(21.0 * compression, 20.5 * stretch)
    );
    float crown = flameBlob(
      warped,
      crownCenter,
      vec2(15.8 * compression, 18.5 * stretch)
    );
    float upper = flameBlob(
      warped,
      upperCenter,
      vec2(9.4 * compression, 15.5 * stretch)
    );
    float fork = flameBlob(
      warped,
      forkCenter,
      vec2(6.4 * compression, 11.5 * stretch)
    );

    float coarseTexture = flameFbm(vec2(
      warped.x * .038 + 11.0,
      warped.y * .034 - time * 1.02
    ));
    float fineTexture = flameFbm(vec2(
      warped.x * .083 + 57.0,
      warped.y * .074 - time * 1.66
    ));
    float densityTexture = clamp(
      .58 + coarseTexture * .50 + (fineTexture - .5) * .22,
      .47,
      1.19
    );

    float plumeDensity = (
      lower * .78 +
      belly * .86 +
      crown * .72 +
      upper * .52 +
      fork * .34
    ) * densityTexture;

    // Residual hot gas fills the old body side of the motion path. Its radius
    // and opacity grow toward the lagging plume, while both approach zero at
    // the pointer; this reads as a dissipating wake, never a glowing tether.
    vec2 wakeAxis = lowerCenter;
    float wakeProgress = clamp(
      dot(local, wakeAxis) / max(.001, dot(wakeAxis, wakeAxis)),
      0.0,
      1.0
    );
    vec2 wakeNormal = normalize(vec2(-wakeAxis.y, wakeAxis.x));
    float wakeNoise = flameFbm(vec2(
      wakeProgress * 3.4 + 108.0,
      -time * 1.21
    )) - .5;
    float wakeRadius = mix(
      1.1,
      12.5 + speed * 4.0,
      pow(wakeProgress, .68)
    ) * (1.0 + wakeNoise * .34);
    vec2 wakeCenter = wakeAxis * wakeProgress + wakeNormal *
      wakeNoise * 7.0 * wakeProgress;
    float wakeDistance = length(local - wakeCenter);
    float turbulentWake = exp(
      -wakeDistance * wakeDistance /
        max(1.0, wakeRadius * wakeRadius)
    );
    turbulentWake *= smoothstep(.12, .58, wakeProgress) *
      (.58 + coarseTexture * .42) * (.45 + speed * .55);

    float contact = flameBlob(
      local,
      vec2(0.0),
      vec2(
        mix(2.4, 1.6, uBottomPressure),
        mix(3.0, 1.9, uBottomPressure)
      )
    );

    // At the bottom viewport edge, analytically remove all broad gas below
    // the exact pointer contact. The tiny contact spark remains registered,
    // while its larger plume has already bent upward via uViewportBias.
    float rootPlane = mix(
      1.0,
      smoothstep(-1.0, 2.4, local.y),
      uBottomPressure
    );
    float density = plumeDensity * rootPlane +
      turbulentWake * .24 * rootPlane +
      contact * .20;

    // Density thresholds are intentionally broad. There is no separate border
    // curve: color and opacity emerge continuously from gas concentration.
    float envelope = smoothstep(.115, .285, density);
    float depth = smoothstep(.25, .82, density);

    float hotLower = flameBlob(
      warped,
      lowerCenter + vec2(-1.0, 1.0),
      vec2(8.1 * compression, 12.2 * stretch)
    );
    float hotBelly = flameBlob(
      warped,
      bellyCenter + vec2(-1.5, -1.0),
      vec2(8.4 * compression, 14.8 * stretch)
    );
    float hotCrown = flameBlob(
      warped,
      crownCenter,
      vec2(4.3 * compression, 8.4 * stretch)
    );
    float heat = clamp(
      (
        hotLower * .76 +
        hotBelly * .63 +
        hotCrown * .30
      ) * rootPlane + contact * .14,
      0.0,
      1.0
    );
    float whiteHeat = smoothstep(.55, .93, heat);
    float yellowHeat = smoothstep(.22, .74, heat);

    vec3 flameColor = mix(
      vec3(1.0, .41, .045),
      vec3(1.0, .72, .13),
      depth
    );
    flameColor = mix(
      flameColor,
      vec3(1.0, .91, .36),
      yellowHeat * .82
    );
    flameColor = mix(
      flameColor,
      vec3(1.0, .995, .88),
      whiteHeat * .96
    );

    // Real blue is confined to a tiny, low-opacity fuel-rich crescent. It
    // cannot tint the entire foot purple or become a second graphic shape.
    float blueFoot = smoothstep(.16, .48, contact) *
      (1.0 - smoothstep(.50, .82, contact)) *
      (1.0 - whiteHeat);
    flameColor = mix(
      flameColor,
      vec3(.18, .48, .76),
      blueFoot * .12
    );

    float flameAlpha = envelope * mix(.20, .77, depth);
    flameAlpha = mix(flameAlpha, .94, whiteHeat * .84);

    float glowEnvelope = smoothstep(.035, .15, density) *
      (1.0 - envelope);
    float glowAlpha = glowEnvelope * .027;
    vec3 glowColor = vec3(1.0, .57, .10);

    // Smoke shares the same advected flow and originates from the upper lobe.
    // Its two overlapping pockets read as one soft exhalation, never triangles.
    vec2 smokeWarped = local + vec2(
      broadFlow * 8.0,
      crossFlow * 4.0
    );
    vec2 smokeA = upperCenter + vec2(
      sin(time * .79) * 4.0 - motion.x * 5.0,
      24.0
    );
    vec2 smokeB = smokeA + vec2(
      sin(time * .57 + 1.0) * 7.0,
      27.0
    );
    float smokeDensity =
      flameBlob(smokeWarped, smokeA, vec2(9.5, 17.0)) * .62 +
      flameBlob(smokeWarped, smokeB, vec2(15.0, 23.0)) * .35;
    smokeDensity *= .48 + coarseTexture * .52;
    float smokeAlpha = smoothstep(.12, .50, smokeDensity) * .026 *
      uSmokeRoom * (1.0 - stillness) * (1.0 - envelope);
    vec3 smokeColor = vec3(.25, .23, .21);

    float alpha = flameAlpha;
    vec3 premultiplied = flameColor * flameAlpha;
    premultiplied += glowColor * glowAlpha * (1.0 - alpha);
    alpha += glowAlpha * (1.0 - alpha);
    premultiplied += smokeColor * smokeAlpha * (1.0 - alpha);
    alpha += smokeAlpha * (1.0 - alpha);

    float quadFade = (1.0 - smoothstep(158.0, 168.0, abs(vLocal.x))) *
      smoothstep(-176.0, -160.0, vLocal.y) *
      (1.0 - smoothstep(202.0, 217.0, vLocal.y));
    alpha *= quadFade;
    premultiplied *= quadFade;

    if (alpha < .0015) discard;
    gl_FragColor = vec4(premultiplied, alpha);
  }
`;

function compileShader(
  context: WebGLRenderingContext,
  type: number,
  source: string,
) {
  const shader = context.createShader(type);
  if (!shader) throw new Error("Unable to allocate Ignite cursor shader.");
  context.shaderSource(shader, source);
  context.compileShader(shader);
  if (!context.getShaderParameter(shader, context.COMPILE_STATUS)) {
    const log = context.getShaderInfoLog(shader) ?? "Unknown shader error.";
    context.deleteShader(shader);
    throw new Error(log);
  }
  return shader;
}

function createFlameProgram(context: WebGLRenderingContext) {
  const vertexShader = compileShader(context, context.VERTEX_SHADER, VERTEX_SHADER);
  const fragmentShader = compileShader(context, context.FRAGMENT_SHADER, FRAGMENT_SHADER);
  const program = context.createProgram();
  if (!program) throw new Error("Unable to allocate Ignite cursor program.");
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

/** A continuous turbulent flame that bends and stretches with cursor movement. */
export function IgniteCursor() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("webgl", {
      alpha: true,
      antialias: false,
      depth: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
      stencil: false,
    });
    if (!canvas || !context) return;

    let program: WebGLProgram;
    try {
      program = createFlameProgram(context);
    } catch (error) {
      console.warn("Ignite cursor shader could not be initialized.", error);
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
    const impulseUniform = context.getUniformLocation(program, "uImpulse");
    const smokeRoomUniform = context.getUniformLocation(program, "uSmokeRoom");
    const reducedUniform = context.getUniformLocation(program, "uReducedMotion");
    const anchorUniform = context.getUniformLocation(program, "uAnchor");
    const bodyOffsetUniform = context.getUniformLocation(program, "uBodyOffset");
    const viewportBiasUniform = context.getUniformLocation(
      program,
      "uViewportBias",
    );
    const bottomPressureUniform = context.getUniformLocation(
      program,
      "uBottomPressure",
    );
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
    let impulse = 0;
    let plumeBody: CursorFlameBodyState = {
      x: cursorX,
      y: cursorY,
      velocityX: 0,
      velocityY: 0,
    };
    let plumeBodyInitialized = false;
    let visible = false;
    let frameId = 0;
    let previousFrameTime = 0;
    let dpr = 1;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(window.innerWidth * dpr));
      canvas.height = Math.max(1, Math.round(window.innerHeight * dpr));
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      context.viewport(0, 0, canvas.width, canvas.height);
    };

    const resetPlumeBody = () => {
      plumeBody = {
        x: cursorX,
        y: cursorY,
        velocityX: 0,
        velocityY: 0,
      };
      plumeBodyInitialized = true;
    };

    const smoothUnit = (value: number) => {
      const clamped = Math.max(0, Math.min(1, value));
      return clamped * clamped * (3 - 2 * clamped);
    };

    const render = (timeSeconds: number) => {
      context.clearColor(0, 0, 0, 0);
      context.clear(context.COLOR_BUFFER_BIT);
      if (!visible) return;

      const target = cursorFlameMotion(pointerVelocityX, pointerVelocityY);

      // The quad stays registered to the pointer, while shader-local offsets
      // separate its exact contact kernel from the inertial gas body.
      const centerX = cursorX;
      const centerY = cursorY + 4;
      const anchorX = cursorX - centerX;
      const anchorY = centerY - cursorY;

      let bodyOffsetX = plumeBody.x - cursorX;
      let bodyOffsetY = cursorY - plumeBody.y;
      const bodyOffsetLength = Math.hypot(bodyOffsetX, bodyOffsetY);
      if (bodyOffsetLength > 22) {
        const scale = 22 / bodyOffsetLength;
        bodyOffsetX *= scale;
        bodyOffsetY *= scale;
      }
      if (reducedMotion.matches) {
        bodyOffsetX = 0;
        bodyOffsetY = 0;
      }

      // Bend the gas mass—not the registered contact—away from hard viewport
      // boundaries. At the top edge the plume rolls below the pointer and its
      // smoke fades; side edges produce an inward horizontal lobe.
      const leftEdge = 1 - smoothUnit((cursorX - 2) / 70);
      const rightEdge = 1 - smoothUnit(
        (window.innerWidth - cursorX - 2) / 70,
      );
      const topEdge = 1 - smoothUnit((cursorY - 2) / 118);
      const bottomResponse = cursorFlameBottomResponse(
        cursorY,
        window.innerHeight,
      );
      // Downward local lag would fight the bottom-edge lift, so progressively
      // erase only that component before adding the upward body pressure.
      if (bodyOffsetY < 0) {
        bodyOffsetY *= 1 - bottomResponse.pressure;
      }
      const viewportBiasX = (leftEdge - rightEdge) * 46;
      const viewportBiasY = -topEdge * 90 + bottomResponse.bodyBiasY;
      const smokeRoom = 1 - topEdge;

      context.useProgram(program);
      context.uniform2f(resolutionUniform, canvas.width, canvas.height);
      context.uniform2f(
        centerUniform,
        centerX * dpr,
        (window.innerHeight - centerY) * dpr,
      );
      context.uniform1f(dprUniform, dpr);
      context.uniform1f(timeUniform, timeSeconds);
      context.uniform2f(motionUniform, motionX, motionY);
      context.uniform1f(speedUniform, target.speed);
      context.uniform1f(impulseUniform, impulse);
      context.uniform1f(smokeRoomUniform, smokeRoom);
      context.uniform1f(reducedUniform, reducedMotion.matches ? 1 : 0);
      context.uniform2f(anchorUniform, anchorX, anchorY);
      context.uniform2f(bodyOffsetUniform, bodyOffsetX, bodyOffsetY);
      context.uniform2f(
        viewportBiasUniform,
        viewportBiasX,
        viewportBiasY,
      );
      context.uniform1f(bottomPressureUniform, bottomResponse.pressure);
      context.drawArrays(context.TRIANGLE_STRIP, 0, 4);
    };

    const frame = (now: number) => {
      frameId = 0;
      if (document.hidden) return;

      const delta = Math.min(
        previousFrameTime ? (now - previousFrameTime) / 1000 : 1 / 60,
        0.05,
      );
      previousFrameTime = now;
      const velocityDecay = Math.exp(-delta * 10.5);
      pointerVelocityX *= velocityDecay;
      pointerVelocityY *= velocityDecay;
      const target = cursorFlameMotion(pointerVelocityX, pointerVelocityY);
      if (!plumeBodyInitialized) resetPlumeBody();
      plumeBody = stepCursorFlameBody(
        plumeBody,
        cursorX,
        cursorY,
        delta,
      );
      // Directional deformation catches the live velocity quickly while the
      // independently simulated gas body supplies the remaining resistance.
      const deformationResponse = 1 - Math.exp(-delta * 34);
      motionX += (target.x - motionX) * deformationResponse;
      motionY += (target.y - motionY) * deformationResponse;
      impulse *= Math.exp(-delta * 13.0);
      render(now / 1000);

      if (!reducedMotion.matches && visible) {
        frameId = window.requestAnimationFrame(frame);
      }
    };

    const wake = () => {
      if (frameId || document.hidden) return;
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
          const sampledMotion = cursorFlameMotion(
            instantaneousX,
            instantaneousY,
          );
          // Direction changes are visible on the same input event. The gas
          // body still follows through its separate near-critical response.
          const immediateResponse = Math.max(0.82, response * 0.78);
          motionX += (sampledMotion.x - motionX) * immediateResponse;
          motionY += (sampledMotion.y - motionY) * immediateResponse;
          impulse = Math.max(
            impulse,
            sampledMotion.speed,
          );
        } else if (delta >= 0.2) {
          pointerVelocityX = 0;
          pointerVelocityY = 0;
        }
        previousCursorX = sample.clientX;
        previousCursorY = sample.clientY;
        previousPointerTime = eventTime;
      }
      if (samples.length === 0) {
        pointerVelocityX = 0;
        pointerVelocityY = 0;
      }
      cursorX = event.clientX;
      cursorY = event.clientY;
      previousCursorX = cursorX;
      previousCursorY = cursorY;
    };

    const onPointerMove = (event: PointerEvent) => {
      const wasVisible = visible;
      updatePointer(event);
      const target = event.target instanceof Element ? event.target : null;
      const overChrome = Boolean(
        target?.closest(".experience-dock, .ignite-hud, .bstage__nav"),
      );
      visible = !overChrome && (event.pointerType !== "touch" || event.pressure > 0);
      if (visible && !wasVisible) resetPlumeBody();
      if (reducedMotion.matches) render(0.83);
      else wake();
    };

    const onPointerDown = (event: PointerEvent) => {
      const wasVisible = visible;
      updatePointer(event);
      const target = event.target instanceof Element ? event.target : null;
      visible = !target?.closest(".experience-dock, .ignite-hud, .bstage__nav");
      if (visible && !wasVisible) resetPlumeBody();
      if (reducedMotion.matches) render(0.83);
      else wake();
    };

    const hide = () => {
      visible = false;
      pointerVelocityX = 0;
      pointerVelocityY = 0;
      motionX = 0;
      motionY = 0;
      impulse = 0;
      plumeBodyInitialized = false;
      render(0);
    };

    const onPointerOut = (event: PointerEvent) => {
      if (event.relatedTarget === null) hide();
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        if (frameId) window.cancelAnimationFrame(frameId);
        frameId = 0;
      } else if (visible) {
        if (reducedMotion.matches) render(0.83);
        else wake();
      }
    };

    const syncCursorMode = () => {
      document.documentElement.classList.toggle(
        "ignite-hides-cursor",
        finePointer.matches && !reducedMotion.matches,
      );
      if (reducedMotion.matches) render(0.83);
      else wake();
    };

    document.documentElement.classList.add("ignite-active");
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
        "ignite-active",
        "ignite-hides-cursor",
      );
    };
  }, []);

  return <canvas ref={canvasRef} className="ignite-cursor" aria-hidden="true" />;
}
