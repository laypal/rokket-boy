// F43 BALL.2 — the MAZTER BALL. Lints (exactly one giveItem across every
// script container in the game — maps + encounters) plus the item-def
// rules and the clerk's once-only grant, run through the real script
// interpreter. The walker is helpers/script-registry.ts (a plain .ts, not
// *.test.ts) — importing another *.test.ts file re-runs its describe/it
// blocks inside THIS file's collection context and double-registers tests
// (caught in review: sure-ball reported 31 tests instead of its own 9).
import { describe, it, expect, afterEach } from 'vitest';
import { MAPS } from '../src/data/maps';
import { SHOPS } from '../src/data/shops';
import { ITEMS } from '../src/data/items';
import { canSell, usableInBattle } from '../src/systems/inventory';
import { runScript, type ScriptHooks } from '../src/systems/script';
import { quest, resetQuest, setDexMons, currentObjective, checkCond } from '../src/systems/quest';
import { hqScripts } from '../src/data/dialog/hq';
import { buildRegistry } from './helpers/script-registry';
import type { ScriptStep } from '../src/types';

const ID = 'MAZTER BALL';
const REG = buildRegistry();

/** Every step in a script tree, depth-first (then/else/choice included) —
 *  local copy of ch7-contracts.test.ts's helper (importing a *.test.ts
 *  double-registers its describe/it blocks, see header comment above). */
function flatten(steps: ScriptStep[]): ScriptStep[] {
  const out: ScriptStep[] = [];
  for (const s of steps) {
    out.push(s);
    if ('if' in s) out.push(...flatten(s.then), ...flatten(s.else ?? []));
    if ('choice' in s) out.push(...flatten(s.choice.yes), ...flatten(s.choice.no ?? []));
  }
  return out;
}

// The 15-line dex fixture (F43 BALL.2's own comment explains the count) —
// shared by the clerk-grant tests below and the objective-machine test.
const FIFTEEN = [
  'koffink', 'voltorbb', 'ratikatt', 'zubatt', 'geodood', 'ekanzz', 'gastlee',
  'drowzey', 'machopp', 'magnemyt', 'myowth', 'ratikate', 'voltrawk',
  'wheezink', 'electrod',
].map((species) => ({ species }));

// Every flag CH1–CH7 need to be "done" (copied from ch7-contracts.test.ts's
// CH7.0 §8 objectives describe) so currentObjective()/todoIf reach the dex15
// step at all — first-unmet semantics walk every earlier chapter first.
function afterCh7(): void {
  for (const f of [
    'briefed', 'guardBeaten', 'switchFound', 'lootTaken', 'missionDone',
    'fossilsTaken', 'bradBeaten', 'ch2Done', 'spanLass', 'ch3Done',
    'ch4Suit', 'ch4Safe', 'ch4Done', 'ch5Spirit', 'ch5Mask', 'ch5Done',
    'ch6Rules', 'ch6Duo', 'ch6Ball', 'ch6Done',
    'ch7Rules', 'ch7Cell', 'ch7Caught', 'ch7Done',
  ] as const) quest.flags[f] = true;
  quest.items.push('SILF SCOPE', 'CARD KEY', 'RUBBER BOOTS');
}

describe('F43 BALL.2 lints', () => {
  it('exactly one giveItem MAZTER BALL exists across every script container', () => {
    expect(REG.giveItems.filter((r) => r.id === ID)).toHaveLength(1);
  });

  it('no shop stocks it', () => {
    for (const shop of Object.values(SHOPS)) expect(shop.stock).not.toContain(ID);
  });

  it('no map pickup grants it', () => {
    for (const map of Object.values(MAPS)) {
      for (const pickup of Object.values(map.items)) expect(pickup.item).not.toBe(ID);
    }
  });

  it('item def: unsellable, usable in battle, ball/price0/ballMod-Infinity', () => {
    expect(canSell(ID)).toBe(false);
    expect(usableInBattle(ID)).toBe(true);
    expect(ITEMS[ID]).toMatchObject({ kind: 'ball', price: 0, ballMod: Infinity });
  });
});

