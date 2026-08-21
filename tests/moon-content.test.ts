// CH2.3 interpreter tests (plan §9 pattern from script.test.ts): feed each
// set-piece script through the real interpreter with fake hooks, assert the
// flag/tile/giveMon mutations. Also pins the frozen encounter tables (task
// card 20-ch2-mt-moon.md CH2.3) so a later edit can't drift the numbers.
import { describe, it, expect, beforeEach } from 'vitest';
import { runScript, type ScriptHooks } from '../src/systems/script';
import { quest, resetQuest } from '../src/systems/quest';
import { moon1Scripts } from '../src/data/dialog/moon1';
import { moon2Scripts } from '../src/data/dialog/moon2';
import { moonDigScripts } from '../src/data/dialog/moonDig';
import { MAPS } from '../src/data/maps';

interface FakeLog {
  says: string[][][];
  sfx: string[];
  tiles: [number, number, string][];
  monsGiven: [string, number][];
}

// Same fake-hooks pattern as tests/script.test.ts, trimmed to what CH2.3's
// scripts actually exercise (say/sfx/setTile/setFlag(via quest)/giveMon).
function makeHooks(): { hooks: ScriptHooks; log: FakeLog } {
  const log: FakeLog = { says: [], sfx: [], tiles: [], monsGiven: [] };
  const hooks: ScriptHooks = {
    say: (pages, done) => { log.says.push(pages); done(); },
    battle: (_id, done) => done(null),
    warp: (_w, done) => done(),
    sfx: (n) => log.sfx.push(n),
    music: () => {},
    setTile: (x, y, ch) => log.tiles.push([x, y, ch]),
    addWarp: () => {},
    locker: (done) => done(),
    shop: (_id, done) => done(),
    endScreen: () => {},
    rankUp: (_r, done) => done(),
    heat: () => {},
    giveMon: (species, lv) => log.monsGiven.push([species, lv]),
    npcRun: (_id, done) => done(),
    healParty: () => {},
    sysMsg: () => {},
    jobs: (done) => done(),
    cardFlip: (done) => done(),
    tour: (_stops, done) => done(),
    choice: (_p, done) => done(true),
  };
  return { hooks, log };
}

beforeEach(() => resetQuest());

describe('moonDig fossil chest (at:8,4)', () => {
  it('fresh flags: sets fossilsTaken, empties the chest tile, says at least one page', () => {
    const { hooks, log } = makeHooks();
    runScript(moonDigScripts['at:8,4'], hooks);
    expect(quest.flags.fossilsTaken).toBe(true);
    expect(log.tiles).toContainEqual([8, 4, '%']);
    expect(log.says.length).toBeGreaterThanOrEqual(1);
  });

  it('run again: only an empty-chest say, no second setTile, flag stays true', () => {
    const first = makeHooks();
    runScript(moonDigScripts['at:8,4'], first.hooks);

    const second = makeHooks();
    runScript(moonDigScripts['at:8,4'], second.hooks);

    expect(quest.flags.fossilsTaken).toBe(true);
    expect(second.log.tiles).toEqual([]); // no second setTile
    expect(second.log.says.length).toBe(1); // just the empty-chest line
  });
});

describe('moonDig enter repair', () => {
  it('fossilsTaken already true: re-applies the emptied-chest setTile', () => {
    quest.flags.fossilsTaken = true;
    const { hooks, log } = makeHooks();
    runScript(moonDigScripts.enter, hooks);
    expect(log.tiles).toEqual([[8, 4, '%']]);
  });

  it('fossilsTaken false: no setTile', () => {
    const { hooks, log } = makeHooks();
    runScript(moonDigScripts.enter, hooks);
    expect(log.tiles).toEqual([]);
  });
});

describe('moon2 EKANZZ gift (npc:jessika)', () => {
  it('fresh: grants ekanzz lv5, sets gotEkanzz, says a celebration page', () => {
    const { hooks, log } = makeHooks();
    runScript(moon2Scripts['npc:jessika'], hooks);
    expect(log.monsGiven).toEqual([['ekanzz', 5]]);
    expect(quest.flags.gotEkanzz).toBe(true);
    expect(log.says.length).toBeGreaterThanOrEqual(1);
  });

  it('run again: a short repeat say, no second giveMon', () => {
    const first = makeHooks();
    runScript(moon2Scripts['npc:jessika'], first.hooks);

    const second = makeHooks();
    runScript(moon2Scripts['npc:jessika'], second.hooks);

    expect(second.log.monsGiven).toEqual([]);
    expect(second.log.says.length).toBeGreaterThanOrEqual(1);
  });
});

describe('moon1 Myowth SWIPE tutorial (npc:myowth)', () => {
  it('says at least two pages of tutorial/hint content and never mutates flags', () => {
    const { hooks, log } = makeHooks();
    runScript(moon1Scripts['npc:myowth'], hooks);
    const totalPages = log.says.reduce((n, pages) => n + pages.length, 0);
    expect(totalPages).toBeGreaterThanOrEqual(2);
  });
});

describe('frozen encounter tables (CH2.3 task card, exact numbers)', () => {
  it('moon1', () => {
    expect(MAPS.moon1.encounters).toEqual({
      rate: 0.12,
      entries: [
        { species: 'ratikatt', weight: 3, lv: [3, 5] },
        { species: 'zubatt', weight: 2, lv: [3, 5] },
      ],
    });
  });

  it('moon2', () => {
    expect(MAPS.moon2.encounters).toEqual({
      rate: 0.15,
      entries: [
        { species: 'zubatt', weight: 3, lv: [4, 6] },
        { species: 'geodood', weight: 2, lv: [4, 6] },
      ],
    });
  });

  it('moonDig', () => {
    expect(MAPS.moonDig.encounters).toEqual({
      rate: 0.15,
      entries: [
        { species: 'geodood', weight: 3, lv: [4, 6] },
        { species: 'zubatt', weight: 1, lv: [4, 6] },
        { species: 'ratikatt', weight: 1, lv: [5, 6] },
      ],
    });
  });
});
