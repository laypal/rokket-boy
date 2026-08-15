import { describe, it, expect } from 'vitest';
import { catchChance, rollCatch } from '../src/systems/catch';
import { mulberry32 } from '../src/engine/rng';

// p = catchRate * (1 - (hp/max)*0.7) * ballMod (plan §4.4), clamped to [0, 1].
describe('catchChance', () => {
  it('at full HP, the (1 - hp/max*0.7) term is exactly 0.3', () => {
    expect(catchChance(0.5, 100, 100)).toBeCloseTo(0.5 * 0.3, 12);
    expect(catchChance(0.2, 50, 50)).toBeCloseTo(0.2 * 0.3, 12);
  });

  it('at zero HP, the term collapses to 1 so p equals catchRate', () => {
    expect(catchChance(0.3, 0, 100)).toBeCloseTo(0.3, 12);
    expect(catchChance(0.75, 0, 40)).toBeCloseTo(0.75, 12);
  });

  it('is strictly monotonic: lower hp yields strictly higher p', () => {
    const max = 100;
    const rate = 0.3; // kept low enough to stay unclamped across the range
    const hps = [100, 80, 60, 40, 20, 0];
    const ps = hps.map((hp) => catchChance(rate, hp, max));
    for (let i = 1; i < ps.length; i++) {
      expect(ps[i]).toBeGreaterThan(ps[i - 1]);
    }
  });

  it('scales linearly with ballMod while unclamped', () => {
    const base = catchChance(0.1, 100, 100, 1);
    expect(catchChance(0.1, 100, 100, 2)).toBeCloseTo(base * 2, 12);
    expect(catchChance(0.1, 100, 100, 3)).toBeCloseTo(base * 3, 12);
  });

  it('clamps to 1 when a large ballMod would push p above 1', () => {
    expect(catchChance(0.5, 50, 100, 10)).toBe(1);
  });

  it('clamps to 0 when the inputs would drive p negative', () => {
    // hp > max*(1/0.7) makes (1 - hp/max*0.7) negative
    expect(catchChance(1, 100, 50)).toBe(0);
  });
});

describe('rollCatch', () => {
  it('never catches when p is 0', () => {
    const r = mulberry32(3);
    for (let i = 0; i < 50; i++) {
      expect(rollCatch(0, r)).toBe(false);
    }
  });

  it('always catches when p is 1', () => {
    const r = mulberry32(5);
    for (let i = 0; i < 50; i++) {
      expect(rollCatch(1, r)).toBe(true);
    }
  });

  it('is deterministic under a seeded rng (frozen §4.9 snapshot)', () => {
    const r = mulberry32(42);
    // frozen mulberry32(42) sequence from tests/rng.test.ts:
    // 0.60110375192016363, 0.44829055899754167, 0.85246579349040985
    // compared by hand against p=0.5, NOT captured from the implementation
    const rolls = [rollCatch(0.5, r), rollCatch(0.5, r), rollCatch(0.5, r)];
    expect(rolls).toEqual([false, true, false]);
  });
});
