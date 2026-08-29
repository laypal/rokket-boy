import { describe, it, expect } from 'vitest';
import {
  DECAY_SECONDS,
  LOCKDOWN_SECONDS,
  calmHeat,
  heatKey,
  setHeat,
  tickHeat,
  reduceHeat,
  visibleTiles,
  stepToward,
  type HeatState,
} from '../src/systems/heat';
import type { MapId } from '../src/types';

// All timestamps are G.playSeconds values (gameplay seconds, never wall-clock).
// Contract (frozen, .paul/PLAN.md "PLAN — Phase 1f: HEAT"): { heat: n } sets an
// absolute stage 0–3; decay −1 per 30 quiet seconds; stage 3 starts a
// 20-second lockdown; re-triggering 3 resets the timer; expiry is a sentinel.

describe('setHeat', () => {
  it('sets the stage absolutely, not incrementally', () => {
    const s3 = setHeat(calmHeat(), 3, 0);
    expect(s3.stage).toBe(3);
    const s1 = setHeat(s3, 1, 5);
    expect(s1.stage).toBe(1);
  });

  it('clamps stages outside 0–3', () => {
    expect(setHeat(calmHeat(), 7, 0).stage).toBe(3);
    expect(setHeat(calmHeat(), -2, 0).stage).toBe(0);
  });

  it('resets the decay timer to now + 30 on every set', () => {
    expect(setHeat(calmHeat(), 2, 100).decayAt).toBe(100 + DECAY_SECONDS);
    const early = setHeat(calmHeat(), 2, 0); // decayAt 30
    expect(setHeat(early, 2, 25).decayAt).toBe(25 + DECAY_SECONDS);
  });

  it('starts the 20-second lockdown timer at stage 3 and only there', () => {
    expect(setHeat(calmHeat(), 3, 10).lockdownAt).toBe(10 + LOCKDOWN_SECONDS);
    expect(setHeat(calmHeat(), 2, 10).lockdownAt).toBeNull();
  });

  it('re-triggering stage 3 resets the lockdown timer', () => {
    const first = setHeat(calmHeat(), 3, 0); // lockdownAt 20
    expect(setHeat(first, 3, 15).lockdownAt).toBe(15 + LOCKDOWN_SECONDS);
  });

  it('leaving stage 3 cancels the lockdown (SMOKE BALL 3→2 contract)', () => {
    const hot = setHeat(calmHeat(), 3, 0);
    expect(setHeat(hot, 2, 5).lockdownAt).toBeNull();
  });

  it('does not mutate its input state', () => {
    const before: HeatState = calmHeat();
    setHeat(before, 3, 0);
    expect(before).toEqual(calmHeat());
  });
});

// CH4.0 §2: a map-defined lockdown (MapDef.lockdown, the S.S. ANN's 5-minute
// heist clock) is passed as opts. It never extends once armed — a glimpse on
// the way out must not reset the clock — and it holds decay off until it
// expires, so the 30 s quiet-decay can't cancel the timer from under it.
describe('setHeat with a map lockdown (CH4.0)', () => {
  const opts = { lockdown: 300 };

  it('arms a fresh stage 3 for the map duration and parks decay on the deadline', () => {
    const s = setHeat(calmHeat(), 3, 10, opts);
    expect(s.lockdownAt).toBe(310);
    expect(s.decayAt).toBe(310);
  });

  it('re-triggering stage 3 keeps the EXISTING deadline (never extends)', () => {
    const armed = setHeat(calmHeat(), 3, 0, opts); // 300
    const again = setHeat(armed, 3, 100, opts);
    expect(again.lockdownAt).toBe(300);
    expect(again.decayAt).toBe(300);
  });

  it('does not decay before the deadline, then reports locked at it', () => {
    const armed = setHeat(calmHeat(), 3, 0, opts);
    expect(tickHeat(armed, 250)).toEqual({ state: armed, locked: false });
    expect(tickHeat(armed, 300).locked).toBe(true);
  });

  it('below stage 3 behaves like the default contract (no lockdown, 30 s decay)', () => {
    const s = setHeat(setHeat(calmHeat(), 3, 0, opts), 2, 5, opts);
    expect(s.lockdownAt).toBeNull();
    expect(s.decayAt).toBe(5 + DECAY_SECONDS);
  });

  it('leaves the default 1f contract untouched when no opts are passed', () => {
    const armed = setHeat(calmHeat(), 3, 0, opts); // 300
    expect(setHeat(armed, 3, 100).lockdownAt).toBe(100 + LOCKDOWN_SECONDS);
  });
});

