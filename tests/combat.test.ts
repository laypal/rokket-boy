import { describe, it, expect } from 'vitest';
import { damage, drainHeal } from '../src/systems/combat';
import { mulberry32 } from '../src/engine/rng';
import type { MoveDef } from '../src/types';

// `anim` and `desc` are compile-only ballast here: damage() never reads
// them, but MoveDef requires them since F13 (BFX.1) / F15 (UX2.2).
const TACKLE: MoveDef = { id: 'tackle', name: 'TACKLE', type: 'NORMAL', power: 35, acc: 0.95, anim: 'lunge', desc: 'A TEST SLAM.' };
const SLUDGE: MoveDef = { id: 'sludge', name: 'SLUDGE', type: 'POISON', power: 65, acc: 0.85, anim: 'lob', desc: 'A TEST LOB.' };
const ZAP: MoveDef = { id: 'zap', name: 'ZAP', type: 'ELECTRIC', power: 40, acc: 1, anim: 'bolt', desc: 'A TEST JOLT.' };

// rng() === 0 makes the damage roll exactly 1.0 (max), so expected values are
// hand-derivable from the plan §4.1 formula:
//   floor( floor(((2·lv/5+2) · power · atk/def) / 50 + 2) · typeMult · roll )
const maxRoll = () => 0;

describe('damage formula', () => {
  it('matches the plan formula at max roll (neutral hit)', () => {
    // lv5 TACKLE, atk 65 vs def 95: base = floor(3.9158) = 3
    const dmg = damage({ lv: 5, move: TACKLE, atk: 65, def: 95, defTypes: ['POISON'] }, maxRoll);
    expect(dmg).toBe(3);
  });

  it('doubles on super-effective and halves on not-very-effective', () => {
    // lv5 SLUDGE, atk 65 vs def 50: base = floor(8.76) = 8
    const base = { lv: 5, move: SLUDGE, atk: 65, def: 50 };
    expect(damage({ ...base, defTypes: ['WATER'] }, maxRoll)).toBe(16);  // 2×
    expect(damage({ ...base, defTypes: ['POISON'] }, maxRoll)).toBe(4);  // 0.5×
    expect(damage({ ...base, defTypes: ['NORMAL'] }, maxRoll)).toBe(8);  // 1×
  });

  it('deals zero to an immune defender regardless of the roll', () => {
    const r = mulberry32(1);
    for (let i = 0; i < 20; i++) {
      expect(damage({ lv: 30, move: TACKLE, atk: 200, def: 10, defTypes: ['GHOST'] }, r)).toBe(0);
      expect(damage({ lv: 30, move: ZAP, atk: 200, def: 10, defTypes: ['WATER', 'GROUND'] }, r)).toBe(0);
    }
  });

  it('scales with level', () => {
    const at = (lv: number) =>
      damage({ lv, move: SLUDGE, atk: 65, def: 50, defTypes: ['NORMAL'] }, maxRoll);
    expect(at(20)).toBeGreaterThan(at(5));
    expect(at(50)).toBeGreaterThan(at(20));
  });

  it('keeps every roll within [85%, 100%] of max damage', () => {
    const r = mulberry32(7);
    // lv20 SLUDGE, atk 65 vs def 50: base = floor(18.9) = 18 → range [15, 18]
    for (let i = 0; i < 500; i++) {
      const dmg = damage({ lv: 20, move: SLUDGE, atk: 65, def: 50, defTypes: ['NORMAL'] }, r);
      expect(dmg).toBeGreaterThanOrEqual(15);
      expect(dmg).toBeLessThanOrEqual(18);
    }
  });

  it('drainHeal is half the damage, floored, minimum 1 (QOL.5)', () => {
    // called only for dmg > 0 — the immune path never reaches it
    expect(drainHeal(1)).toBe(1);
    expect(drainHeal(2)).toBe(1);
    expect(drainHeal(3)).toBe(1);
    expect(drainHeal(4)).toBe(2);
    expect(drainHeal(35)).toBe(17);
  });

  it('is deterministic under a seeded rng (frozen §4.9 snapshot)', () => {
    const r = mulberry32(42);
    const rolls = Array.from({ length: 5 }, () =>
      damage({ lv: 20, move: SLUDGE, atk: 65, def: 50, defTypes: ['NORMAL'] }, r),
    );
    // hand-computed from the frozen mulberry32(42) sequence, NOT captured
    // from the implementation: floor(18 · (1 − v·0.15)) for each v
    expect(rolls).toEqual([16, 16, 15, 16, 17]);
  });
});
