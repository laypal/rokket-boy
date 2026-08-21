import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  tileAt, isBlocked, warpAt, performWarp, worldUpdate,
  guardRuntime, clearMapGuardRuntime, heatTick, worldHooks,
  todoMarkersActive, TODO_BOB, npcTodo,
} from '../src/systems/world';
import { MAPS } from '../src/data/maps';
import { WALKABLE } from '../src/data/tiles';
import { quest, resetQuest } from '../src/systems/quest';
import { G } from '../src/state';
import { setHeat, calmHeat, type HeatState } from '../src/systems/heat';
import { tourActive, resetTour } from '../src/systems/tour';
import { makeMon, maxHp } from '../src/systems/mon';
import { SPECIES } from '../src/data/mons';
import type { MapDef, NpcDef, MapId, Dir } from '../src/types';

beforeEach(() => resetQuest());

describe('tileAt / collision', () => {
  it('returns # outside map bounds', () => {
    expect(tileAt(MAPS.hq, -1, 0)).toBe('#');
    expect(tileAt(MAPS.hq, 0, -1)).toBe('#');
    expect(tileAt(MAPS.hq, 999, 0)).toBe('#');
  });

  it('walls block, floor does not', () => {
    expect(isBlocked(MAPS.hq, 0, 0)).toBe(true);   // '#'
    expect(isBlocked(MAPS.hq, 9, 7)).toBe(false);  // spawn floor
    expect(isBlocked(MAPS.hq, 2, 2)).toBe(true);   // 'C' terminal
  });

  it('NPCs block their tile', () => {
    expect(isBlocked(MAPS.hq, 7, 3)).toBe(true); // giovanni on floor tile
  });

  it('gone NPCs stop blocking (poster guard after the battle)', () => {
    expect(isBlocked(MAPS.corner, 3, 2)).toBe(true);
    quest.flags.guardBeaten = true;
    expect(isBlocked(MAPS.corner, 3, 2)).toBe(false);
  });
});

describe('warp resolution', () => {
  it('resolves HQ exit doors to Gamez Corner', () => {
    expect(warpAt(MAPS.hq, 9, 13)).toEqual(['corner', 9, 2, 'down']);
    expect(warpAt(MAPS.hq, 10, 13)).toEqual(['corner', 10, 2, 'down']);
  });
  it('resolves vault stairs back to the corner', () => {
    expect(warpAt(MAPS.vault, 5, 6)).toEqual(['corner', 2, 3, 'down']);
  });
  it('returns undefined on non-warp tiles', () => {
    expect(warpAt(MAPS.hq, 9, 7)).toBeUndefined();
  });
  it('every static warp target exists and lands on a walkable tile', () => {
    // uses the REAL walkable set — a local copy drifted when CH2.1 added `~`
    for (const map of Object.values(MAPS)) {
      for (const [key, [target, x, y]] of Object.entries(map.warps)) {
        const dest = MAPS[target];
        expect(dest, `${map.id} warp ${key} target`).toBeDefined();
        expect(WALKABLE.has(dest.grid[y][x]), `${map.id} warp ${key} → ${target} ${x},${y}`).toBe(true);
      }
    }
  });
});

// ── HEAT (card 1f.6 — world.ts integration, TDD red phase) ─────────────────
// Minimal local fixture, never mutates the real MAPS: id is always 'corner'
// so G.heatState/guardRuntime keying ('corner:<npcId>') lines up with the
// existing MAPS.corner id without importing the real grid/npcs.
const DOWN: Dir = 'down';
function makeHeatMap(rows: string[], npcs: NpcDef[]): MapDef {
  return {
    id: 'corner' as MapId,
    name: 'TEST',
    pal: MAPS.corner.pal,
    music: MAPS.corner.music,
    grid: rows.map((r) => r.split('')),
    w: rows[0].length,
    h: rows.length,
    npcs,
    warps: {},
    signs: {},
    items: {},
    scripts: {},
  };
}