describe('heatKey (CH4.0 §1 zones)', () => {
  it('is the map id unless the map names a zone', () => {
    expect(heatKey({ id: 'corner' })).toBe('corner');
    expect(heatKey({ id: 'corner', heatZone: 'ship' })).toBe('ship');
  });
});

describe('tickHeat', () => {
  it('decays one stage once 30 quiet seconds pass, resetting decayAt', () => {
    // BDD: Given stage 2 and no triggers for 30 s / When ticked /
    // Then stage is 1 and decayAt is reset.
    const s = setHeat(calmHeat(), 2, 0); // decayAt 30
    const { state, locked } = tickHeat(s, 30);
    expect(locked).toBe(false);
    expect(state.stage).toBe(1);
    expect(state.decayAt).toBe(30 + DECAY_SECONDS);
  });

  it('does nothing before the decay timer elapses', () => {
    const s = setHeat(calmHeat(), 2, 0);
    const { state, locked } = tickHeat(s, 29);
    expect(locked).toBe(false);
    expect(state).toEqual(s);
  });

  it('never decays below stage 0', () => {
    const { state, locked } = tickHeat(calmHeat(), 1000);
    expect(locked).toBe(false);
    expect(state.stage).toBe(0);
  });

  it('returns the locked sentinel when the lockdown expires', () => {
    // BDD: Given stage 3 set at t=0 / When tickHeat at t=20 /
    // Then the result carries locked: true.
    const s = setHeat(calmHeat(), 3, 0); // lockdownAt 20
    expect(tickHeat(s, 20).locked).toBe(true);
    expect(tickHeat(s, 19.9).locked).toBe(false);
  });

  it('leaves state untouched on lockdown expiry (world owns the whiteout)', () => {
    const s = setHeat(calmHeat(), 3, 0);
    const { state } = tickHeat(s, 25);
    expect(state).toEqual(s);
  });

  it('does not mutate its input state', () => {
    const s = setHeat(calmHeat(), 2, 0);
    const copy = { ...s };
    tickHeat(s, 30);
    expect(s).toEqual(copy);
  });
});

// ── vision cone ────────────────────────────────────────────────────────────

/** Rows of ' ' (walkable) and '#' (wall); w/h derived. */
function makeMap(rows: string[]) {
  return {
    grid: rows.map((r) => r.split('')),
    w: rows[0].length,
    h: rows.length,
  };
}

// 9×9 open room, walls on the rim; guard stands at (4,4).
const room = makeMap([
  '#########',
  '#       #',
  '#       #',
  '#       #',
  '#       #',
  '#       #',
  '#       #',
  '#       #',
  '#########',
]);

describe('visibleTiles', () => {
  it('sees the 3 straight-ahead tiles in each facing, nearest first', () => {
    expect(visibleTiles('up', 4, 4, room)).toEqual([
      { x: 4, y: 3 }, { x: 4, y: 2 }, { x: 4, y: 1 },
    ]);
    expect(visibleTiles('down', 4, 4, room)).toEqual([
      { x: 4, y: 5 }, { x: 4, y: 6 }, { x: 4, y: 7 },
    ]);
    expect(visibleTiles('left', 4, 4, room)).toEqual([
      { x: 3, y: 4 }, { x: 2, y: 4 }, { x: 1, y: 4 },
    ]);
    expect(visibleTiles('right', 4, 4, room)).toEqual([
      { x: 5, y: 4 }, { x: 6, y: 4 }, { x: 7, y: 4 },
    ]);
  });

  it('never extends past 3 tiles in an open corridor', () => {
    // corridor open from x=1 to x=9; guard at x=2 sees 3,4,5 only
    const corridor = makeMap(['###########', '#         #', '###########']);
    expect(visibleTiles('right', 2, 1, corridor)).toEqual([
      { x: 3, y: 1 }, { x: 4, y: 1 }, { x: 5, y: 1 },
    ]);
  });

  it('is truncated by a wall: the wall tile and everything past it are unseen', () => {
    // guard at (2,1); wall at (4,1) → only (3,1) is visible
    const blocked = makeMap(['#######', '#   # #', '#######']);
    expect(visibleTiles('right', 2, 1, blocked)).toEqual([{ x: 3, y: 1 }]);
  });

  it('is cut to nothing when facing straight into a wall', () => {
    expect(visibleTiles('up', 4, 1, room)).toEqual([]);
  });

  it('treats out-of-bounds as wall (map edge blocks the cone)', () => {
    // guard on the rim row of a wall-less map looking out
    const open = makeMap(['   ', '   ', '   ']);
    expect(visibleTiles('up', 1, 0, open)).toEqual([]);
  });
});

