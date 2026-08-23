// SIDE.7 / SIDE.7-FB lints/units: the LEVEL CANDY jackpot item, its seeded
// odds, the stake gate and prize table, and the special machine's tile/
// script wiring. Mirrors item-data-lint.test.ts / quest.test.ts's checkCond
// pattern and ch2-content.test.ts's runScript-with-hooks-stub pattern rather
// than inventing new shapes.
import { describe, it, expect, beforeEach } from 'vitest';
import { runScript, type ScriptHooks } from '../src/systems/script';
import { ITEMS } from '../src/data/items';
import { SHOPS } from '../src/data/shops';
import { checkCond, quest, resetQuest, varRoll } from '../src/systems/quest';
import { TILES, T } from '../src/data/tiles';
import { cornerScripts } from '../src/data/dialog/corner';
import type { Cond, ScriptStep } from '../src/types';

beforeEach(() => resetQuest());

/** Same stub shape as ch2-content.test.ts's eventHooks() — every hook pushes
 *  into one ordered log so sequencing (say vs sysMsg vs sfx) is inspectable. */
function eventHooks() {
  const events: string[] = [];
  const hooks: ScriptHooks = {
    say: (_p, done) => { events.push('say'); done(); },
    battle: (id, done) => { events.push('battle:' + id); done(null); },
    warp: (_w, done) => done(),
    sfx: (n) => events.push('sfx:' + n),
    music: (n) => events.push('music:' + n),
    setTile: () => {},
    addWarp: () => {},
    locker: (done) => done(),
    shop: (id, done) => { events.push('shop:' + id); done(); },
    endScreen: () => events.push('endScreen'),
    rankUp: (_r, done) => { events.push('rankUp'); done(); },
    heat: () => {},
    giveMon: () => {},
    npcRun: (id, done) => { events.push('npcRun:' + id); done(); },
    healParty: () => events.push('healParty'),
    sysMsg: () => events.push('sysMsg'),
    jobs: (done) => { events.push('jobs'); done(); },
    cardFlip: (done) => { events.push('cardFlip'); done(); },
    tour: (_stops, done) => { events.push('tour'); done(); },
    choice: (_p, done) => { events.push('choice'); done(true); },
  };
  return { hooks, events };
}

describe('LEVEL CANDY item (SIDE.7)', () => {
  it('is a priceless candy with the frozen desc', () => {
    const candy = ITEMS['LEVEL CANDY'];
    expect(candy).toBeDefined();
    expect(candy.kind).toBe('candy');
    expect(candy.price).toBe(0);
    expect(candy.desc).toBe('UP ONE LEVEL.');
  });

  it('is never stocked by any shop — jackpot-only keeps it special', () => {
    for (const [shopId, shop] of Object.entries(SHOPS)) {
      expect(shop.stock, `${shopId} stocks LEVEL CANDY`).not.toContain('LEVEL CANDY');
    }
  });
});

describe('varRoll (SIDE.7 seeded jackpot odds)', () => {
  it('is deterministic: the same spin number always rolls the same outcome', () => {
    const first = varRoll(23, 0.04);
    for (let i = 0; i < 5; i++) expect(varRoll(23, 0.04)).toBe(first);
  });

  // Pinned so the e2e/BDD spin count never drifts silently — this is the
  // "documented seed" number the SIDE.7 card asks to be recorded. SIDE.7-FB
  // keeps this pin: the candy threshold (0.04) and the seed formula are
  // unchanged, only the machine now costs a stake to reach each spin.
  it('the first winning spin under 4% odds is spin 23', () => {
    let firstWin = -1;
    for (let n = 1; n <= 1000; n++) {
      if (varRoll(n, 0.04)) { firstWin = n; break; }
    }
    expect(firstWin).toBe(23);
  });

  it('checkCond reads the varRoll Cond against quest.vars', () => {
    quest.vars.slotSpins = 23;
    expect(checkCond({ varRoll: ['slotSpins', 0.04] })).toBe(true);
    quest.vars.slotSpins = 1;
    expect(checkCond({ varRoll: ['slotSpins', 0.04] })).toBe(false);
    // unset var defaults to 0, which never wins at spin 0
    delete quest.vars.slotSpins;
    expect(checkCond({ varRoll: ['slotSpins', 0.04] })).toBe(false);
  });
});

describe('coinsAtLeast Cond (SIDE.7-FB)', () => {
  it('reads quest.coins against the threshold', () => {
    quest.coins = 2;
    expect(checkCond({ coinsAtLeast: 2 })).toBe(true);
    quest.coins = 1;
    expect(checkCond({ coinsAtLeast: 2 })).toBe(false);
    quest.coins = 0;
    expect(checkCond({ coinsAtLeast: 2 })).toBe(false);
  });
});

/** Walks the SAME nested if/varRoll chain the interpreter walks (the `then`
 *  of the coinsAtLeast gate, then each `if.varRoll`'s `else`), returning the
 *  outcome tier for spin `n` exactly as tile:Q's script data would produce
 *  it. Kept separate from the script's own varRoll calls so this is a check
 *  ON the data, not a restatement of it — the script data still drives the
 *  ascending-thresholds test below. */
function tierForSpin(n: number): 'candy' | 'ten' | 'five' | 'one' | 'nothing' {
  if (varRoll(n, 0.04)) return 'candy';
  if (varRoll(n, 0.10)) return 'ten';
  if (varRoll(n, 0.25)) return 'five';
  if (varRoll(n, 0.55)) return 'one';
  return 'nothing';
}

