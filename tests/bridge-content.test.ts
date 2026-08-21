// CH3.2 interpreter + map-pin tests (moon-content.test.ts idiom): feed each
// bridge script through the real interpreter with fake hooks, assert the
// battle calls; then pin the frozen map/tile/palette geometry from the task
// card so a later edit can't silently drift the layout.
import { describe, it, expect, beforeEach } from 'vitest';
import { runScript, type ScriptHooks } from '../src/systems/script';
import { quest, resetQuest } from '../src/systems/quest';
import { bridgeScripts } from '../src/data/dialog/bridge';
import { MAPS } from '../src/data/maps';
import { TILES, WALKABLE } from '../src/data/tiles';
import { BG_PAL } from '../src/data/palettes';
import type { FlagName } from '../src/types';

interface FakeLog {
  says: string[][][];
  battles: string[];
}

function makeHooks(): { hooks: ScriptHooks; log: FakeLog } {
  const log: FakeLog = { says: [], battles: [] };
  const hooks: ScriptHooks = {
    say: (pages, done) => { log.says.push(pages); done(); },
    battle: (id, done) => { log.battles.push(id); done(null); },
    warp: (_w, done) => done(),
    sfx: () => {},
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
    sysMsg: () => {},
    jobs: (done) => done(),
    cardFlip: (done) => done(),
    tour: (_stops, done) => done(),
    choice: (_p, done) => done(true),
  };
  return { hooks, log };
}

beforeEach(() => resetQuest());

// mark id -> [flag, encounter id, step key, npc key]
const MARKS: [FlagName, string, string, string][] = [
  ['spanCamper', 'span_camper', 'step:6,15', 'npc:camper'],
  ['spanPicnicker', 'span_picnicker', 'step:6,12', 'npc:picnicker'],
  ['spanHiker', 'span_hiker', 'step:6,9', 'npc:hiker'],
  ['spanYoungster', 'span_youngster', 'step:6,6', 'npc:youngster'],
  ['spanLass', 'span_lass', 'step:6,3', 'npc:lass'],
];

describe('bridge marks: step/npc battle gating', () => {
  for (const [flag, encId, stepKey, npcKey] of MARKS) {
    describe(encId, () => {
      it(`fresh: both ${stepKey} and ${npcKey} fire the battle exactly once`, () => {
        const step = makeHooks();
        runScript(bridgeScripts[stepKey], step.hooks);
        expect(step.log.battles).toEqual([encId]);

        const npc = makeHooks();
        runScript(bridgeScripts[npcKey], npc.hooks);
        expect(npc.log.battles).toEqual([encId]);
      });

      it(`beaten: ${stepKey} says nothing and never battles; ${npcKey} says one page, no battle`, () => {
        quest.flags[flag] = true;

        const step = makeHooks();
        runScript(bridgeScripts[stepKey], step.hooks);
        expect(step.log.battles).toEqual([]);
        expect(step.log.says).toEqual([]);

        const npc = makeHooks();
        runScript(bridgeScripts[npcKey], npc.hooks);
        expect(npc.log.battles).toEqual([]);
        expect(npc.log.says.length).toBe(1);
      });
    });
  }
});

describe('bridge whiteout resume', () => {
  it('camper/picnicker/hiker beaten, youngster not: the lane-order step walk battles only the youngster', () => {
    quest.flags.spanCamper = true;
    quest.flags.spanPicnicker = true;
    quest.flags.spanHiker = true;
    quest.flags.spanYoungster = false;

    const { hooks, log } = makeHooks();
    // lane order south -> north, same as a player walking the resumed run
    runScript(bridgeScripts['step:6,15'], hooks);
    runScript(bridgeScripts['step:6,12'], hooks);
    runScript(bridgeScripts['step:6,9'], hooks);
    runScript(bridgeScripts['step:6,6'], hooks);

    expect(log.battles).toEqual(['span_youngster']);
  });
});

