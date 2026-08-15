// RNK.0 — the perk contract (spec 2026-08-10 §1, PLAN 2026-08-14 evening).
// perkPct is a pure read over quest state: rank-inherent perks + owned gear,
// capped inside the function. Gear defs land with RNK.1/RNK.3 — these tests
// inject temporary gear entries so the contract is pinned before the data
// exists, and remove them so no other suite ever sees them.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { quest, resetQuest } from '../src/systems/quest';
import { perkPct, PERK_CAPS } from '../src/systems/perks';
import { ITEMS } from '../src/data/items';
import { sellPrice } from '../src/systems/inventory';
import { handInJob, boardRows } from '../src/systems/jobs';
import { buyPrice } from '../src/systems/shop';

const TEST_GEAR = ['T-VISOR', 'T-COAT', 'T-BELT', 'T-HAT'] as const;

beforeEach(() => {
  resetQuest();
  ITEMS['T-VISOR'] = { id: 'T-VISOR', kind: 'gear', price: 4000, desc: 'TEST.', perk: { kind: 'steal', pct: 0.5 } };
  ITEMS['T-COAT'] = { id: 'T-COAT', kind: 'gear', price: 0, desc: 'TEST.', perk: { kind: 'steal', pct: 1.0 } };
  ITEMS['T-BELT'] = { id: 'T-BELT', kind: 'gear', price: 3000, desc: 'TEST.', perk: { kind: 'jobs', pct: 0.25 } };
  ITEMS['T-HAT'] = { id: 'T-HAT', kind: 'gear', price: 3500, desc: 'TEST.', perk: { kind: 'shop', pct: 0.15 } };
});
afterEach(() => {
  for (const id of TEST_GEAR) delete ITEMS[id];
});

describe('perkPct — sources', () => {
  it('is 0 for every kind with no gear and rank GRUNT', () => {
    expect(perkPct('steal')).toBe(0);
    expect(perkPct('jobs')).toBe(0);
    expect(perkPct('shop')).toBe(0);
  });

  it('rank-inherent: OPERATIVE and above grants shop 10%', () => {
    quest.rank = 'AGENT';
    expect(perkPct('shop')).toBe(0);
    quest.rank = 'OPERATIVE';
    expect(perkPct('shop')).toBeCloseTo(0.1);
    quest.rank = "BOSS'S RIVAL"; // permanent — rank never goes down
    expect(perkPct('shop')).toBeCloseTo(0.1);
  });

  it('rank-inherent: EXECUTIVE and above grants jobs 25%', () => {
    quest.rank = 'LIEUTENANT';
    expect(perkPct('jobs')).toBe(0);
    quest.rank = 'EXECUTIVE';
    expect(perkPct('jobs')).toBeCloseTo(0.25);
  });

  it('an unrecognised rank (corrupt save) contributes nothing', () => {
    quest.rank = 'JANITOR';
    expect(perkPct('shop')).toBe(0);
    expect(perkPct('jobs')).toBe(0);
  });

  it('owned gear sums per kind and ignores other kinds', () => {
    quest.items.push('T-VISOR');
    expect(perkPct('steal')).toBeCloseTo(0.5);
    expect(perkPct('jobs')).toBe(0);
    quest.items.push('T-BELT');
    expect(perkPct('jobs')).toBeCloseTo(0.25);
  });

  it('duplicate copies of one piece count once', () => {
    quest.items.push('T-VISOR', 'T-VISOR', 'T-VISOR');
    expect(perkPct('steal')).toBeCloseTo(0.5);
  });

  it('rank and gear sources sum', () => {
    quest.rank = 'EXECUTIVE';
    quest.items.push('T-BELT');
    expect(perkPct('jobs')).toBeCloseTo(0.5);
  });

  it('non-gear items in the pack contribute nothing', () => {
    quest.items.push('SODA', 'ROKKET BALL', 'SMOKE BALL');
    expect(perkPct('steal')).toBe(0);
    expect(perkPct('shop')).toBe(0);
  });
});

describe('perkPct — caps (inside the function, not the call sites)', () => {
  it('steal caps at +200%', () => {
    ITEMS['T-BIG'] = { id: 'T-BIG', kind: 'gear', price: 0, desc: 'TEST.', perk: { kind: 'steal', pct: 9 } };
    quest.items.push('T-VISOR', 'T-COAT', 'T-BIG');
    expect(perkPct('steal')).toBe(PERK_CAPS.steal);
    expect(perkPct('steal')).toBe(2.0);
    delete ITEMS['T-BIG'];
  });

  it('shop caps at 40% — nothing is ever free', () => {
    ITEMS['T-FREE'] = { id: 'T-FREE', kind: 'gear', price: 0, desc: 'TEST.', perk: { kind: 'shop', pct: 9 } };
    quest.items.push('T-FREE');
    expect(perkPct('shop')).toBe(PERK_CAPS.shop);
    delete ITEMS['T-FREE'];
  });

  it('no coin arbitrage even at the shop cap: discounted buy still beats sell-back', () => {
    // buy at >=60% of base, sell-back at floor(50%) — strict profit is impossible
    const base = ITEMS['T-VISOR'].price;
    const buyAtCap = Math.floor(base * (1 - PERK_CAPS.shop));
    expect(buyAtCap).toBeGreaterThan(sellPrice('T-VISOR'));
  });
});

describe('the three call sites (RNK.0 — the entire mechanical footprint)', () => {
  it('job hand-in pays floor(payout·(1+jobs pct)) and returns what it paid', () => {
    quest.rank = 'EXECUTIVE'; // rank-inherent jobs +25%
    quest.job = { kind: 'spin', slot: 0, need: 0, payout: 100, base: 0 };
    const paid = handInJob();
    expect(paid).toBe(125);
    expect(quest.coins).toBe(125);
  });

  it('the seeded board never moves when gear changes (scaling at hand-in only)', () => {
    const before = JSON.stringify(boardRows());
    quest.items.push('T-BELT', 'T-VISOR', 'T-HAT');
    expect(JSON.stringify(boardRows())).toBe(before);
  });

  it('buyPrice applies the shop perk; zero perk state is the base price', () => {
    expect(buyPrice('SODA')).toBe(60);
    quest.items.push('T-HAT'); // shop -15%
    expect(buyPrice('SODA')).toBe(51); // floor(60 · 0.85)
    expect(sellPrice('SODA')).toBe(30); // sell-back stays on base
  });
});