describe('the Q machine prize table (SIDE.7-FB)', () => {
  it('spins 1..200: candy still wins first at spin 23, every tier appears, counts land in the expected bands', () => {
    const counts = { candy: 0, ten: 0, five: 0, one: 0, nothing: 0 };
    let firstCandy = -1;
    for (let n = 1; n <= 200; n++) {
      const tier = tierForSpin(n);
      counts[tier]++;
      if (tier === 'candy' && firstCandy === -1) firstCandy = n;
    }
    expect(firstCandy).toBe(23);
    // every tier appears at least once over 200 spins
    for (const tier of Object.keys(counts) as (keyof typeof counts)[]) {
      expect(counts[tier], `tier ${tier} never hit`).toBeGreaterThan(0);
    }
    // loose bands around the nominal 4/6/15/30/45% split — wide enough to
    // absorb the seeded PRNG's sample noise at n=200, tight enough to catch
    // a threshold typo (e.g. bands swapped or a decade off).
    expect(counts.candy).toBeGreaterThanOrEqual(1);
    expect(counts.candy).toBeLessThanOrEqual(20);
    expect(counts.ten).toBeGreaterThanOrEqual(2);
    expect(counts.ten).toBeLessThanOrEqual(30);
    expect(counts.five).toBeGreaterThanOrEqual(10);
    expect(counts.five).toBeLessThanOrEqual(55);
    expect(counts.one).toBeGreaterThanOrEqual(20);
    expect(counts.one).toBeLessThanOrEqual(80);
    expect(counts.nothing).toBeGreaterThanOrEqual(60);
    expect(counts.nothing).toBeLessThanOrEqual(140);
    expect(counts.candy + counts.ten + counts.five + counts.one + counts.nothing).toBe(200);
  });

  it('the nested varRoll thresholds in the script data are in ascending order', () => {
    const script = cornerScripts['tile:Q'];
    const gate = script.find((s): s is { if: Cond; then: ScriptStep[]; else?: ScriptStep[] } => 'if' in s);
    expect(gate).toBeDefined();
    expect(gate!.if).toEqual({ coinsAtLeast: 2 });

    // walk gate.then's nested if/varRoll -> else -> if/varRoll chain
    const thresholds: number[] = [];
    let steps: ScriptStep[] = gate!.then;
    for (let guard = 0; guard < 10; guard++) {
      const ifStep = steps.find((s): s is { if: Cond; then: ScriptStep[]; else?: ScriptStep[] } => 'if' in s && 'varRoll' in s.if);
      if (!ifStep) break;
      const cond = ifStep.if as { varRoll: [string, number] };
      thresholds.push(cond.varRoll[1]);
      steps = ifStep.else ?? [];
    }
    expect(thresholds).toEqual([0.04, 0.10, 0.25, 0.55]);
    for (let i = 1; i < thresholds.length; i++) {
      expect(thresholds[i]).toBeGreaterThan(thresholds[i - 1]);
    }
  });

  it('refuses the spin (no spend, no roll) when coins < 2', () => {
    quest.coins = 1;
    const { hooks, events } = eventHooks();
    runScript(cornerScripts['tile:Q'], hooks);
    expect(events).toEqual(['say']);
    expect(quest.coins).toBe(1);
    expect(quest.vars.slotSpins ?? 0).toBe(0);
    expect(quest.items).toEqual([]);
  });

  it('spends the stake and grants LEVEL CANDY on the pinned winning spin', () => {
    quest.coins = 2;
    quest.vars.slotSpins = 22; // next spin (incVar -> 23) is the pinned candy win
    const { hooks, events } = eventHooks();
    runScript(cornerScripts['tile:Q'], hooks);
    expect(quest.coins).toBe(0); // staked 2, candy tier adds no coins
    expect(quest.vars.slotSpins).toBe(23);
    expect(quest.items).toContain('LEVEL CANDY');
    expect(events).toContain('sysMsg');
    expect(events).toContain('sfx:coin');
    expect(events).toContain('sfx:item');
  });
});

describe('the special machine tile + script (SIDE.7-FB)', () => {
  it("tile char 'Q' maps to its OWN CANDY_A/CANDY_B frames, distinct from the ordinary M bank's SLOT_A/SLOT_B", () => {
    expect(TILES['Q']).toEqual([T.CANDY_A, T.CANDY_B]);
    expect(T.CANDY_A).not.toEqual(T.SLOT_A);
    expect(T.CANDY_B).not.toEqual(T.SLOT_B);
    expect(TILES['M']).toEqual([T.SLOT_A, T.SLOT_B]); // untouched
  });

  it("tile:Q's script grants LEVEL CANDY on the winning roll, behind the coinsAtLeast gate", () => {
    const script = cornerScripts['tile:Q'];
    expect(script).toBeDefined();
    const gate = script.find((s) => 'if' in s);
    expect(gate && 'if' in gate).toBe(true);
    if (gate && 'if' in gate) {
      expect(gate.if).toEqual({ coinsAtLeast: 2 });
      const spinStep = gate.then.find((s) => 'if' in s && 'varRoll' in s.if);
      expect(spinStep).toBeDefined();
      if (spinStep && 'if' in spinStep) {
        expect(spinStep.if).toEqual({ varRoll: ['slotSpins', 0.04] });
        const givesCandy = spinStep.then.some((s) => 'giveItem' in s && s.giveItem === 'LEVEL CANDY');
        expect(givesCandy).toBe(true);
      }
    }
  });
});
