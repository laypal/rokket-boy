// HEAT alarm system — pure module (plan §4.8, contracts frozen in .paul/PLAN.md).
// Data in, data out: no imports from state/world/battle/renderer, so it unit
// tests in Node. All timestamps are G.playSeconds values (gameplay seconds),
// never wall-clock; the world integration (1f.6) supplies them.
import type { Dir, MapDef } from '../types';
import { WALKABLE } from '../data/tiles';

export const DECAY_SECONDS = 30;
export const LOCKDOWN_SECONDS = 20;

export type HeatStage = 0 | 1 | 2 | 3;

export interface HeatState {
  stage: HeatStage;
  /** playSeconds timestamp when the next one-stage decay fires. */
  decayAt: number;
  /** playSeconds deadline of the stage-3 lockdown, null when not locked down. */
  lockdownAt: number | null;
}

/** The module only reads the tile grid — keeps test fixtures tiny. */
export type TileMap = Pick<MapDef, 'grid' | 'w' | 'h'>;

export function calmHeat(): HeatState {
  return { stage: 0, decayAt: 0, lockdownAt: null };
}

/** CH4.0 §1: maps in a zone (MapDef.heatZone) share one heat record, so a
 *  stage-3 timer follows the player across the S.S. ANN's decks and only the
 *  gangway warp OFF the ship clears it. No zone = the map's own id. */
export function heatKey(map: Pick<MapDef, 'id' | 'heatZone'>): string {
  return map.heatZone ?? map.id;
}

/** Absolute stage set (the { heat: n } contract). Resets the decay timer;
 *  starts/resets the lockdown timer at stage 3, cancels it below (3→2 via
 *  SMOKE BALL cancels lockdown).
 *
 *  CH4.0 §2: `opts.lockdown` (MapDef.lockdown, the ship's 5-minute heist
 *  clock) changes two things and only at stage 3 — an already-armed
 *  deadline is KEPT (a glimpse on the way out never resets the clock) and
 *  decay is parked on the deadline so the 30 s quiet-decay can't cancel the
 *  timer from under it. No opts = the 1f contract, untouched. */
export function setHeat(
  state: HeatState,
  stage: number,
  now: number,
  opts?: { lockdown: number },
): HeatState {
  const clamped = Math.max(0, Math.min(3, Math.floor(stage))) as HeatStage;
  if (clamped !== 3) return { stage: clamped, decayAt: now + DECAY_SECONDS, lockdownAt: null };
  if (!opts) return { stage: 3, decayAt: now + DECAY_SECONDS, lockdownAt: now + LOCKDOWN_SECONDS };
  const lockdownAt =
    state.stage === 3 && state.lockdownAt !== null ? state.lockdownAt : now + opts.lockdown;
  return { stage: 3, decayAt: Math.max(now + DECAY_SECONDS, lockdownAt), lockdownAt };
}

/** Called every world tick. Lockdown expiry wins over decay and returns the
 *  locked sentinel with state untouched — the caller owns the whiteout and
 *  the subsequent heat reset. Otherwise decays one stage per elapsed decay
 *  window (per-frame ticking makes this window-accurate). */
export function tickHeat(state: HeatState, now: number): { state: HeatState; locked: boolean } {
  if (state.stage === 3 && state.lockdownAt !== null && now >= state.lockdownAt) {
    return { state, locked: true };
  }
  if (state.stage > 0 && now >= state.decayAt) {
    return {
      state: {
        stage: (state.stage - 1) as HeatStage,
        decayAt: now + DECAY_SECONDS,
        lockdownAt: null,
      },
      locked: false,
    };
  }
  return { state, locked: false };
}

/** SMOKE BALL (§4.8, 1f.7): one stage off a map's heat, wherever it's used.
 *  Mutates the passed record (G.heatState in the game; a literal in tests) —
 *  battle.ts and menu.ts call this because neither may import world.ts (the
 *  world↔battle / world↔menu cycles). Absent or stage-0 map: no-op, never
 *  creates an entry. Reaching stage 0 deletes the entry (absent = calm,
 *  matching the 1f.6 decay). setHeat does the rest: decay window reset,
 *  3→2 nulls lockdownAt — the "cancels lockdown" contract. */
export function reduceHeat(
  heat: Partial<Record<string, HeatState>>,
  key: string,
  now: number,
): void {
  const state = heat[key];
  if (!state || state.stage === 0) return;
  if (state.stage === 1) {
    delete heat[key];
    return;
  }
  heat[key] = setHeat(state, state.stage - 1, now);
}

const DIRV: Record<Dir, [number, number]> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};

/** Out of bounds reads as wall — same rule as world.ts tileAt. */
function tileAt(map: TileMap, x: number, y: number): string {
  if (x < 0 || y < 0 || x >= map.w || y >= map.h) return '#';
  return map.grid[y][x];
}

/** Vision uses raw tile opacity, NOT isBlocked: NPCs live off-grid, so guards
 *  see through each other; walls are the only blocker in 1f. */
function opaque(map: TileMap, x: number, y: number): boolean {
  return !WALKABLE.has(tileAt(map, x, y));
}

const CONE_RANGE = 3;

/** The up-to-3 straight-ahead tiles a guard sees, nearest first. An opaque
 *  tile ends the ray and is itself excluded (nothing can stand in a wall). */
export function visibleTiles(
  facing: Dir, x: number, y: number, map: TileMap,
): { x: number; y: number }[] {
  const [dx, dy] = DIRV[facing];
  const tiles: { x: number; y: number }[] = [];
  for (let i = 1; i <= CONE_RANGE; i++) {
    const tx = x + dx * i;
    const ty = y + dy * i;
    if (opaque(map, tx, ty)) break;
    tiles.push({ x: tx, y: ty });
  }
  return tiles;
}

/** One greedy step toward the target: the axis with more remaining distance
 *  first (exact tie → x), falling back to the other axis when the greedy cell
 *  is a wall. Both blocked or no distance left → {0,0} (the guard waits).
 *  Blocking is tile-walkability only; NPC avoidance is the world's concern. */
export function stepToward(
  npc: { x: number; y: number },
  target: { x: number; y: number },
  map: TileMap,
): { dx: number; dy: number } {
  const dx = target.x - npc.x;
  const dy = target.y - npc.y;
  const xStep = { dx: Math.sign(dx), dy: 0 };
  const yStep = { dx: 0, dy: Math.sign(dy) };
  const order = Math.abs(dx) >= Math.abs(dy) ? [xStep, yStep] : [yStep, xStep];
  for (const step of order) {
    if (step.dx === 0 && step.dy === 0) continue;
    if (!opaque(map, npc.x + step.dx, npc.y + step.dy)) return step;
  }
  return { dx: 0, dy: 0 };
}