describe('guard runtime bookkeeping (1f.6)', () => {
  beforeEach(() => clearMapGuardRuntime('corner'));
  afterEach(() => clearMapGuardRuntime('corner'));

  const stub = (id: string) => ({ id, x: 2, y: 1, dir: DOWN });

  it('returns the same object on repeat lookups', () => {
    const rt1 = guardRuntime('corner', stub('bk1'));
    rt1.cooldown = 42;
    const rt2 = guardRuntime('corner', stub('bk1'));
    expect(rt2).toBe(rt1);
    expect(rt2.cooldown).toBe(42);
  });

  it('clearMapGuardRuntime drops the map, next lookup is fresh but keeps the home (1f.11)', () => {
    const rt1 = guardRuntime('corner', stub('bk2'));
    rt1.cooldown = 99;
    clearMapGuardRuntime('corner');
    const rt2 = guardRuntime('corner', { id: 'bk2', x: 7, y: 1, dir: DOWN }); // recreated elsewhere
    expect(rt2).not.toBe(rt1);
    expect(rt2.cooldown).toBe(0);
    expect(rt2.spotFlash).toBe(0);
    expect(rt2.mode).toBe('post');
    // home survives the clear — captured at FIRST creation, not recreation
    expect(rt2.homeX).toBe(2);
    expect(rt2.homeY).toBe(1);
  });
});

