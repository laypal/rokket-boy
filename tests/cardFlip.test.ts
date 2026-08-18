// SIDE.2 — PICKPOCKET table rules (.paul/plan/side-2346/02-side2-pickpocket.md
// frozen contract). Pure engine tests, the jobs.test.ts idiom: seeded
// mulberry32, no Math.random, hand-computed invariants plus a labelled
// regression pin for the shuffle order itself.
import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../src/engine/rng';
import {
  STAKE,
  PAYOUT_UNIT,
  LOOT_VALUES,
  COP_COUNT,
  COP_LIMIT,
  GRID_W,
  GRID_H,
  newHand,
  flip,
  bag,
  payout,
  lootLeft,
} from '../src/systems/cardFlip';
import { CARD_W, CARD_H, CARD_X, CARD_Y } from '../src/systems/cardFlipScreen';

describe('newHand — deck invariants', () => {
  it('every seed 1..50 deals 12 cards: exactly 3 cop, the 9 loot values match LOOT_VALUES as a multiset', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const h = newHand(mulberry32(seed));
      expect(h.cards).toHaveLength(12);
      const cops = h.cards.filter((c) => c.kind === 'cop');
      expect(cops).toHaveLength(COP_COUNT);
      const lootValues = h.cards.filter((c) => c.kind === 'loot').map((c) => (c as { value: number }).value).sort((a, b) => a - b);
      expect(lootValues).toEqual([...LOOT_VALUES].sort((a, b) => a - b));
      expect(h.flipped).toEqual(new Array(12).fill(false));
      expect(h.haul).toBe(0);
      expect(h.cops).toBe(0);
      expect(h.status).toBe('live');
    }
  });

  it('is deterministic for the same seed, and boards differ across seeds', () => {
    const a = newHand(mulberry32(3));
    const b = newHand(mulberry32(3));
    expect(a).toEqual(b);

    let sawDifference = false;
    const first = newHand(mulberry32(1));
    for (let seed = 2; seed <= 50; seed++) {
      const other = newHand(mulberry32(seed));
      if (JSON.stringify(other.cards) !== JSON.stringify(first.cards)) {
        sawDifference = true;
        break;
      }
    }
    expect(sawDifference).toBe(true);
  });

  // REGRESSION PIN: a seed/shuffle-order change re-rolls every live table;
  // must be deliberate. Frozen from the first verified run (2026-08-17).
  // Card 0 of this board is LOOT — the e2e spec relies on it.
  it('REGRESSION PIN: mulberry32(7) board, card 0 is LOOT', () => {
    const h = newHand(mulberry32(7));
    expect(h.cards).toEqual([
      { kind: 'loot', value: 5 },
      { kind: 'cop' },
      { kind: 'loot', value: 2 },
      { kind: 'loot', value: 3 },
      { kind: 'loot', value: 1 },
      { kind: 'loot', value: 10 },
      { kind: 'loot', value: 2 },
      { kind: 'loot', value: 3 },
      { kind: 'loot', value: 5 },
      { kind: 'cop' },
      { kind: 'cop' },
      { kind: 'loot', value: 1 },
    ]);
    expect(h.cards[0].kind).toBe('loot');
  });
});

describe('flip — mechanics', () => {
  it('LOOT flips sum into haul', () => {
    const h = newHand(mulberry32(7));
    expect(flip(h, 0)).toBe(true); // loot 5
    expect(h.haul).toBe(5);
    expect(flip(h, 2)).toBe(true); // loot 2
    expect(h.haul).toBe(7);
    expect(h.status).toBe('live');
  });

  it('COP flips count toward cops; the 3rd busts the hand and zeroes haul', () => {
    const h = newHand(mulberry32(7));
    flip(h, 0); // loot 5, haul=5
    expect(flip(h, 1)).toBe(true); // cop #1
    expect(h.cops).toBe(1);
    expect(h.status).toBe('live');
    expect(flip(h, 9)).toBe(true); // cop #2
    expect(h.cops).toBe(2);
    expect(h.status).toBe('live');
    expect(flip(h, 10)).toBe(true); // cop #3 — bust
    expect(h.cops).toBe(3);
    expect(h.status).toBe('busted');
    expect(h.haul).toBe(0);
  });

  it('flipping an already-flipped index is a no-op returning false', () => {
    const h = newHand(mulberry32(7));
    flip(h, 0);
    const before = JSON.stringify(h);
    expect(flip(h, 0)).toBe(false);
    expect(JSON.stringify(h)).toBe(before);
  });

  it('flipping after a bust is a no-op', () => {
    const h = newHand(mulberry32(7));
    flip(h, 1); // cop
    flip(h, 9); // cop
    flip(h, 10); // cop, bust
    expect(h.status).toBe('busted');
    const before = JSON.stringify(h);
    expect(flip(h, 0)).toBe(false);
    expect(JSON.stringify(h)).toBe(before);
  });

  it('flipping after a bag is a no-op', () => {
    const h = newHand(mulberry32(7));
    flip(h, 0); // loot, haul 5
    bag(h);
    expect(h.status).toBe('bagged');
    const before = JSON.stringify(h);
    expect(flip(h, 2)).toBe(false);
    expect(JSON.stringify(h)).toBe(before);
  });

  it('out-of-range indices return false and leave the hand unchanged', () => {
    const h = newHand(mulberry32(7));
    const before = JSON.stringify(h);
    expect(flip(h, -1)).toBe(false);
    expect(flip(h, 12)).toBe(false);
    expect(flip(h, 999)).toBe(false);
    expect(JSON.stringify(h)).toBe(before);
  });

  it('flipping all nine LOOT cards auto-bags the hand', () => {
    const h = newHand(mulberry32(7));
    const lootIdx = h.cards.map((c, i) => (c.kind === 'loot' ? i : -1)).filter((i) => i >= 0);
    expect(lootIdx).toHaveLength(9);
    for (const i of lootIdx) flip(h, i);
    expect(h.status).toBe('bagged');
    expect(h.haul).toBe(LOOT_VALUES.reduce((a, b) => a + b, 0));
    expect(h.cops).toBe(0);
  });
});

