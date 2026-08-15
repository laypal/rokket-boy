import { describe, it, expect } from 'vitest';
import { TYPE_IDS, typeMult, effectiveness, type TypeId } from '../src/data/typeChart';

// Every non-neutral cell of the 9×9 matrix, frozen. Everything not listed
// here must be exactly 1 — together the two checks pin all 81 cells.
// Deviations from Gen 1 (decision journal): POISON→WATER 2 (pollution),
// FIRE→POISON 2 (flammable gas), GHOST→PSYCHIC 2 (Gen 1 bug corrected).
const NON_NEUTRAL: [TypeId, TypeId, number][] = [
  ['NORMAL', 'GHOST', 0],
  ['POISON', 'POISON', 0.5],
  ['POISON', 'GROUND', 0.5],
  ['POISON', 'GHOST', 0.5],
  ['POISON', 'WATER', 2],
  ['ELECTRIC', 'WATER', 2],
  ['ELECTRIC', 'ELECTRIC', 0.5],
  ['ELECTRIC', 'GROUND', 0],
  ['GHOST', 'NORMAL', 0],
  ['GHOST', 'GHOST', 2],
  ['GHOST', 'PSYCHIC', 2],
  ['FIGHTING', 'NORMAL', 2],
  ['FIGHTING', 'POISON', 0.5],
  ['FIGHTING', 'PSYCHIC', 0.5],
  ['FIGHTING', 'GHOST', 0],
  ['GROUND', 'ELECTRIC', 2],
  ['GROUND', 'POISON', 2],
  ['GROUND', 'FIRE', 2],
  ['PSYCHIC', 'FIGHTING', 2],
  ['PSYCHIC', 'POISON', 2],
  ['PSYCHIC', 'PSYCHIC', 0.5],
  ['FIRE', 'POISON', 2],
  ['FIRE', 'FIRE', 0.5],
  ['FIRE', 'WATER', 0.5],
  ['WATER', 'FIRE', 2],
  ['WATER', 'GROUND', 2],
  ['WATER', 'WATER', 0.5],
];

describe('type ids', () => {
  it('defines exactly the nine plan §4.1 types', () => {
    expect(TYPE_IDS).toEqual([
      'NORMAL', 'POISON', 'ELECTRIC', 'GHOST', 'FIGHTING',
      'GROUND', 'PSYCHIC', 'FIRE', 'WATER',
    ]);
  });
});

describe('9×9 matrix', () => {
  it('matches the frozen non-neutral cells', () => {
    for (const [atk, def, mult] of NON_NEUTRAL) {
      expect(typeMult(atk, def), `${atk} vs ${def}`).toBe(mult);
    }
  });

  it('every unlisted cell is neutral (1) and every cell is 0|0.5|1|2', () => {
    const listed = new Set(NON_NEUTRAL.map(([a, d]) => `${a}>${d}`));
    for (const atk of TYPE_IDS) {
      for (const def of TYPE_IDS) {
        const m = typeMult(atk, def);
        expect([0, 0.5, 1, 2], `${atk} vs ${def}`).toContain(m);
        if (!listed.has(`${atk}>${def}`)) {
          expect(m, `${atk} vs ${def} should be neutral`).toBe(1);
        }
      }
    }
  });

  it('keeps the three immunities (defender side)', () => {
    expect(typeMult('NORMAL', 'GHOST')).toBe(0);
    expect(typeMult('FIGHTING', 'GHOST')).toBe(0);
    expect(typeMult('ELECTRIC', 'GROUND')).toBe(0);
  });

  it('every attacking type except NORMAL has a super-effective target', () => {
    for (const atk of TYPE_IDS) {
      if (atk === 'NORMAL') continue;
      const supers = TYPE_IDS.filter((def) => typeMult(atk, def) === 2);
      expect(supers.length, `${atk} needs an offensive edge`).toBeGreaterThan(0);
    }
  });

  it('every defending type has at least one weakness', () => {
    for (const def of TYPE_IDS) {
      const weakTo = TYPE_IDS.filter((atk) => typeMult(atk, def) === 2);
      expect(weakTo.length, `${def} needs a check`).toBeGreaterThan(0);
    }
  });
});

describe('effectiveness (dual types)', () => {
  it('multiplies across the defender types', () => {
    // ground hits electric AND fire super-effectively → 4×
    expect(effectiveness('GROUND', ['ELECTRIC', 'FIRE'])).toBe(4);
    // one immunity zeroes the product no matter the other type
    expect(effectiveness('ELECTRIC', ['WATER', 'GROUND'])).toBe(0);
    // super × not-very cancels out
    expect(effectiveness('FIRE', ['POISON', 'FIRE'])).toBe(1);
  });

  it('handles single-type defenders', () => {
    expect(effectiveness('WATER', ['FIRE'])).toBe(2);
    expect(effectiveness('NORMAL', ['NORMAL'])).toBe(1);
  });
});
