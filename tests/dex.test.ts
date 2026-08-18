// SIDE.4: GRUNTDEX completion. The predicate is the STATUS readout's own
// rule (SPR.0 line credit — dexCount) compared with the registry size, and
// scripts reach it through the `{ dexComplete: true }` Cond, which reads
// the party+box through quest.setDexMons so quest.ts stays engine-free.
// Worker C appends the clerk-content tests below the predicate block.
import { describe, it, expect, beforeEach } from 'vitest';
import { dexComplete } from '../src/systems/dex';
import { dexCount } from '../src/systems/mon';
import { SPECIES } from '../src/data/mons';
import { quest, resetQuest, checkCond, setDexMons } from '../src/systems/quest';
import { runScript, type ScriptHooks } from '../src/systems/script';
import { hqScripts } from '../src/data/dialog/hq';
import { hqMap } from '../src/data/maps/hq';

const m = (species: string) => ({ species });
/** Six mons that credit every current species under line credit: each
 *  evolved form walks back to its base, koffink/voltorbb are standalone. */
const COMPLETE = ['arbok', 'ratikate', 'golbatt', 'gravlr', 'koffink', 'voltorbb'].map(m);

describe('dexComplete (SIDE.4)', () => {
  it('is false for an empty collection', () => {
    expect(dexComplete([], SPECIES)).toBe(false);
  });

  it('is false one line short, true when every species id is credited', () => {
    const short = COMPLETE.filter((x) => x.species !== 'voltorbb');
    expect(dexCount(short, SPECIES)).toBe(Object.keys(SPECIES).length - 1);
    expect(dexComplete(short, SPECIES)).toBe(false);
    expect(dexComplete(COMPLETE, SPECIES)).toBe(true);
  });

  it('stays true when base forms are also present (duplicates never subtract)', () => {
    expect(dexComplete([...COMPLETE, m('ratikatt'), m('koffink')], SPECIES)).toBe(true);
  });

  it('a base form alone does NOT credit its evolution (the fixture must hold the evolved mon)', () => {
    const bases = ['ekanzz', 'ratikatt', 'zubatt', 'geodood', 'koffink', 'voltorbb'].map(m);
    expect(dexComplete(bases, SPECIES)).toBe(false);
  });
});

describe('{ dexComplete: true } Cond reads the registered mons provider', () => {
  beforeEach(() => {
    resetQuest();
    setDexMons(() => []);
  });

  it('false with no provider set / an empty collection', () => {
    expect(checkCond({ dexComplete: true })).toBe(false);
  });

  it('true once the provider returns a complete collection', () => {
    setDexMons(() => COMPLETE);
    expect(checkCond({ dexComplete: true })).toBe(true);
    expect(quest.eggs.has('dexmaster')).toBe(false); // the Cond grants nothing itself
  });
});

// SIDE.4: the HQ desk clerk — pure data behind the { dexComplete: true }
// Cond, so this is content coverage (real script, fake hooks), the same
// idiom as training-content.test.ts.
const PARTIAL = COMPLETE.filter((x) => x.species !== 'voltorbb');

function dexclerkHooks() {
  const said: string[][] = [];
  const sfx: string[] = [];
  const sysMsg: string[][] = [];
  const hooks: ScriptHooks = {
    say: (pages, done) => { said.push(...pages); done(); },
    battle: (_id, done) => done(null),
    warp: (_w, done) => done(),
    sfx: (name) => sfx.push(name),
    music: () => {},
    setTile: () => {},
    addWarp: () => {},
    locker: (done) => done(),
    shop: (_id, done) => done(),
    endScreen: () => {},
    rankUp: (_r, done) => done(),
    heat: () => {},
    giveMon: () => {},
    npcRun: (_id, done) => done(),
    healParty: () => {},
    sysMsg: (lines) => sysMsg.push(lines),
    jobs: (done) => done(),
    cardFlip: (done) => done(),
    choice: (_p, done) => done(true),
  };
  return { hooks, said, sfx, sysMsg };
}

describe('npc:dexclerk (SIDE.4)', () => {
  beforeEach(() => {
    resetQuest();
    setDexMons(() => []);
  });

  it('a complete dex pays out once: egg granted, sfx + sysMsg fire, the payout pages said', () => {
    setDexMons(() => COMPLETE);
    const { hooks, said, sfx, sysMsg } = dexclerkHooks();
    runScript(hqScripts['npc:dexclerk'], hooks);
    expect(quest.eggs.has('dexmaster')).toBe(true);
    expect(sfx).toEqual(['item']);
    expect(sysMsg).toEqual([['EGG FOUND!']]);
    expect(said).toEqual([
      ['CLERK: Every line', 'in the GRUNTDEX.', "Didn't think so."],
      ['Take the egg.', "Don't ask what's", 'in it.'],
    ]);
  });

  it('a second talk after payout: no new egg, no sysMsg, the brush-off page said', () => {
    setDexMons(() => COMPLETE);
    quest.eggs.add('dexmaster');
    const sizeBefore = quest.eggs.size;
    const { hooks, said, sysMsg } = dexclerkHooks();
    runScript(hqScripts['npc:dexclerk'], hooks);
    expect(quest.eggs.size).toBe(sizeBefore);
    expect(sysMsg).toEqual([]);
    expect(said).toEqual([['CLERK: Paid you', 'already. Go steal', 'something.']]);
  });

  it('a partial dex (voltorbb missing): no egg, no sysMsg, the desk pitch said', () => {
    setDexMons(() => PARTIAL);
    const { hooks, said, sfx, sysMsg } = dexclerkHooks();
    runScript(hqScripts['npc:dexclerk'], hooks);
    expect(quest.eggs.has('dexmaster')).toBe(false);
    expect(sfx).toEqual([]);
    expect(sysMsg).toEqual([]);
    expect(said).toEqual([
      ['CLERK: GRUNTDEX', 'desk. Fill it', 'and I pay out.'],
      ['Every line. Not', 'just the cute', 'ones.'],
    ]);
  });

  it('hqMap places the clerk on a floor cell shared with no other NPC', () => {
    const clerk = hqMap.npcs.find((n) => n.id === 'dexclerk');
    expect(clerk).toBeDefined();
    const row = hqMap.grid[clerk!.y];
    expect(row[clerk!.x]).toBe(' ');
    const sharing = hqMap.npcs.filter((n) => n.x === clerk!.x && n.y === clerk!.y);
    expect(sharing).toHaveLength(1);
  });
});
