import { describe, it, expect } from 'vitest';
import { mulberry32, rollInt } from '../src/engine/rng';

describe('mulberry32', () => {
  it('same seed yields the same sequence', () => {
    const a = mulberry32(1234);
    const b = mulberry32(1234);
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('different seeds yield different sequences', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).not.toEqual(seqB);
  });

  it('produces values in [0, 1) like Math.random', () => {
    const r = mulberry32(42);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('is stable across runs (frozen sequence for seed 42)', () => {
    const r = mulberry32(42);
    const seq = Array.from({ length: 3 }, () => r());
    // freeze the first values so accidental algorithm changes fail loudly
    expect(seq[0]).toBeCloseTo(0.60110375192016363, 12);
    expect(seq[1]).toBeCloseTo(0.44829055899754167, 12);
    expect(seq[2]).toBeCloseTo(0.85246579349040985, 12);
  });

  // HRD.11: mulberry32's seed goes through `seed >>> 0` (uint32 coercion) —
  // pin the seeds where that coercion actually does something, so the
  // behaviour is a stated fact, not an accident nobody exercised.
  describe('edge seeds (>>> 0 coercion)', () => {
    function seq(rng: ReturnType<typeof mulberry32>, n = 5): number[] {
      return Array.from({ length: n }, () => rng());
    }

    it('NaN >>> 0 === 0, so mulberry32(NaN) behaves as mulberry32(0)', () => {
      expect(NaN >>> 0).toBe(0);
      expect(seq(mulberry32(NaN))).toEqual(seq(mulberry32(0)));
    });

    it('2**32 wraps to 0 under >>> 0, so it also matches mulberry32(0)', () => {
      expect((2 ** 32) >>> 0).toBe(0);
      expect(seq(mulberry32(2 ** 32))).toEqual(seq(mulberry32(0)));
    });

    it('a negative seed coerces to its unsigned-32 equivalent', () => {
      expect((-1) >>> 0).toBe(4294967295);
      expect(seq(mulberry32(-1))).toEqual(seq(mulberry32(4294967295)));
    });

    it('every edge seed still yields values in [0, 1)', () => {
      for (const seed of [0, -1, 2 ** 32, NaN]) {
        const r = mulberry32(seed);
        for (let i = 0; i < 50; i++) {
          const v = r();
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThan(1);
        }
      }
    });
  });
});

describe('rollInt', () => {
  it('stays within [a, z] inclusive and hits both ends', () => {
    const r = mulberry32(7);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const v = rollInt(2, 5, r);
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThanOrEqual(5);
      expect(Number.isInteger(v)).toBe(true);
      seen.add(v);
    }
    expect(seen).toEqual(new Set([2, 3, 4, 5]));
  });

  it('is deterministic under a seeded rng', () => {
    const a = mulberry32(99);
    const b = mulberry32(99);
    const rollsA = Array.from({ length: 20 }, () => rollInt(1, 100, a));
    const rollsB = Array.from({ length: 20 }, () => rollInt(1, 100, b));
    expect(rollsA).toEqual(rollsB);
  });

  it('collapses to the single value when a === z', () => {
    const r = mulberry32(1);
    expect(rollInt(3, 3, r)).toBe(3);
  });
});