describe('KIRA (step:6,1 / npc:kira)', () => {
  it('ch3Done false, spanLass false: no battle, gate line only', () => {
    const { hooks, log } = makeHooks();
    runScript(bridgeScripts['step:6,1'], hooks);
    expect(log.battles).toEqual([]);
    expect(log.says.length).toBe(1);
  });

  it('spanLass true (all five marks down): battles span_kira exactly once', () => {
    quest.flags.spanLass = true;
    const { hooks, log } = makeHooks();
    runScript(bridgeScripts['npc:kira'], hooks);
    expect(log.battles).toEqual(['span_kira']);
  });

  it('ch3Done true: one page only, no battle', () => {
    quest.flags.ch3Done = true;
    const { hooks, log } = makeHooks();
    runScript(bridgeScripts['npc:kira'], hooks);
    expect(log.battles).toEqual([]);
    expect(log.says.length).toBe(1);
  });

  it('step: and npc: share the exact same script object', () => {
    expect(bridgeScripts['step:6,1']).toBe(bridgeScripts['npc:kira']);
  });
});

describe('CH3.2 map pins (frozen task card)', () => {
  it('MAPS.bridge is exactly 12 wide x 20 tall', () => {
    expect(MAPS.bridge.w).toBe(12);
    expect(MAPS.bridge.h).toBe(20);
  });

  it('lane tiles (5,y)/(6,y) are walkable for y=1..19', () => {
    for (let y = 1; y <= 19; y++) {
      expect(WALKABLE.has(MAPS.bridge.grid[y][5]), `(5,${y})`).toBe(true);
      expect(WALKABLE.has(MAPS.bridge.grid[y][6]), `(6,${y})`).toBe(true);
    }
  });

  it('(5,19) and (6,19) warp to outskirts (10,1)', () => {
    expect(MAPS.bridge.warps['5,19']).toEqual(['outskirts', 10, 1, 'down']);
    expect(MAPS.bridge.warps['6,19']).toEqual(['outskirts', 10, 1, 'down']);
  });

  it('every mark NPC sits at its pinned (5,y) with its pinned goneIf flag', () => {
    const pins: [string, number, string][] = [
      ['camper', 15, 'spanCamper'],
      ['picnicker', 12, 'spanPicnicker'],
      ['hiker', 9, 'spanHiker'],
      ['youngster', 6, 'spanYoungster'],
      ['lass', 3, 'spanLass'],
    ];
    for (const [id, y, flag] of pins) {
      const npc = MAPS.bridge.npcs.find((n) => n.id === id);
      expect(npc, id).toBeDefined();
      expect(npc!.x, `${id} x`).toBe(5);
      expect(npc!.y, `${id} y`).toBe(y);
      expect(npc!.goneIf, `${id} goneIf`).toEqual({ flag });
    }
  });

  it('KIRA sits at (5,1) with no goneIf', () => {
    const kira = MAPS.bridge.npcs.find((n) => n.id === 'kira');
    expect(kira).toBeDefined();
    expect(kira!.x).toBe(5);
    expect(kira!.y).toBe(1);
    expect(kira!.goneIf).toBeUndefined();
  });

  it('MAPS.outskirts warps are pinned', () => {
    expect(MAPS.outskirts.warps['0,6']).toEqual(['moon1', 18, 4, 'left']);
    expect(MAPS.outskirts.warps['10,0']).toEqual(['bridge', 6, 18, 'up']);
  });

  it('MAPS.moon1 gained the CH3.2 door: (19,4) is "o", warps to outskirts (1,6)', () => {
    expect(MAPS.moon1.grid[4][19]).toBe('o');
    expect(MAPS.moon1.warps['19,4']).toEqual(['outskirts', 1, 6, 'right']);
  });

  it('neither new map ships wild encounters', () => {
    expect(MAPS.outskirts.encounters).toBeUndefined();
    expect(MAPS.bridge.encounters).toBeUndefined();
  });

  it('TILES.w carries two 16x16 frames; neither `w` nor `B` is walkable', () => {
    const frames = TILES['w'];
    expect(frames).toHaveLength(2);
    for (const frame of frames) {
      expect(frame.length).toBe(16);
      for (const row of frame) expect(row.length).toBe(16);
    }
    expect(WALKABLE.has('w')).toBe(false);
    expect(WALKABLE.has('B')).toBe(false);
  });

  it('BG_PAL.span carries the standard palette shape', () => {
    // FLW.2 added the shared ALERT slot to every BG palette, so the shape
    // lint that used to live here now runs over ALL of them in
    // content-lint.test.ts. Kept as a CH3-local guard that span is not
    // special-cased.
    expect(BG_PAL.span).toHaveLength(BG_PAL.hq.length);
  });
});