describe('heatTick (1f.6 world integration)', () => {
  beforeEach(() => {
    resetQuest();
    G.heatState = {};
    G.state = 'world';
    G.frame = 0;
    G.playSeconds = 0;
    G.battle = null;
    clearMapGuardRuntime('corner');
  });
  afterEach(() => {
    G.map = MAPS.hq;
    G.state = 'world';
    G.fade = 0;
    G.fadeDir = 0;
    G.afterFade = null;
    G.battle = null;
  });

  it('gaze sweep -> eye contact -> wind-up -> pursuit -> contact on the frozen beats (BDD, 1f.15)', () => {
    const guard: NpcDef = { id: 'gA', char: 'guard', x: 1, y: 1, dir: DOWN, heatGuard: { encounterId: 'guard_voltorbb' } };
    const map = makeHeatMap(['#########', '#       #', '#########'], [guard]);
    G.map = map;
    G.player.x = 4;
    G.player.y = 1;
    G.player.dir = DOWN;
    G.player.moving = false;
    G.player.prog = 0;
    G.heatState.corner = setHeat(calmHeat(), 2, 0);
    // the idle gaze turns 'right' for frames 90..179; the first eye-contact
    // check beat is 90: startle 48f (0 at 138), stage -> 3, chase; steps at
    // 144 and 168; contact at 192
    for (G.frame = 1; G.frame <= 191; G.frame++) heatTick();
    expect(guard.x).toBe(3);
    expect(G.state).toBe('world');
    expect(guardRuntime('corner', guard).mode).toBe('chase');
    G.frame = 192;
    expect(heatTick()).toBe(true);
    expect(G.state).toBe('battle');
  });

  it('gaze is blocked by a wall even when facing the player (1f.15)', () => {
    const guard: NpcDef = { id: 'gz1', char: 'guard', x: 2, y: 1, dir: DOWN, heatGuard: { encounterId: 'guard_voltorbb' } };
    const map = makeHeatMap(['#######', '#  #  #', '#######'], [guard]);
    G.map = map;
    G.player.x = 4;
    G.player.y = 1;
    G.player.dir = DOWN;
    G.player.moving = false;
    G.player.prog = 0;
    G.heatState.corner = setHeat(calmHeat(), 1, 0);
    G.frame = 90; // idle gaze is 'right' — straight at the player, wall between
    heatTick();
    expect(G.heatState.corner?.stage).toBe(1);
    expect(guardRuntime('corner', guard).mode).toBe('post');
    expect(guardRuntime('corner', guard).spotFlash).toBe(0);
  });

  it('a posted guard idles his gaze through the four directions (1f.15)', () => {
    const guard: NpcDef = { id: 'gz2', char: 'guard', x: 2, y: 1, dir: DOWN, heatGuard: { encounterId: 'guard_voltorbb' } };
    const map = makeHeatMap(['#########', '#       #', '#########'], [guard]);
    G.map = map;
    G.player.x = 7; // out of every cone
    G.player.y = 1;
    G.player.dir = DOWN;
    G.player.moving = false;
    G.player.prog = 0;
    // calm map: the sweep is ambient life, it runs at stage 0 too
    G.frame = 1;
    heatTick();
    expect(guard.faceDir).toBe('down');
    G.frame = 95;
    heatTick();
    expect(guard.faceDir).toBe('right');
    G.frame = 185;
    heatTick();
    expect(guard.faceDir).toBe('up');
    G.frame = 275;
    heatTick();
    expect(guard.faceDir).toBe('left');
  });

  it('a freshly startled guard takes no step until the wind-up runs out (1f.10)', () => {
    const guard: NpcDef = { id: 'gB', char: 'guard', x: 2, y: 1, dir: DOWN, heatGuard: { encounterId: 'guard_voltorbb' } };
    const map = makeHeatMap(['#########', '#       #', '#########'], [guard]);
    G.map = map;
    G.player.x = 4;
    G.player.y = 1;
    G.player.dir = DOWN;
    G.player.moving = false;
    G.player.prog = 0;
    G.heatState.corner = setHeat(calmHeat(), 2, 0);
    const rt = guardRuntime('corner', guard);
    rt.mode = 'chase';
    rt.tracking = true;
    rt.spotFlash = 10;
    G.frame = 24;
    expect(heatTick()).toBe(false);
    expect(guard.x).toBe(2); // startled: the ! is the wind-up, no pursuit yet
    expect(rt.spotFlash).toBe(9);
  });

  it('scans during a chase never pump the stage (1f.10 rule holds)', () => {
    const guard: NpcDef = { id: 'gC', char: 'guard', x: 2, y: 1, dir: DOWN, heatGuard: { encounterId: 'guard_voltorbb' } };
    const map = makeHeatMap(['#########', '#       #', '#########'], [guard]);
    G.map = map;
    G.player.x = 4;
    G.player.y = 1;
    G.player.dir = DOWN;
    G.player.moving = false;
    G.player.prog = 0;
    G.heatState.corner = setHeat(calmHeat(), 1, 0);
    G.frame = 90; // idle gaze turns 'right' onto the player
    heatTick(); // acquisition: 1 -> 2, chase entered
    expect(G.heatState.corner?.stage).toBe(2);
    expect(guardRuntime('corner', guard).mode).toBe('chase');
    G.frame = 105;
    heatTick(); // still tracked mid-chase: no pump
    expect(G.heatState.corner?.stage).toBe(2);
  });

  it('a chasing guard gives up beyond the 3-tile leash and heads home (1f.11)', () => {
    const guard: NpcDef = { id: 'gD', char: 'guard', x: 2, y: 1, dir: DOWN, heatGuard: { encounterId: 'guard_voltorbb' } };
    const map = makeHeatMap(['#########', '#       #', '#########'], [guard]);
    G.map = map;
    G.player.x = 7;
    G.player.y = 1;
    G.player.dir = DOWN;
    G.player.moving = false;
    G.player.prog = 0;
    G.heatState.corner = setHeat(calmHeat(), 2, 0);
    const rt = guardRuntime('corner', guard);
    rt.mode = 'chase';
    rt.tracking = true;
    G.frame = 24;
    expect(heatTick()).toBe(false);
    expect(rt.mode).toBe('return'); // 5 tiles away: lost you
    expect(rt.tracking).toBe(false);
    expect(guard.x).toBe(2); // no step taken while giving up
  });

  it('a body-blocked chaser gives up after 2 seconds (1f.11)', () => {
    const guard: NpcDef = { id: 'gE', char: 'guard', x: 2, y: 1, dir: DOWN, heatGuard: { encounterId: 'guard_voltorbb' } };
    const bystander: NpcDef = { id: 'wall', char: 'guard', x: 3, y: 1, dir: DOWN };
    const map = makeHeatMap(['#########', '#       #', '#########'], [guard, bystander]);
    G.map = map;
    G.player.x = 5;
    G.player.y = 1;
    G.player.dir = DOWN;
    G.player.moving = false;
    G.player.prog = 0;
    G.heatState.corner = setHeat(calmHeat(), 2, 0);
    const rt = guardRuntime('corner', guard);
    rt.mode = 'chase';
    rt.tracking = true;
    // corridor: greedy step is onto the bystander every beat; 120f of blocked
    // beats (24..120) hits BLOCKED_GIVE_UP and he goes home
    for (G.frame = 1; G.frame <= 120; G.frame++) heatTick();
    expect(guard.x).toBe(2);
    expect(rt.mode).toBe('return');
    expect(G.state).toBe('world');
  });

  it('a returning guard walks home on a CALM map and takes up his post (1f.11)', () => {
    const guard: NpcDef = { id: 'gF', char: 'guard', x: 2, y: 1, dir: DOWN, heatGuard: { encounterId: 'guard_voltorbb' } };
    const map = makeHeatMap(['#########', '#       #', '#########'], [guard]);
    G.map = map;
    G.player.x = 7;
    G.player.y = 1;
    G.player.dir = DOWN;
    G.player.moving = false;
    G.player.prog = 0;
    const rt = guardRuntime('corner', guard); // home captured at (2,1)
    guard.x = 5; // displaced by an earlier chase
    rt.mode = 'return';
    // NO heat entry at all — returners must keep walking on a calm map
    for (G.frame = 1; G.frame <= 96; G.frame++) expect(heatTick()).toBe(false);
    expect(guard.x).toBe(2);
    expect(rt.mode).toBe('post');
    expect(guard.faceDir).toBe('down'); // post facing restored
  });

  it('a returning guard re-triggers instantly when the player closes in hot (1f.11)', () => {
    const guard: NpcDef = { id: 'gG', char: 'guard', x: 1, y: 1, dir: DOWN, heatGuard: { encounterId: 'guard_voltorbb' } };
    const map = makeHeatMap(['#########', '#       #', '#########'], [guard]);
    G.map = map;
    const rt = guardRuntime('corner', guard); // home (1,1)
    guard.x = 4; // mid-return
    rt.mode = 'return';
    rt.tracking = false;
    G.player.x = 5;
    G.player.y = 1;
    G.player.dir = DOWN;
    G.player.moving = false;
    G.player.prog = 0;
    G.heatState.corner = setHeat(calmHeat(), 2, 0);
    G.frame = 24;
    heatTick();
    expect(rt.mode).toBe('chase'); // straight back at it — no wind-up
    expect(rt.spotFlash).toBe(0);
    expect(G.heatState.corner?.stage).toBe(3); // fresh acquisition = +1 (contract)
  });

  it('a guard whose greedy step would land on the player fights instead of moving', () => {
    const guard: NpcDef = { id: 'gH', char: 'guard', x: 2, y: 1, dir: DOWN, heatGuard: { encounterId: 'guard_voltorbb' } };
    const map = makeHeatMap(['#####', '#   #', '#####'], [guard]);
    G.map = map;
    G.player.x = 3;
    G.player.y = 1;
    G.player.dir = DOWN;
    G.player.moving = false;
    G.player.prog = 0;
    G.heatState.corner = setHeat(calmHeat(), 2, 0);
    const rt = guardRuntime('corner', guard);
    rt.mode = 'chase';
    rt.tracking = true;
    G.frame = 24;
    expect(heatTick()).toBe(true);
    expect(G.state).toBe('battle');
    expect(guard.x).toBe(2);
    expect(rt.cooldown).toBe(180);
  });

  it('a guard on cooldown does not scan, step, or fight', () => {
    const guard: NpcDef = { id: 'gI', char: 'guard', x: 2, y: 1, dir: DOWN, heatGuard: { encounterId: 'guard_voltorbb' } };
    const map = makeHeatMap(['#####', '#   #', '#####'], [guard]);
    G.map = map;
    G.player.x = 3;
    G.player.y = 1;
    G.player.dir = DOWN;
    G.player.moving = false;
    G.player.prog = 0;
    G.heatState.corner = setHeat(calmHeat(), 2, 0);
    const rt = guardRuntime('corner', guard);
    rt.mode = 'chase';
    rt.tracking = true;
    rt.cooldown = 10;
    G.frame = 24;
    expect(heatTick()).toBe(false);
    expect(G.state).toBe('world');
    expect(guard.x).toBe(2);
    expect(rt.cooldown).toBe(9);
  });

  it('eye contact on a check beat raises the stage and starts the wind-up', () => {
    const guard: NpcDef = { id: 'gJ', char: 'guard', x: 2, y: 1, dir: DOWN, heatGuard: { encounterId: 'guard_voltorbb' } };
    const map = makeHeatMap(['#######', '#     #', '#######'], [guard]);
    G.map = map;
    G.player.x = 4;
    G.player.y = 1;
    G.player.dir = DOWN;
    G.player.moving = false;
    G.player.prog = 0;
    G.heatState.corner = setHeat(calmHeat(), 1, 0);
    G.frame = 90; // idle gaze is 'right' — direct eye contact
    heatTick();
    expect(guard.faceDir).toBe('right');
    expect(G.heatState.corner?.stage).toBe(2);
    expect(guardRuntime('corner', guard).spotFlash).toBe(48); // the 1f.10 wind-up
    expect(guardRuntime('corner', guard).mode).toBe('chase'); // stage >= 2: game on
  });

  it('no eye contact means no sighting — the guard is looking the other way (1f.15)', () => {
    const guard: NpcDef = { id: 'gK', char: 'guard', x: 2, y: 1, dir: DOWN, heatGuard: { encounterId: 'guard_voltorbb' } };
    const map = makeHeatMap(['#######', '#     #', '#######'], [guard]);
    G.map = map;
    G.player.x = 4;
    G.player.y = 1;
    G.player.dir = DOWN;
    G.player.moving = false;
    G.player.prog = 0;
    G.heatState.corner = setHeat(calmHeat(), 1, 0);
    G.frame = 45; // check beat, but the idle gaze is 'down' — no contact
    heatTick();
    expect(guard.faceDir).toBe('down');
    expect(G.heatState.corner?.stage).toBe(1);
    expect(guardRuntime('corner', guard).mode).toBe('post');
  });

  it('an expired stage-3 lockdown whites the player out and clears the map heat', () => {
    const map = makeHeatMap(['#####', '#   #', '#####'], []);
    G.map = map;
    quest.coins = 100;
    const hs: HeatState = { stage: 3, decayAt: 999, lockdownAt: 5 };
    G.heatState.corner = hs;
    G.playSeconds = 10;
    expect(heatTick()).toBe(true);
    expect(quest.coins).toBe(90);
    expect(G.state).toBe('worldwait');
    expect(G.heatState.corner).toBeUndefined();
    // 1f.14: once the whiteout fade has fully resolved at HQ, the next world
    // tick opens the caught explainer as a real dialog
    G.state = 'world';
    G.fade = 0;
    G.fadeDir = 0;
    G.afterFade = null;
    worldUpdate();
    expect(G.state).toBe('dialog');
    expect(G.dialog?.pages[0]).toEqual(['THE GUARDS', 'CAUGHT YOU!']);
    expect(G.dialog?.pages[1]).toEqual(['DROPPED 10', 'COINS ON THE', 'WAY OUT.']);
    G.dialog = null;
  });

  it('heat decays one stage after the decay window elapses with no guards present', () => {
    const map = makeHeatMap(['#####', '#   #', '#####'], []);
    G.map = map;
    const hs: HeatState = { stage: 2, decayAt: 5, lockdownAt: null };
    G.heatState.corner = hs;
    G.playSeconds = 10;
    expect(heatTick()).toBe(false);
    expect(G.heatState.corner?.stage).toBe(1);
  });

  it('a normal warp out of the map clears its heat', () => {
    const map = makeHeatMap(['#####', '#   #', '#####'], []);
    G.map = map;
    G.heatState.corner = setHeat(calmHeat(), 3, 0);
    performWarp(['hq', 9, 7, 'down']);
    expect(G.heatState.corner).toBeUndefined();
    expect(G.state).toBe('worldwait');
  });
});