describe('F43 BALL.2 the GRUNTDEX clerk grant', () => {
  afterEach(() => setDexMons(() => []));

  function makeHooks() {
    const sysMsgs: string[][] = [];
    const hooks: ScriptHooks = {
      say: (_pages, done) => done(),
      battle: (_id, done) => done(null),
      warp: (_w, done) => done(),
      sfx: () => {},
      fx: () => {},
      music: () => {},
      setTile: () => {},
      addWarp: () => {},
      locker: (done) => done(),
      shop: (_id, done) => done(),
      endScreen: () => {},
      rankUp: (_newRank, done) => done(),
      heat: () => {},
      giveMon: () => {},
      npcRun: (_id, done) => done(),
      healParty: () => {},
      sysMsg: (lines) => sysMsgs.push(lines),
      jobs: (done) => done(),
      cardFlip: (done) => done(),
      tour: (_stops, done) => done(),
      choice: (_p, done) => done(true),
    };
    return { hooks, sysMsgs };
  }
  // FIFTEEN is module-scoped above (13 base non-target species plus
  // wheezink/electrod, whose pre-evos koffink/voltorbb are already in the
  // list — mon.ts dexCount credits a line back to its base, so this set is
  // exactly 15, not 15+; ratikate stands in for marowl, bossOnly).

  // dex.test.ts's COMPLETE fixture, inlined (dropped its export — importing
  // another *.test.ts file is the double-registration bug above): 14 picks
  // that credit all 22 species via mon.ts's evolved->pre-evolution line
  // credit (dexComplete true).
  const FULL_DEX = ['arbok', 'ratikate', 'golbatt', 'gravlr', 'koffink', 'voltorbb', 'wheezink', 'hauntor', 'myowth', 'hypnoz', 'machoke', 'magnetun', 'electrod', 'voltrawk'].map((species) => ({ species }));

  function talk(): { sysMsgs: string[][]; said: string[][][] } {
    const { hooks, sysMsgs } = makeHooks();
    const said: string[][][] = [];
    runScript(hqScripts['npc:dexclerk'], { ...hooks, say: (pages, done) => { said.push(pages); done(); } });
    return { sysMsgs, said };
  }

  it('grants once at 15 lines once ch7Done, before the dexmaster egg check', () => {
    resetQuest();
    setDexMons(() => FIFTEEN);
    quest.flags.ch7Done = true;
    const first = talk();
    expect(quest.items).toEqual([ID]);
    expect(quest.flags.sureBall).toBe(true);
    expect(first.sysMsgs).toEqual([['MAZTER BALL', 'RECEIVED!']]);
  });

  it('one reward a talk: a 22/22 dex + ch7Done gets the ball first, the dexmaster egg on the next talk', () => {
    // The grant is the script's first step and the egg/dexComplete/pitch
    // chain lives in its else — so the clerk never pays twice in one breath.
    resetQuest();
    setDexMons(() => FULL_DEX);
    quest.flags.ch7Done = true;
    const first = talk();
    expect(quest.items).toEqual([ID]);
    expect(quest.flags.sureBall).toBe(true);
    expect(quest.eggs.has('dexmaster')).toBe(false);
    expect(first.sysMsgs).toEqual([['MAZTER BALL', 'RECEIVED!']]);
    const second = talk();
    expect(quest.eggs.has('dexmaster')).toBe(true);
    expect(second.sysMsgs).toEqual([['EGG FOUND!']]);
  });

  it('a dexmaster egg held before CH7 finishes: talk gives the ball once; a second talk is the brush-off', () => {
    resetQuest();
    quest.eggs.add('dexmaster'); // paid out on an earlier, pre-CH7 22/22 run
    setDexMons(() => FIFTEEN);
    quest.flags.ch7Done = true;
    const first = talk();
    expect(quest.items).toEqual([ID]);
    expect(quest.flags.sureBall).toBe(true);
    expect(first.said.flat()).not.toContainEqual(['CLERK: Paid you', 'already. Go steal', 'something.']); // the ball alone, no brush-off in the same breath

    const second = talk();
    expect(second.said).toEqual([[['CLERK: Paid you', 'already. Go steal', 'something.']]]);
    expect(quest.items).toEqual([ID]); // no second grant
  });

  it('gives nothing with only 14 lines', () => {
    resetQuest();
    setDexMons(() => FIFTEEN.slice(0, 14));
    quest.flags.ch7Done = true;
    talk();
    expect(quest.items).toEqual([]);
  });

  it('gives nothing before ch7Done, even at 15 lines', () => {
    resetQuest();
    setDexMons(() => FIFTEEN);
    talk();
    expect(quest.items).toEqual([]);
  });

  it('after the grant, the pitch no longer carries the hint page', () => {
    resetQuest();
    setDexMons(() => FIFTEEN); // 15, not the full 22 — dex not complete, still gets the pitch branch
    quest.flags.ch7Done = true;
    talk(); // grants the ball
    const { said } = talk();
    expect(said).toEqual([[
      ['CLERK: GRUNTDEX', 'desk. Fill it', 'and I pay out.'],
      ['Every line. Not', 'just the cute', 'ones.'],
    ]]);
  });
});

