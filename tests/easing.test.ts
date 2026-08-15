import { describe, it, expect } from 'vitest';
import {
  clamp01,
  lerp,
  cubicBezier,
  EASE,
  EXIT_RATIO,
  exitDuration,
  DUR,
  msToFrames,
  progress,
  tween,
} from '../src/engine/easing';

describe('clamp01', () => {
  it('clamps below 0 and above 1, passes the middle through', () => {
    expect(clamp01(-0.5)).toBe(0);
    expect(clamp01(0)).toBe(0);
    expect(clamp01(0.42)).toBe(0.42);
    expect(clamp01(1)).toBe(1);
    expect(clamp01(2)).toBe(1);
  });
});

describe('lerp', () => {
  it('interpolates linearly between a and b', () => {
    expect(lerp(0, 10, 0)).toBe(0);
    expect(lerp(0, 10, 0.5)).toBe(5);
    expect(lerp(0, 10, 1)).toBe(10);
    expect(lerp(-4, 4, 0.25)).toBe(-2);
  });
});

describe('cubicBezier', () => {
  it('pins the endpoints to exactly 0 and 1', () => {
    const e = cubicBezier(0.2, 0, 0, 1);
    expect(e(0)).toBe(0);
    expect(e(1)).toBe(1);
  });

  it('clamps out-of-range input to the endpoints', () => {
    const e = cubicBezier(0.2, 0, 0, 1);
    expect(e(-1)).toBe(0);
    expect(e(2)).toBe(1);
  });

  it('linear control points behave like identity', () => {
    const e = cubicBezier(1 / 3, 1 / 3, 2 / 3, 2 / 3);
    for (const t of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      expect(e(t)).toBeCloseTo(t, 4);
    }
  });

  it('is monotonic non-decreasing for a standard ease curve', () => {
    const e = EASE.standard;
    let prev = -Infinity;
    for (let i = 0; i <= 100; i++) {
      const v = e(i / 100);
      expect(v).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = v;
    }
  });

  it('ease-out (decelerate) leads ahead of linear at the midpoint', () => {
    // Entrance curves front-load progress: value at t=0.5 is well past 0.5.
    expect(EASE.decelerate(0.5)).toBeGreaterThan(0.5);
  });

  it('ease-in (accelerate) trails behind linear at the midpoint', () => {
    expect(EASE.accelerate(0.5)).toBeLessThan(0.5);
  });

  it('overshoot curves exceed 1 somewhere mid-travel', () => {
    let maxV = -Infinity;
    for (let i = 0; i <= 100; i++) maxV = Math.max(maxV, EASE.bounce(i / 100));
    expect(maxV).toBeGreaterThan(1);
  });

  it('freezes known outputs so algorithm changes fail loudly', () => {
    // Midpoint samples captured from the current solver; guards against drift.
    expect(EASE.standard(0.5)).toBeCloseTo(0.8778336055382352, 6);
    expect(EASE.decelerate(0.5)).toBeCloseTo(0.8898815748654322, 6);
    expect(EASE.accelerate(0.5)).toBeCloseTo(0.37202863052181046, 6);
    expect(EASE.apple(0.5)).toBeCloseTo(0.8024033876954126, 6);
  });
});

describe('durations', () => {
  it('exitDuration is 70% of entrance, rounded', () => {
    expect(EXIT_RATIO).toBe(0.7);
    expect(exitDuration(180)).toBe(126);
    expect(exitDuration(250)).toBe(175);
  });

  it('DUR exposes the named game contexts with exit values derived from entrances', () => {
    expect(DUR.menuClose).toBe(exitDuration(DUR.menuOpen));
    expect(DUR.dialogOut).toBe(exitDuration(DUR.dialogIn));
    expect(DUR.hitFlash).toBeLessThan(DUR.dialogIn);
    expect(DUR.screenFade).toBeLessThan(DUR.encounterReveal);
  });
});

describe('msToFrames', () => {
  it('converts ms to whole frames at 60fps by default', () => {
    expect(msToFrames(1000)).toBe(60);
    expect(msToFrames(250)).toBe(15);
    expect(msToFrames(180)).toBe(11); // 10.8 -> 11
  });

  it('honours a custom fps and never returns less than one frame', () => {
    expect(msToFrames(1000, 30)).toBe(30);
    expect(msToFrames(5, 60)).toBe(1); // 0.3 rounds to 0 -> floored up to 1
  });
});

describe('progress', () => {
  it('is linear and clamped between 0 and 1', () => {
    expect(progress(0, 100)).toBe(0);
    expect(progress(50, 100)).toBe(0.5);
    expect(progress(100, 100)).toBe(1);
    expect(progress(150, 100)).toBe(1);
  });

  it('snaps to done when duration is zero or negative', () => {
    expect(progress(0, 0)).toBe(1);
    expect(progress(10, -5)).toBe(1);
  });
});

describe('tween', () => {
  it('applies the eased curve to clamped progress', () => {
    expect(tween(0, 100, EASE.standard)).toBe(0);
    expect(tween(100, 100, EASE.standard)).toBe(1);
    expect(tween(200, 100, EASE.standard)).toBe(1); // clamped
  });

  it('defaults to the standard curve', () => {
    expect(tween(50, 100)).toBeCloseTo(EASE.standard(0.5), 10);
  });

  it('composes with lerp to drive a value', () => {
    // Halfway through an ease-out entrance, a 0->100 slide is already past 50.
    const y = lerp(0, 100, tween(50, 100, EASE.decelerate));
    expect(y).toBeGreaterThan(50);
    expect(y).toBeLessThanOrEqual(100);
  });
});