describe('worldHooks.giveMon (CH2.3): party if room, else box', () => {
  it('pushes to the party under the cap of 4, overflows to the box at 4', () => {
    const savedParty = G.party;
    const savedBox = G.box;
    try {
      G.party = [...savedParty.slice(0, 1)];
      G.box = [];
      worldHooks.giveMon('ekanzz', 5);
      expect(G.party.length).toBe(2);
      expect(G.party[1].species).toBe('ekanzz');
      expect(G.party[1].lv).toBe(5);
      expect(G.box.length).toBe(0);
      while (G.party.length < 4) worldHooks.giveMon('zubatt', 3);
      worldHooks.giveMon('geodood', 4); // fifth mon — party is full
      expect(G.party.length).toBe(4);
      expect(G.box.length).toBe(1);
      expect(G.box[0].species).toBe('geodood');
    } finally {
      G.party = savedParty;
      G.box = savedBox;
    }
  });
});

describe('worldHooks.healParty (QOL.9): the HQ bunk rest', () => {
  it('full-heals and revives the whole party, clears status, naps 8 minutes', () => {
    const savedParty = G.party;
    const savedSeconds = G.playSeconds;
    try {
      G.party = [makeMon(SPECIES.koffink, 5), makeMon(SPECIES.voltorbb, 5)];
      G.party[0].hp = 3; // battered
      G.party[1].hp = 0; // fainted — the bunk DOES revive (unlike SODA)
      G.party[1].status = 'PSN';
      G.playSeconds = 100;
      worldHooks.healParty();
      expect(G.party[0].hp).toBe(maxHp(SPECIES.koffink, 5));
      expect(G.party[1].hp).toBe(maxHp(SPECIES.voltorbb, 5));
      expect(G.party[1].status).toBeUndefined();
      expect(G.playSeconds).toBe(580); // +480s — lets map HEAT decay (§4.8 synergy)
    } finally {
      G.party = savedParty;
      G.playSeconds = savedSeconds;
    }
  });
});

