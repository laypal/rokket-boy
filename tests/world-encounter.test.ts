// Wild-encounter system (card CH2.1) — world.ts integration, TDD red phase.
// This is a SEPARATE file from tests/world.test.ts on purpose: it imports
// `src/systems/encounter.ts`, which does not exist yet, so the import throws
// at collection. Appending these cases to world.test.ts would have taken the
// whole existing suite down with it (every pre-existing world test must stay
// green); keeping them here means only the new, expected-red cases fail.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { worldUpdate, performWarp, clearMapGuardRuntime } from '../src/systems/world';
import { MAPS } from '../src/data/maps';
import { G } from '../src/state';
import { setEncounterRng, ENCOUNTER_TILE } from '../src/systems/encounter';
import { sessionOnlyWarning } from '../src/systems/save';
import type { EncounterTable, MapDef, MapId } from '../src/types';

const seq = (vals: number[]) => {
  let i = 0;
  return () => vals[i++];
};

// Minimal fixture, id pinned to 'corner' so any HEAT keying lines up with the
// real MAPS.corner id (same idiom as world.test.ts's makeHeatMap). `encounters`
// isn't on MapDef yet (that's the contract this card adds) — the cast is the
// documented seam; it becomes a plain structural match once types.ts lands it.
function makeEncMap(rows: string[], encounters?: EncounterTable): MapDef {
  const base = {
    id: 'corner' as MapId,
    name: 'TEST',
    pal: MAPS.corner.pal,
    music: MAPS.corner.music,
    grid: rows.map((r) => r.split('')),
    w: rows[0].length,
    h: rows.length,
    npcs: [],
    warps: {},
    signs: {},
    items: {},
    scripts: {},
    encounters,
  };
  return base as unknown as MapDef;
}

describe('a completed walk step onto ENCOUNTER_TILE (CH2.1)', () => {
  beforeEach(() => {
    G.heatState = {};
    G.state = 'world';
    G.battle = null;
    clearMapGuardRuntime('corner');
  });
  afterEach(() => {
    G.map = MAPS.hq;
    G.state = 'world';
    G.battle = null;
    G.fade = 0;
    G.fadeDir = 0;
    G.afterFade = null;
    setEncounterRng(Math.random);
  });

  it('starts a wild battle with a species from the map table on a forced hit', () => {
    const table: EncounterTable = { rate: 1, entries: [{ species: 'voltorbb', weight: 1, lv: [5, 5] }] };
    const map = makeEncMap(['#####', `#${ENCOUNTER_TILE}  #`, '#####'], table);
    G.map = map;
    G.player.x = 2;
    G.player.y = 1;
    G.player.dir = 'left';
    G.player.moving = true;
    G.player.prog = 15; // one worldUpdate tick completes the step onto (1,1)
    G.player.step = 0;
    setEncounterRng(seq([0, 0, 0])); // forced hit: rate 0<1, entry 0, lv roll (lo=hi=5)
    worldUpdate();
    expect(G.state).toBe('battle');
    expect(G.battle?.foe.species).toBe('voltorbb');
    expect(G.player.x).toBe(1); // stepped onto the tile, not left dangling mid-tile
    expect(G.player.y).toBe(1);
  });

  it('does not roll when the completed step lands on a plain floor tile', () => {
    const table: EncounterTable = { rate: 1, entries: [{ species: 'voltorbb', weight: 1, lv: [5, 5] }] };
    const map = makeEncMap(['#####', `# ${ENCOUNTER_TILE} #`, '#####'], table); // floor at (1,1), ~ at (2,1)
    G.map = map;
    G.player.x = 2;
    G.player.y = 1;
    G.player.dir = 'left';
    G.player.moving = true;
    G.player.prog = 15;
    G.player.step = 0;
    setEncounterRng(seq([0, 0, 0])); // would force a hit IF the floor tile rolled — it must not
    worldUpdate();
    expect(G.state).toBe('world');
    expect(G.battle).toBeNull();
  });

  it('walking onto ~ on a map with no encounters table does not crash and does not battle', () => {
    const map = makeEncMap(['#####', `#${ENCOUNTER_TILE}  #`, '#####']); // no table at all
    G.map = map;
    G.player.x = 2;
    G.player.y = 1;
    G.player.dir = 'left';
    G.player.moving = true;
    G.player.prog = 15;
    G.player.step = 0;
    setEncounterRng(seq([0, 0, 0])); // irrelevant — must not even be consulted
    expect(() => worldUpdate()).not.toThrow();
    expect(G.state).toBe('world');
    expect(G.battle).toBeNull();
    expect(G.player.x).toBe(1);
    expect(G.player.y).toBe(1);
  });
});

describe('warp arrival onto ~ does not roll (the CH2.1 "don\'t")', () => {
  const realCorner = MAPS.corner;

  beforeEach(() => {
    G.heatState = {};
    G.state = 'world';
    G.battle = null;
    clearMapGuardRuntime('corner');
  });
  afterEach(() => {
    MAPS.corner = realCorner;
    G.map = MAPS.hq;
    G.state = 'world';
    G.battle = null;
    G.fade = 0;
    G.fadeDir = 0;
    G.afterFade = null;
    setEncounterRng(Math.random);
  });

  it('never rolls once the fade resolves the player onto a ~ tile', () => {
    const table: EncounterTable = { rate: 1, entries: [{ species: 'voltorbb', weight: 1, lv: [5, 5] }] };
    MAPS.corner = makeEncMap(['#####', `#${ENCOUNTER_TILE}  #`, '#####'], table);
    setEncounterRng(seq([0, 0, 0])); // would force a hit IF the warp path rolled — it must not
    // Node env has no localStorage, so the first warp would surface the
    // once-only §0.4 "SAVE: SESSION ONLY" dialog and mask the state we
    // assert on — spend the latch first (harness concern, not the contract).
    sessionOnlyWarning();
    performWarp(['corner', 1, 1, 'down']);
    expect(G.state).toBe('worldwait');
    // resolve the fade: no canvas in this Node test env (drawFade touches
    // `ctx`, which is never initialized), so run the captured afterFade
    // closure directly — the same closure drawFade would invoke at fade=9.
    G.afterFade?.();
    expect(G.map.id).toBe('corner');
    expect(G.player.x).toBe(1);
    expect(G.player.y).toBe(1);
    expect(G.state).toBe('world'); // landed, not battling
    expect(G.battle).toBeNull();
  });
});
