// SIDE.3/SIDE.6 interpreter tests (the moon-content.test.ts idiom): feed
// each new egg script through the real interpreter with fake hooks, and
// exercise the real pickup interact() path with a fixture map (the
// tests/world.test.ts harness idiom). resetQuest() between tests so eggs
// found in one case don't leak into the next.
import { describe, it, expect, beforeEach } from 'vitest';
import { runScript, type ScriptHooks } from '../src/systems/script';
import { quest, resetQuest } from '../src/systems/quest';
import { vaultScripts } from '../src/data/dialog/vault';
import { moon1Scripts } from '../src/data/dialog/moon1';
import { moon2Scripts } from '../src/data/dialog/moon2';
import { moonDigScripts } from '../src/data/dialog/moonDig';
import { hqDrillScripts } from '../src/data/dialog/hqDrill';
import { outskirtsScripts } from '../src/data/dialog/outskirts';
import { MAPS } from '../src/data/maps';
import { interact } from '../src/systems/world';
import { G } from '../src/state';
import { snapshot, applySave } from '../src/systems/save';
import type { MapDef, ScriptStep } from '../src/types';

interface FakeLog {
  says: string[][][];
  sfx: string[];
  sysMsgs: string[][];
  tiles: [number, number, string][];
}

function makeHooks(): { hooks: ScriptHooks; log: FakeLog } {
  const log: FakeLog = { says: [], sfx: [], sysMsgs: [], tiles: [] };
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
    giveMon: () => {},
    npcRun: (_id, done) => done(),
    healParty: () => {},
    sysMsg: (lines) => log.sysMsgs.push(lines),
    jobs: (done) => done(),
    cardFlip: (done) => done(),
    choice: (_p, done) => done(true),
  };
  return { hooks, log };
}

beforeEach(() => resetQuest());

/** Run `steps` twice (fresh find, then a repeat visit) and assert the
 *  standard first-find/repeat shape: addEgg lands once, sfx('item') fires
 *  once, sysMsg(['EGG FOUND!']) fires once, and a second run changes none
 *  of that but still says something (the repeat line). */
function expectEggFindThenRepeat(steps: ScriptStep[], id: string): void {
  const first = makeHooks();
  runScript(steps, first.hooks);
  expect(quest.eggs.has(id), `${id}: not granted on first find`).toBe(true);
  expect(first.log.sfx.filter((s) => s === 'item').length, `${id}: sfx('item') count`).toBe(1);
  expect(first.log.sysMsgs, `${id}: sysMsg on first find`).toEqual([['EGG FOUND!']]);
  expect(first.log.says.length, `${id}: says at least one page on first find`).toBeGreaterThanOrEqual(1);

  const sizeAfterFirst = quest.eggs.size;
  const second = makeHooks();
  runScript(steps, second.hooks);
  expect(quest.eggs.size, `${id}: egg count unchanged on repeat`).toBe(sizeAfterFirst);
  expect(second.log.sysMsgs, `${id}: no second EGG FOUND toast`).toEqual([]);
  expect(second.log.says.length, `${id}: still says the repeat line`).toBeGreaterThanOrEqual(1);
}