// ── greedy pathing ─────────────────────────────────────────────────────────

describe('stepToward', () => {
  it('steps along the axis with more remaining distance', () => {
    // dx = +3, dy = +1 → x wins
    expect(stepToward({ x: 1, y: 1 }, { x: 4, y: 2 }, room)).toEqual({ dx: 1, dy: 0 });
    // dx = +1, dy = −3 → y wins
    expect(stepToward({ x: 4, y: 5 }, { x: 5, y: 2 }, room)).toEqual({ dx: 0, dy: -1 });
  });

  it('breaks exact ties toward the x axis', () => {
    expect(stepToward({ x: 1, y: 1 }, { x: 4, y: 4 }, room)).toEqual({ dx: 1, dy: 0 });
  });

  it('skips a blocked cell by stepping on the other axis', () => {
    // wall at (2,1): the greedy x step from (1,1) toward (3,3) is blocked → step y
    const wall = makeMap([
      '#####',
      '# # #',
      '#   #',
      '#   #',
      '#####',
    ]);
    expect(stepToward({ x: 1, y: 1 }, { x: 3, y: 3 }, wall)).toEqual({ dx: 0, dy: 1 });
  });

  it('waits when every useful step is blocked', () => {
    // corridor: guard at (1,1), target at (3,1), wall between at (2,1);
    // no y distance to fall back on → stay put
    const pinch = makeMap(['#####', '# # #', '#####']);
    expect(stepToward({ x: 1, y: 1 }, { x: 3, y: 1 }, pinch)).toEqual({ dx: 0, dy: 0 });
  });

  it('stands still when already at the target', () => {
    expect(stepToward({ x: 4, y: 4 }, { x: 4, y: 4 }, room)).toEqual({ dx: 0, dy: 0 });
  });
});

describe('reduceHeat (1f.7 SMOKE BALL)', () => {
  it('drops one stage and resets the decay window', () => {
    const heat: Partial<Record<MapId, HeatState>> = { corner: setHeat(calmHeat(), 2, 0) };
    reduceHeat(heat, 'corner', 50);
    expect(heat.corner?.stage).toBe(1);
    expect(heat.corner?.decayAt).toBe(50 + DECAY_SECONDS);
  });

  it('3→2 cancels the lockdown (the no-whiteout contract)', () => {
    const heat: Partial<Record<MapId, HeatState>> = { corner: setHeat(calmHeat(), 3, 0) };
    reduceHeat(heat, 'corner', 15);
    expect(heat.corner?.stage).toBe(2);
    expect(heat.corner?.lockdownAt).toBeNull();
  });

  it('1→0 deletes the entry (absent = calm)', () => {
    const heat: Partial<Record<MapId, HeatState>> = { corner: setHeat(calmHeat(), 1, 0) };
    reduceHeat(heat, 'corner', 5);
    expect(heat.corner).toBeUndefined();
  });

  it('is a no-op on a calm map and never creates an entry', () => {
    const heat: Partial<Record<MapId, HeatState>> = {};
    reduceHeat(heat, 'corner', 5);
    expect(heat.corner).toBeUndefined();
    expect(Object.keys(heat)).toEqual([]);
  });
});