describe('worldHooks.npcRun cutscene (CH2.7)', () => {
  beforeEach(() => {
    G.heatState = {};
    G.state = 'world';
    G.battle = null;
    G.frame = 0;
  });
  afterEach(() => {
    G.map = MAPS.hq;
    G.state = 'world';
  });

  it('walks the NPC cardinally adjacent to the player, frozen input, then resolves', () => {
    const npc: NpcDef = { id: 'runner', char: 'grunt', x: 5, y: 1, dir: DOWN };
    const map = makeHeatMap(['#########', '#       #', '#########'], [npc]);
    G.map = map;
    G.player.x = 1;
    G.player.y = 1;
    G.player.moving = false;
    G.player.prog = 0;
    let arrived = false;
    worldHooks.npcRun('runner', () => (arrived = true));
    // 12-frame cadence, 3 tiles to cover (5,1)->(2,1): well under 200 frames
    for (G.frame = 1; G.frame <= 200 && !arrived; G.frame++) worldUpdate();
    expect(arrived).toBe(true);
    expect(npc.x).toBe(2);
    expect(npc.y).toBe(1);
    expect(G.player.x).toBe(1); // input frozen throughout — player never moved
    expect(G.player.y).toBe(1);
  });

  it('a missing or gone NPC resolves immediately', () => {
    const map = makeHeatMap(['#####', '#   #', '#####'], []);
    G.map = map;
    let arrived = false;
    worldHooks.npcRun('ghost', () => (arrived = true));
    expect(arrived).toBe(true);
  });
});

