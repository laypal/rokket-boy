// F43 STA.1 — the pure status module (src/systems/status.ts). Engine-free,
// rng injected: pins the exact rng-consumption contract the battle.ts hard
// rule leans on (no roll when there's nothing to roll for).
import { describe, it, expect } from 'vitest';
import {
  tryInflict,
  poisonDamage,
  beforeAction,
  statusCatchMod,
  STATUS_LINES,
  PAR_SKIP,
} from '../src/systems/status';
import { SPECIES } from '../src/data/mons';
import type { MonInstance, MoveDef } from '../src/types';

/** A scripted rng that returns each of `vals` in order, then 0.5 forever —
 *  and counts how many times it was called (the rng-order pin). */
function seq(vals: number[]): { rng: () => number; calls: () => number } {
  let i = 0;
  let n = 0;
  return { rng: () => (n++, vals[i++] ?? 0.5), calls: () => n };
}

function mon(status?: 'PSN' | 'PAR' | 'SLP', sleepT?: number): MonInstance {
  return { species: 'koffink', lv: 5, hp: 20, xp: 0, moves: ['tackle'], status, sleepT };
}
function moveWithStatus(id: 'PSN' | 'PAR' | 'SLP', chance: number): MoveDef {
  return { id: 'dbg', name: 'DBG', type: 'NORMAL', power: 10, acc: 1, anim: 'rings', desc: '', status: { id, chance } };
}
const plainMove: MoveDef = { id: 'tackle', name: 'TACKLE', type: 'NORMAL', power: 10, acc: 1, anim: 'lunge', desc: '' };

describe('tryInflict', () => {
  it('a move with no status field never rolls and never inflicts', () => {
    const { rng, calls } = seq([]);
    expect(tryInflict(mon(), plainMove, rng)).toBe(false);
    expect(calls()).toBe(0);
  });

  it('a target that already carries a status refuses without rolling', () => {
    const { rng, calls } = seq([]);
    expect(tryInflict(mon('PAR'), moveWithStatus('PSN', 1), rng)).toBe(false);
    expect(calls()).toBe(0);
  });

  it('chance 0.3: rng 0.29 hits, rng 0.3 misses (strict <)', () => {
    expect(tryInflict(mon(), moveWithStatus('PSN', 0.3), seq([0.29]).rng)).toBe(true);
    expect(tryInflict(mon(), moveWithStatus('PSN', 0.3), seq([0.3]).rng)).toBe(false);
  });

  it('chance 1 never rolls for the chance itself (PSN: zero rng calls)', () => {
    const { rng, calls } = seq([]);
    expect(tryInflict(mon(), moveWithStatus('PSN', 1), rng)).toBe(true);
    expect(calls()).toBe(0);
  });

  it('SLP sets sleepT in 1..3 via rollInt, driven off the sleep roll (chance 1: one rng call)', () => {
    const low = mon();
    expect(tryInflict(low, moveWithStatus('SLP', 1), seq([0]).rng)).toBe(true);
    expect(low.status).toBe('SLP');
    expect(low.sleepT).toBe(1);

    const high = mon();
    const { rng, calls } = seq([0.9999]);
    expect(tryInflict(high, moveWithStatus('SLP', 1), rng)).toBe(true);
    expect(high.sleepT).toBe(3);
    expect(calls()).toBe(1); // just the sleep roll — chance 1 skipped its own roll
  });
});

describe('poisonDamage', () => {
  it('floors max/8, minimum 1', () => {
    expect(poisonDamage(mon('PSN'), 8)).toBe(1);
    expect(poisonDamage(mon('PSN'), 7)).toBe(1); // floor(7/8)=0, clamped to 1
    expect(poisonDamage(mon('PSN'), 100)).toBe(12);
  });
  it('is 0 for any non-PSN state', () => {
    expect(poisonDamage(mon(), 100)).toBe(0);
    expect(poisonDamage(mon('PAR'), 100)).toBe(0);
    expect(poisonDamage(mon('SLP'), 100)).toBe(0);
  });
});

describe('beforeAction', () => {
  it('SLP with sleepT 2 skips and decrements to 1', () => {
    const m = mon('SLP', 2);
    expect(beforeAction(m, seq([]).rng)).toBe('skip');
    expect(m.status).toBe('SLP');
    expect(m.sleepT).toBe(1);
  });
  it('SLP with sleepT 1 wakes: status and sleepT cleared', () => {
    const m = mon('SLP', 1);
    expect(beforeAction(m, seq([]).rng)).toBe('wake');
    expect(m.status).toBeUndefined();
    expect(m.sleepT).toBeUndefined();
  });
  it('PAR: rng 0.24 skips (< PAR_SKIP), 0.25 acts', () => {
    expect(PAR_SKIP).toBe(0.25);
    expect(beforeAction(mon('PAR'), seq([0.24]).rng)).toBe('skip');
    expect(beforeAction(mon('PAR'), seq([0.25]).rng)).toBe('act');
  });
  it('a healthy mon acts without rolling', () => {
    const { rng, calls } = seq([]);
    expect(beforeAction(mon(), rng)).toBe('act');
    expect(calls()).toBe(0);
  });
});

describe('statusCatchMod', () => {
  it('the table: SLP ×2, PAR/PSN ×1.5, healthy ×1', () => {
    expect(statusCatchMod('SLP')).toBe(2);
    expect(statusCatchMod('PAR')).toBe(1.5);
    expect(statusCatchMod('PSN')).toBe(1.5);
    expect(statusCatchMod(undefined)).toBe(1);
  });
});

describe('STATUS_LINES fits the battle box', () => {
  // Every species name plus a worst-case 10-glyph nick — the box is 3 lines
  // × 17 glyphs (content-lint's own idiom for battle-text pages).
  const speciesNames = Object.values(SPECIES).map((sp) => sp.name);
  const names = [
    ...speciesNames,
    'ABCDEFGHIJ',
    ...speciesNames.map((n) => 'Wild ' + n), // foeLabel(b) prefixes — battle.ts
    ...speciesNames.map((n) => 'Enemy ' + n),
  ];
  function checkPage(page: string[], label: string): void {
    expect(page.length, label).toBeLessThanOrEqual(3);
    for (const line of page) expect(line.length, `${label}: "${line}"`).toBeLessThanOrEqual(17);
  }
  it('every page fits for every name', () => {
    for (const name of names) {
      checkPage(STATUS_LINES.inflict.PSN(name), `inflict.PSN(${name})`);
      checkPage(STATUS_LINES.inflict.PAR(name), `inflict.PAR(${name})`);
      checkPage(STATUS_LINES.inflict.SLP(name), `inflict.SLP(${name})`);
      checkPage(STATUS_LINES.skip.PAR(name), `skip.PAR(${name})`);
      checkPage(STATUS_LINES.skip.SLP(name), `skip.SLP(${name})`);
      checkPage(STATUS_LINES.wake(name), `wake(${name})`);
      checkPage(STATUS_LINES.poison(name), `poison(${name})`);
    }
  });
});