describe('SIDE.3 egg scripts: find then repeat', () => {
  it('vaultbrick (vault at:0,2)', () => expectEggFindThenRepeat(vaultScripts['at:0,2'], 'vaultbrick'));
  it('vaultwall (vault at:11,4)', () => expectEggFindThenRepeat(vaultScripts['at:11,4'], 'vaultwall'));
  it('moonecho (moon1 at:12,6)', () => expectEggFindThenRepeat(moon1Scripts['at:12,6'], 'moonecho'));
  it('deadend (moon2 at:8,3)', () => expectEggFindThenRepeat(moon2Scripts['at:8,3'], 'deadend'));
  it('drillsign (hqDrill at:0,1)', () => expectEggFindThenRepeat(hqDrillScripts['at:0,1'], 'drillsign'));
  it('swim (outskirts tile:w)', () => expectEggFindThenRepeat(outskirtsScripts['tile:w'], 'swim'));

  describe('emptychest (moonDig at:8,4, nested — see the dialog file comment)', () => {
    it('fossilsTaken false: still runs the heist branch, no egg touched', () => {
      const { hooks, log } = makeHooks();
      runScript(moonDigScripts['at:8,4'], hooks);
      expect(quest.flags.fossilsTaken).toBe(true);
      expect(quest.eggs.has('emptychest')).toBe(false);
      expect(log.tiles).toContainEqual([8, 4, '%']);
    });

    it('fossilsTaken true, egg not yet found: grants it, one sfx, one toast', () => {
      quest.flags.fossilsTaken = true;
      const { hooks, log } = makeHooks();
      runScript(moonDigScripts['at:8,4'], hooks);
      expect(quest.eggs.has('emptychest')).toBe(true);
      expect(log.sfx.filter((s) => s === 'item').length).toBe(1);
      expect(log.sysMsgs).toEqual([['EGG FOUND!']]);
      expect(log.tiles).toEqual([]); // no setTile on the empty-chest branch
    });

    it('fossilsTaken true, egg already found: the old dust line, no second grant', () => {
      quest.flags.fossilsTaken = true;
      quest.eggs.add('emptychest');
      const { hooks, log } = makeHooks();
      runScript(moonDigScripts['at:8,4'], hooks);
      expect(quest.eggs.size).toBe(1);
      expect(log.sysMsgs).toEqual([]);
      expect(log.says).toEqual([[['Just dust now.', 'You already took', 'the fossils.']]]);
    });
  });
});

// ── SIDE.6 pickups ──────────────────────────────────────────────────────────

function pickupFixtureMap(): MapDef {
  return {
    id: 'hq', // borrowed MapId literal for the type — this object never
    // joins the MAPS registry, so it can't collide with the real hq map
    name: 'MINI',
    pal: 'hq',
    music: 'hq',
    grid: ['###', '# b', '###'].map((r) => r.split('')),
    w: 3,
    h: 3,
    npcs: [],
    signs: {},
    items: { '2,1': { id: 'mini_ball', item: 'SODA' } },
    warps: {},
    scripts: {},
  };
}

describe('SIDE.6 pickup interact() (world.test.ts harness idiom)', () => {
  beforeEach(() => {
    G.map = pickupFixtureMap();
    G.player.x = 1;
    G.player.y = 1;
    G.player.dir = 'right';
    G.player.moving = false;
    G.player.prog = 0;
  });

  it('first interact: grants the item, records the pickup id, blanks the tile', () => {
    interact();
    expect(quest.items).toContain('SODA');
    expect(quest.pickups.has('mini_ball')).toBe(true);
    expect(G.map.grid[1][2]).toBe(' ');
  });

  it('second interact on the now-blank tile: no further change', () => {
    interact();
    const itemsAfterFirst = [...quest.items];
    interact();
    expect(quest.items).toEqual(itemsAfterFirst);
    expect(quest.pickups.size).toBe(1);
  });
});

describe('SIDE.6 pickup save round-trip (real map data)', () => {
  it('moon1_soda: snapshot carries the id; applySave + repairItemBalls blank a fresh grid', () => {
    expect(MAPS.moon1.grid[3][14]).toBe('b'); // pristine module data
    quest.pickups.add('moon1_soda');
    const s = snapshot();
    expect(s.pickups).toContain('moon1_soda');
    resetQuest();
    expect(quest.pickups.has('moon1_soda')).toBe(false);
    applySave(s);
    expect(quest.pickups.has('moon1_soda')).toBe(true);
    expect(MAPS.moon1.grid[3][14]).toBe(' '); // blanked by repairItemBalls
    MAPS.moon1.grid[3][14] = 'b'; // restore module data for other tests/files
  });
});
