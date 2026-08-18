// SIDE.3: the egg-hunt registry — twelve ids, one denominator, one
// completion predicate (CH10.3's unlock). Placement lints live in
// tests/egg-lint.test.ts; this file pins the registry itself.
import { describe, it, expect } from 'vitest';
import { EGG_IDS, EGG_TOTAL, allEggsFound } from '../src/data/eggs';

describe('egg registry (SIDE.3)', () => {
  it('has exactly twelve unique ids and EGG_TOTAL derives from them', () => {
    expect(EGG_TOTAL).toBe(12);
    expect(new Set(EGG_IDS).size).toBe(EGG_IDS.length);
  });

  it('keeps the four shipped CH1 egg ids (a rename orphans live saves)', () => {
    for (const id of ['motto', 'myowth', 'jackpot', 'konami']) expect(EGG_IDS).toContain(id);
  });

  it('allEggsFound is true only for the full set', () => {
    expect(allEggsFound(new Set())).toBe(false);
    expect(allEggsFound(new Set(EGG_IDS.slice(0, EGG_TOTAL - 1)))).toBe(false);
    expect(allEggsFound(new Set(EGG_IDS))).toBe(true);
    // extra unknown ids don't break it (a stale save with a retired id)
    expect(allEggsFound(new Set([...EGG_IDS, 'retired']))).toBe(true);
  });
});