describe('F43-FB.1 the dex15 objective machine', () => {
  afterEach(() => setDexMons(() => []));

  it("'CATCH 15 LINES' at 14 lines, 'SEE THE DEX CLERK' at 15, 'AWAIT ORDERS.' once sureBall", () => {
    resetQuest();
    afterCh7();
    setDexMons(() => FIFTEEN.slice(0, 14));
    expect(currentObjective()).toBe('CATCH 15 LINES');
    setDexMons(() => FIFTEEN);
    expect(currentObjective()).toBe('SEE THE DEX CLERK');
    quest.flags.sureBall = true;
    expect(currentObjective()).toBe('AWAIT ORDERS.');
  });
});

describe('F43-FB.1 the dexclerk `!` marker (todoIf)', () => {
  afterEach(() => setDexMons(() => []));
  const dexclerk = MAPS.hq.npcs.find((n) => n.id === 'dexclerk')!;

  it('false at 14 lines even with ch7Done', () => {
    resetQuest();
    quest.flags.ch7Done = true;
    setDexMons(() => FIFTEEN.slice(0, 14));
    expect(checkCond(dexclerk.todoIf!)).toBe(false);
  });

  it('false at 15 lines without ch7Done', () => {
    resetQuest();
    setDexMons(() => FIFTEEN);
    expect(checkCond(dexclerk.todoIf!)).toBe(false);
  });

  it('true at 15 lines once ch7Done', () => {
    resetQuest();
    quest.flags.ch7Done = true;
    setDexMons(() => FIFTEEN);
    expect(checkCond(dexclerk.todoIf!)).toBe(true);
  });

  it('false again once the clerk has paid out', () => {
    resetQuest();
    quest.flags.ch7Done = true;
    setDexMons(() => FIFTEEN);
    const hooks: ScriptHooks = {
      say: (_pages, done) => done(),
      battle: (_id, done) => done(null),
      warp: (_w, done) => done(),
      sfx: () => {},
      fx: () => {},
      music: () => {},
      setTile: () => {},
      addWarp: () => {},
      locker: (done) => done(),
      shop: (_id, done) => done(),
      endScreen: () => {},
      rankUp: (_newRank, done) => done(),
      heat: () => {},
      giveMon: () => {},
      npcRun: (_id, done) => done(),
      healParty: () => {},
      sysMsg: () => {},
      jobs: (done) => done(),
      cardFlip: (done) => done(),
      tour: (_stops, done) => done(),
      choice: (_p, done) => done(true),
    };
    runScript(hqScripts['npc:dexclerk'], hooks); // grants the MAZTER BALL, sets sureBall
    expect(checkCond(dexclerk.todoIf!)).toBe(false);
  });
});

describe('F43-FB.1 the CH7 briefing announces the side quest', () => {
  it('one say page mentions GRUNTDEX and 15, every line ≤17 glyphs', () => {
    const steps = flatten(hqScripts['npc:giovanni']);
    const sayPages = steps.filter((s): s is Extract<ScriptStep, { say: unknown }> => 'say' in s);
    const hit = sayPages.find((s) => s.say.some((page) => page.some((line) => line.includes('GRUNTDEX'))));
    expect(hit, 'no briefing page mentions GRUNTDEX').toBeDefined();
    const page = hit!.say.find((p) => p.some((line) => line.includes('GRUNTDEX')))!;
    expect(page.join(' ')).toContain('15');
    for (const line of page) expect(line.length).toBeLessThanOrEqual(17);
  });
});