describe('bag', () => {
  it('live with haul > 0 bags the hand and returns haul*2', () => {
    const h = newHand(mulberry32(7));
    flip(h, 0); // loot 5
    expect(bag(h)).toBe(10);
    expect(h.status).toBe('bagged');
  });

  it('a second bag call is a no-op returning 0', () => {
    const h = newHand(mulberry32(7));
    flip(h, 0);
    bag(h);
    expect(bag(h)).toBe(0);
  });

  it('bagging with haul 0 returns 0 and leaves the hand live', () => {
    const h = newHand(mulberry32(7));
    expect(bag(h)).toBe(0);
    expect(h.status).toBe('live');
  });
});

describe('payout — hand-computed', () => {
  it('0, 1, 16, 32', () => {
    expect(payout(0)).toBe(0);
    expect(payout(1)).toBe(2);
    expect(payout(16)).toBe(32);
    expect(payout(32)).toBe(64);
  });
});

describe('lootLeft', () => {
  it('starts at 9 and decrements only on loot flips', () => {
    const h = newHand(mulberry32(7));
    expect(lootLeft(h)).toBe(9);
    flip(h, 0); // loot
    expect(lootLeft(h)).toBe(8);
    flip(h, 1); // cop — no change
    expect(lootLeft(h)).toBe(8);
  });
});

describe('constants', () => {
  it('deck size matches the grid', () => {
    expect(GRID_W * GRID_H).toBe(LOOT_VALUES.length + COP_COUNT);
  });
  it('STAKE, PAYOUT_UNIT, COP_LIMIT, COP_COUNT pinned per the frozen contract', () => {
    expect(STAKE).toBe(30);
    expect(PAYOUT_UNIT).toBe(2);
    expect(COP_COUNT).toBe(3);
    expect(COP_LIMIT).toBe(3);
  });
});

describe('geometry — cardFlipScreen constants stay inside the body window', () => {
  it('grid dims match the deck size', () => {
    expect(GRID_W * GRID_H).toBe(LOOT_VALUES.length + COP_COUNT);
  });
  it('every card fits inside the body window (y 26..118, x 4..155)', () => {
    for (const x of CARD_X) expect(x + CARD_W).toBeLessThanOrEqual(155);
    for (const y of CARD_Y) expect(y + CARD_H).toBeLessThanOrEqual(118);
  });
  it('CARD_X/CARD_Y column/row counts match the grid', () => {
    expect(CARD_X).toHaveLength(GRID_W);
    expect(CARD_Y).toHaveLength(GRID_H);
  });
});

describe('text budget — footer/blurb literals fit 17 glyphs', () => {
  it('deal-view rules blurb, deal/table footers, and the LOOT/BUSTED results fit', () => {
    const literals = [
      '9 LOOT. 3 COPS.',
      '3RD COP = BUST.',
      'B BAGS THE HAUL.',
      'A:DEAL  B:LEAVE',
      'NEED 30 COINS.',
      'BUSTED! COPS 3/3',
      // the plan's first draft was 'FOLDED. STAKE GONE.' (19) — caught by
      // worker A against this very budget, re-frozen at 17 by the main loop
      'FOLD. STAKE GONE.',
    ];
    for (const s of literals) expect(s.length, s).toBeLessThanOrEqual(17);
    // 'CLEAN SWEEP! +' + payout and 'BAGGED +' + payout + '!' are dynamic;
    // the largest payout is payout(32)=64 (2 digits), so both stay well
    // under budget.
    expect(('CLEAN SWEEP! +' + payout(32)).length).toBeLessThanOrEqual(17);
    expect(('BAGGED +' + payout(32) + '!').length).toBeLessThanOrEqual(17);
  });
});
