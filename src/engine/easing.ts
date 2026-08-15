// Easing & timing vocabulary — pure, zero-dependency, frame-loop friendly.
//
// Distilled from LottieFiles' motion-design skill (Disney's 12 principles for
// UI): duration/easing lookup tables reduced to numbers and curves. No runtime
// library — an Easing is just `(t) => y` over t,y in [0,1] (overshoot curves
// may exceed 1 mid-travel, which is the point). Consumers pick a duration from
// `DUR`, a curve from `EASE`, and drive it with `tween(elapsed, duration, ease)`.
//
// The main loop (loop.ts) is frame-based at 60fps, so durations here are in ms
// for readability; convert with `msToFrames` when counting frames.

/** A normalised easing curve: input progress t in [0,1] -> eased value. */
export type Easing = (t: number) => number;

/** Clamp to [0, 1]. */
export function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/** Linear interpolation from a to b by t (t is not clamped; clamp01 first if needed). */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Cubic-bezier easing factory (P0=(0,0), P3=(1,1) fixed; you give P1, P2).
 * Mirrors the CSS `cubic-bezier()` contract: Newton-Raphson with a bisection
 * fallback to invert x(t), then sample y. Endpoints are exact 0 and 1.
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): Easing {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;

  const sampleX = (t: number): number => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number): number => ((ay * t + by) * t + cy) * t;
  const slopeX = (t: number): number => (3 * ax * t + 2 * bx) * t + cx;

  const solveX = (x: number): number => {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const dx = sampleX(t) - x;
      if (Math.abs(dx) < 1e-6) return t;
      const d = slopeX(t);
      if (Math.abs(d) < 1e-6) break;
      t -= dx / d;
    }
    // Bisection fallback keeps us in [0,1] when Newton stalls.
    let lo = 0;
    let hi = 1;
    t = x;
    for (let i = 0; i < 30; i++) {
      const dx = sampleX(t) - x;
      if (Math.abs(dx) < 1e-6) return t;
      if (dx > 0) hi = t;
      else lo = t;
      t = (lo + hi) / 2;
    }
    return t;
  };

  return (t: number): number => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    return sampleY(solveX(t));
  };
}

/**
 * Named curves, control points verbatim from the motion-design timing tables.
 * `entrance`/`exit`/`onScreen`/`looping`/`linear` are the directional rules
 * (entrance=ease-out, exit=ease-in, on-screen=ease-in-out).
 */
export const EASE = {
  linear: ((t: number): number => t) as Easing,
  standard: cubicBezier(0.2, 0, 0, 1), // MD3 Standard
  emphasized: cubicBezier(0.05, 0.7, 0.1, 1), // MD3 Emphasized
  accelerate: cubicBezier(0.3, 0, 1, 1), // MD3 Accelerate
  decelerate: cubicBezier(0, 0, 0, 1), // MD3 Decelerate
  apple: cubicBezier(0.25, 0.1, 0.25, 1), // Apple HIG
  gentle: cubicBezier(0.4, 0, 0.2, 1), // Gentle float
  bounce: cubicBezier(0.175, 0.885, 0.32, 1.275), // Bounce settle (overshoots >1)
  elastic: cubicBezier(0.68, -0.55, 0.265, 1.55), // Elastic snap (dips <0 then >1)

  // Directional aliases (the "Easing Directional Rules" row).
  entrance: cubicBezier(0, 0, 0, 1), // ease-out — things arriving
  exit: cubicBezier(0.3, 0, 1, 1), // ease-in — things leaving
  onScreen: cubicBezier(0.4, 0, 0.2, 1), // ease-in-out — moving in place
} as const;

/** Exit motions run at ~70% of the matching entrance duration (table: 65-75%). */
export const EXIT_RATIO = 0.7;

/** Exit duration for a given entrance duration, per the entrance-vs-exit rule. */
export function exitDuration(entranceMs: number): number {
  return Math.round(entranceMs * EXIT_RATIO);
}

/**
 * Game-context durations in milliseconds. Values are picks from the element-type
 * and personality tables tuned toward a snappy retro feel; the trailing comment
 * cites the source row so the vocabulary stays traceable.
 */
export const DUR = {
  menuOpen: 180, // Button/toggle 120-180ms — snappy panel open
  menuClose: exitDuration(180), // 126ms — exit at 70%
  dialogIn: 250, // Card enter 200-350ms — dialog box slide-in
  dialogOut: exitDuration(250), // 175ms
  hitFlash: 100, // Tooltip/micro-feedback 80-120ms — battle damage flash
  screenFade: 400, // Page transition 400-600ms — scene/screen change
  encounterReveal: 600, // Dramatic reveal 600-1200ms — battle intro
} as const;

/** Duration in ms -> whole frames at the loop's rate (default 60fps). */
export function msToFrames(ms: number, fps = 60): number {
  return Math.max(1, Math.round((ms / 1000) * fps));
}

/**
 * Linear progress of an animation, clamped to [0,1]. `elapsed` and `duration`
 * must share a unit (both ms, or both frames). duration<=0 snaps to done (1).
 */
export function progress(elapsed: number, duration: number): number {
  if (duration <= 0) return 1;
  return clamp01(elapsed / duration);
}

/**
 * Eased progress in one call: eased(progress(elapsed, duration)).
 * Feed the result to `lerp` to drive a position, alpha, scale, etc.
 */
export function tween(elapsed: number, duration: number, ease: Easing = EASE.standard): number {
  return ease(progress(elapsed, duration));
}
