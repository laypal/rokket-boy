// F42 GATE.1 — chapter-entrance gates: the door is seen, not used, until the
// previous job is handed in. Lint over the shipped data + the tryWarp beat.
import { describe, it, expect, beforeEach } from 'vitest';
import { worldUpdate, worldHooks, sysMsgUp } from '../src/systems/world';
import { MAPS } from '../src/data/maps';
import { quest, resetQuest, checkCond } from '../src/systems/quest';
import { G } from '../src/state';
import type { Cond, FlagName, MapId } from '../src/types';

const MAX_CHARS = 17; // the toast shares the dialog box budget (§5)
const MAX_LINES = 3;

/** Every chapter area's FIRST map — each must be entered through a gate. */
const CHAPTER_ENTRANCES: MapId[] = ['moon1', 'bridge', 'deck1', 'lav1', 'syl1', 'plant1'];

describe('gate data (F42 GATE.0)', () => {
  it('every gate key is a real warp tile on its own map', () => {
    for (const map of Object.values(MAPS)) {
      for (const key of Object.keys(map.gates ?? {})) {
        expect(map.warps[key], `${map.id} gate ${key} has no warp`).toBeDefined();
      }
    }
  });

  it('every gate toast fits the box', () => {
    for (const map of Object.values(MAPS)) {
      for (const [key, gate] of Object.entries(map.gates ?? {})) {
        expect(gate.msg.length, `${map.id} gate ${key} line count`).toBeLessThanOrEqual(MAX_LINES);
        expect(gate.msg.length, `${map.id} gate ${key} is empty`).toBeGreaterThan(0);
        for (const line of gate.msg) {
          expect(line.length, `${map.id} gate ${key}: "${line}"`).toBeLessThanOrEqual(MAX_CHARS);
        }
      }
    }
  });

  it('every chapter entrance is reached through at least one gated warp', () => {
    for (const entrance of CHAPTER_ENTRANCES) {
      const gated = Object.values(MAPS).some((map) =>
        Object.entries(map.gates ?? {}).some(([key]) => map.warps[key]?.[0] === entrance),
      );
      expect(gated, `nothing gates the way into ${entrance}`).toBe(true);
    }
  });

  it('every gated door is signposted (F42-FB, Lyall): a readable sign, before the gate ever fires', () => {
    // The four added with the gates; the dock's gangway (9,5) and plant road
    // (8,8) were already signposted by CH7.0.
    const SIGNS: [MapId, string][] = [
      ['corner', '19,6'],
      ['outskirts', '9,0'],
      ['outskirts', '9,8'],
      ['dock', '19,5'],
    ];
    for (const [id, key] of SIGNS) {
      const [x, y] = key.split(',').map(Number);
      expect(MAPS[id].signs[key], `${id} sign ${key}`).toBeDefined();
      expect(MAPS[id].grid[y][x], `${id} tile ${key} must be a sign tile`).toBe('s');
    }
    // and every gated map carries at least one sign — nothing is a mystery door
    for (const map of Object.values(MAPS)) {
      if (!map.gates) continue;
      expect(Object.keys(map.signs).length, `${map.id} gates but signposts nothing`).toBeGreaterThan(0);
    }
  });

  it('no gate sits on a return route into an already-open area', () => {
    // A gate only ever guards a chapter entrance — never the way back out.
    for (const map of Object.values(MAPS)) {
      for (const key of Object.keys(map.gates ?? {})) {
        const target = map.warps[key][0];
        expect(CHAPTER_ENTRANCES, `${map.id} gate ${key} → ${target}`).toContain(target);
      }
    }
  });
});

describe('tryWarp honours a gate (F42 GATE.1)', () => {
  beforeEach(() => {
    resetQuest();
    worldHooks.sysMsg([]); // no toast carried in from the previous case
    G.state = 'world';
    G.heatState = {};
  });

  /** Rig the player one frame from completing a step ONTO (x, y). */
  function stepOnto(mapId: MapId, x: number, y: number): void {
    G.map = MAPS[mapId];
    G.player.x = x - 1;
    G.player.y = y;
    G.player.dir = 'right';
    G.player.moving = true;
    G.player.prog = 15;
    worldUpdate();
  }

  const DOORS: { map: MapId; x: number; y: number; flag: FlagName; to: MapId }[] = [
    { map: 'corner', x: 19, y: 7, flag: 'missionDone', to: 'moon1' },
    { map: 'outskirts', x: 10, y: 0, flag: 'ch2Done', to: 'bridge' },
    { map: 'outskirts', x: 10, y: 8, flag: 'ch4Done', to: 'lav1' },
    { map: 'dock', x: 17, y: 2, flag: 'ch3Done', to: 'deck1' },
    { map: 'dock', x: 19, y: 6, flag: 'ch5Done', to: 'syl1' },
    { map: 'dock', x: 9, y: 9, flag: 'ch6Done', to: 'plant1' },
  ];

  it('the six doors gate on the flag the plan pins', () => {
    for (const d of DOORS) {
      const gate = MAPS[d.map].gates?.[`${d.x},${d.y}`];
      expect(gate, `${d.map} ${d.x},${d.y}`).toBeDefined();
      expect(gate!.cond).toEqual({ flag: d.flag } satisfies Cond);
      expect(MAPS[d.map].warps[`${d.x},${d.y}`][0]).toBe(d.to);
    }
  });

  for (const d of DOORS) {
    it(`${d.map} ${d.x},${d.y} → ${d.to}: closed without ${d.flag}, open with it`, () => {
      // closed: the step lands, the transit does not
      quest.flags[d.flag] = false;
      expect(checkCond({ flag: d.flag })).toBe(false);
      stepOnto(d.map, d.x, d.y);
      expect(G.map.id).toBe(d.map);
      expect(G.state).toBe('world'); // no fade — performWarp never ran
      expect(sysMsgUp()).toBe(true); // the toast says why
      expect(G.player.x).toBe(d.x); // standing on the door, not knocked back
      expect(G.player.y).toBe(d.y);

      // open: the same step warps
      worldHooks.sysMsg([]);
      quest.flags[d.flag] = true;
      stepOnto(d.map, d.x, d.y);
      expect(G.state).toBe('worldwait'); // the warp fade owns the frame
    });
  }
});