describe('worldHooks.tour (ONB.2/FLW.5): the tour owns the frame like npcRun', () => {
  afterEach(() => {
    resetTour();
    G.map = MAPS.hq;
    G.state = 'world';
  });

  it('freezes player input and aims the camera while a stop holds', () => {
    G.map = MAPS.hq;
    G.state = 'world';
    G.heatState = {};
    G.player.x = 9;
    G.player.y = 7;
    G.player.moving = false;
    G.player.prog = 0;
    let done = false;
    worldHooks.tour([{ cam: [112, 48], lines: ['X'] }], () => (done = true));
    for (G.frame = 1; G.frame <= 60; G.frame++) worldUpdate();
    expect(done).toBe(false); // no A press: the stop holds
    expect(tourActive()).toBe(true);
    expect(G.player.x).toBe(9); // input frozen — the player never moved
    expect(G.player.y).toBe(7);
    expect(G.cutscene).not.toBeNull(); // the tour is aiming the world camera
    expect(G.cutscene!.camX).toBe(112);
    expect(G.cutscene!.camY).toBe(48);
  });
});

describe('ONB.3 todo markers', () => {
  afterEach(() => {
    G.map = MAPS.hq;
    G.state = 'world';
    delete G.heatState.hq;
  });

  it('TODO_BOB is a fixed 4-frame, 2px-amplitude bob table', () => {
    expect(TODO_BOB).toEqual([0, 1, 2, 1]);
  });

  it('npcTodo: todoIf gates the flag, no todoIf never flags, goneIf beats todoIf', () => {
    const npc: NpcDef = { id: 'x', char: 'grunt', x: 1, y: 1, dir: DOWN, todoIf: { notFlag: 'lootTaken' } };
    expect(npcTodo(npc)).toBe(true); // fresh quest: lootTaken unset
    quest.flags.lootTaken = true;
    expect(npcTodo(npc)).toBe(false);

    const noTodo: NpcDef = { id: 'y', char: 'grunt', x: 1, y: 1, dir: DOWN };
    expect(npcTodo(noTodo)).toBe(false);

    quest.flags.lootTaken = false; // back to fresh for the goneIf/todoIf interplay below
    const goneWins: NpcDef = {
      id: 'z', char: 'grunt', x: 1, y: 1, dir: DOWN,
      goneIf: { flag: 'guardBeaten' }, todoIf: { notFlag: 'lootTaken' },
    };
    expect(npcTodo(goneWins)).toBe(true); // fresh: not gone, todoIf holds
    quest.flags.guardBeaten = true;
    expect(npcTodo(goneWins)).toBe(false); // gone beats todo
  });

  it('todoMarkersActive: true only when world.ts alone owns the screen', () => {
    G.map = MAPS.hq;
    G.state = 'world';
    delete G.heatState.hq;
    expect(todoMarkersActive()).toBe(true);

    G.state = 'dialog';
    expect(todoMarkersActive()).toBe(false);
    G.state = 'menu';
    expect(todoMarkersActive()).toBe(false);
    G.state = 'worldwait';
    expect(todoMarkersActive()).toBe(false);
    G.state = 'world';
    expect(todoMarkersActive()).toBe(true);

    G.heatState.hq = setHeat(calmHeat(), 1, 0);
    expect(todoMarkersActive()).toBe(false);
    G.heatState.hq = setHeat(calmHeat(), 0, 0);
    expect(todoMarkersActive()).toBe(true);
    delete G.heatState.hq;
    expect(todoMarkersActive()).toBe(true);
  });

  it('todoMarkersActive: suppressed while an npcRun cutscene is in flight, true again after', () => {
    const npc: NpcDef = { id: 'runner', char: 'grunt', x: 5, y: 1, dir: DOWN };
    const map = makeHeatMap(['#########', '#       #', '#########'], [npc]);
    G.map = map;
    G.state = 'world';
    G.player.x = 1;
    G.player.y = 1;
    G.player.moving = false;
    G.player.prog = 0;
    let arrived = false;
    worldHooks.npcRun('runner', () => (arrived = true));
    G.frame = 0;
    for (G.frame = 1; G.frame <= 200 && !arrived; G.frame++) {
      expect(todoMarkersActive()).toBe(false); // cutscene owns the frame
      worldUpdate();
    }
    expect(arrived).toBe(true);
    expect(todoMarkersActive()).toBe(true); // resolved — world owns it again
  });
});

// ── SIDE.5: drill maps — lockdown resets instead of whiting out ──────────
describe('drill map lockdown (SIDE.5 training exemption)', () => {
  it('an expired stage-3 lockdown on a drill map resets the drill, no whiteout', () => {
    const map = { ...makeHeatMap(['#####', '#   #', '#####'], []), drill: { x: 1, y: 1 } };
    G.map = map;
    G.player.x = 3;
    G.player.y = 1;
    quest.coins = 100;
    G.heatState.corner = { stage: 3, decayAt: 999, lockdownAt: 5 };
    G.playSeconds = 10;
    expect(heatTick()).toBe(true);
    expect(quest.coins).toBe(100); // no coin loss in training
    expect(G.map.id).toBe('corner'); // same map — no HQ warp
    expect(G.player.x).toBe(1); // back on the drill start tile
    expect(G.player.y).toBe(1);
    expect(G.heatState.corner?.stage).toBe(1); // reset to alerted, lockdown disarmed
    expect(G.heatState.corner?.lockdownAt).toBeNull();
    // the caught explainer still opens as a real dialog on the next tick
    worldUpdate();
    expect(G.state).toBe('dialog');
    expect(G.dialog?.pages[0]).toEqual(['CAUGHT! NO', 'PENALTY HERE.']);
    expect(G.dialog?.pages[1]).toEqual(['BACK TO THE', 'START LINE.', 'GO AGAIN!']);
    G.dialog = null;
  });

  it('step:x,y scripts fire on ARRIVAL at the tile, no A press (the goal-pad class)', () => {
    const map = makeHeatMap(['#####', '#   #', '#####'], []);
    map.scripts['step:3,1'] = [{ setFlag: 'switchFound' }];
    G.map = map;
    G.player.x = 2;
    G.player.y = 1;
    G.player.dir = 'right';
    G.player.moving = true;
    G.player.prog = 15; // one frame from completing the step onto (3,1)
    worldUpdate();
    expect(G.player.x).toBe(3);
    expect(quest.flags.switchFound).toBe(true);
  });

  it('a non-drill map lockdown still whiteouts (the exemption is opt-in)', () => {
    const map = makeHeatMap(['#####', '#   #', '#####'], []);
    G.map = map;
    quest.coins = 100;
    G.heatState.corner = { stage: 3, decayAt: 999, lockdownAt: 5 };
    G.playSeconds = 10;
    expect(heatTick()).toBe(true);
    expect(quest.coins).toBe(90);
    expect(G.state).toBe('worldwait');
  });
});
