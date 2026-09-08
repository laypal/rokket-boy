// WORLD FX — the overworld's one draw-only effect layer (F38 JCE.0,
// .paul/PLAN.md 2026-09-07). The CH2.9 grass-rustle idiom (a module-local
// {x,y,t} list aged inside the draw) lifted into its own module, with the
// battleFx timeline shape on top: a per-id frame-count table, a pure
// `worldFxFrame(id, t)`, and a queue that worldDraw renders in world space
// after the sprites and before the fog mask.
//
// HARD RULES (F13's, carried): presentation only. Nothing here consumes any
// rng — variation is a pure function of the frame `t`; nothing here gates
// logic, pauses input, or is saved. A queued fx is observable only by the
// draw (and `activeWorldFx()` for tests).
import { FX_SPRITES, type FxSpriteId } from '../data/sprites';
import { OBJ_PAL, type Palette } from '../data/palettes';
import { ctx, decode, TILE } from '../engine/renderer';

export type WorldFxId = 'poof' | 'heal' | 'spark' | 'dust';

/** All ids, in card order — drives the script-ref lint and the tests.
 *  `alert` (the guard `!` pop) is NOT here: it is a dy schedule over the
 *  glyph worldDraw already draws off `spotFlash` (JCE.3), not a queued fx. */
export const WORLD_FX_IDS: readonly WorldFxId[] = ['poof', 'heal', 'spark', 'dust'];

/** One 8×8 particle from the battle pool, drawn at tile-origin + (dx, dy)
 *  on frames `from ≤ t < to`, rising `rise` px linearly over that window. */
export interface FxPart {
  sprite: FxSpriteId;
  dx: number;
  dy: number;
  from: number;
  to: number;
  rise?: number;
}

export interface WorldFxDef {
  /** Frames the fx lives; every part's `to` is ≤ this. */
  len: number;
  /** OBJ_PAL key; absent = the map's own BG palette (smoke in the room's greys). */
  pal?: string;
  parts: FxPart[];
}

// x offsets for the six heal sparks — the BFX.3 heal-item timeline scaled to
// one 16px tile (0/8/4 alternating so the column never repeats twice running).
const HEAL_XOFF = [0, 8, 4, 0, 8, 4];

export const WORLD_FX: Record<WorldFxId, WorldFxDef> = {
  // a smoke burst: centre puff, four corners bloom out and drift up, one
  // last puff lifts off the top — an NPC "disappearing in a puff"
  poof: {
    len: 20,
    parts: [
      { sprite: 'puff', dx: 4, dy: 4, from: 0, to: 12 },
      { sprite: 'puff', dx: -2, dy: -2, from: 3, to: 15, rise: 3 },
      { sprite: 'puff', dx: 10, dy: -2, from: 3, to: 15, rise: 3 },
      { sprite: 'puff', dx: -2, dy: 8, from: 3, to: 15, rise: 3 },
      { sprite: 'puff', dx: 10, dy: 8, from: 3, to: 15, rise: 3 },
      { sprite: 'puff', dx: 4, dy: 0, from: 8, to: 20, rise: 4 },
    ],
  },
  // six sparks spawned 3 frames apart, life 9, rising 12px — green ramp
  heal: {
    len: 24,
    pal: 'heal',
    parts: HEAL_XOFF.map((dx, i) => ({ sprite: 'spark' as const, dx, dy: 8, from: i * 3, to: i * 3 + 9, rise: 12 })),
  },
  // a flash then a twinkle over a tile — lift pads, card readers, chest glints
  spark: {
    len: 8,
    pal: 'gold',
    parts: [
      { sprite: 'star', dx: 4, dy: 4, from: 0, to: 4 },
      { sprite: 'spark', dx: 4, dy: 4, from: 4, to: 8 },
    ],
  },
  // one puff at the feet — the trail behind a chasing guard (JCE.3)
  dust: {
    len: 8,
    parts: [{ sprite: 'puff', dx: 4, dy: 10, from: 0, to: 8, rise: 2 }],
  },
};

/** Pure: the particles visible on frame `t` of `id`, as (sprite, dx, dy). */
export function worldFxFrame(id: WorldFxId, t: number): { sprite: FxSpriteId; dx: number; dy: number }[] {
  const out: { sprite: FxSpriteId; dx: number; dy: number }[] = [];
  for (const p of WORLD_FX[id].parts) {
    if (t < p.from || t >= p.to) continue;
    const rise = p.rise ? Math.floor((p.rise * (t - p.from)) / (p.to - p.from)) : 0;
    out.push({ sprite: p.sprite, dx: p.dx, dy: p.dy - rise });
  }
  return out;
}

// ── The queue ─────────────────────────────────────────────────────────────
interface Active {
  id: WorldFxId;
  x: number;
  y: number;
  t: number;
}
let queue: Active[] = [];

/** Play `id` over tile (x, y) of the current map. Never gates anything. */
export function playWorldFx(id: WorldFxId, x: number, y: number): void {
  queue.push({ id, x, y, t: 0 });
}

/** Drop every queued fx — landAt calls this so a warp never carries a puff
 *  from one map's (x, y) onto the next map's. */
export function clearWorldFx(): void {
  queue = [];
}

export function activeWorldFx(): readonly Readonly<Active>[] {
  return queue;
}

/** Draw the queue in world space and age it one frame (draw-only state ages
 *  with the draw — the rustle rule). Called by worldDraw after the sprites
 *  and the `!` glyphs, before the fog mask. */
export function drawWorldFx(camX: number, camY: number, mapPal: Palette): void {
  if (!queue.length) return;
  for (const f of queue) {
    const pal = WORLD_FX[f.id].pal ? OBJ_PAL[WORLD_FX[f.id].pal!] : mapPal;
    for (const p of worldFxFrame(f.id, f.t)) {
      ctx.drawImage(decode(FX_SPRITES[p.sprite], pal), f.x * TILE - camX + p.dx, f.y * TILE - camY + p.dy);
    }
    f.t++;
  }
  queue = queue.filter((f) => f.t < WORLD_FX[f.id].len);
}

// ── JCE.3: the guard beats that are NOT queued fx ─────────────────────────
// Both are pure schedules over counters world.ts already owns; the draw
// applies them. No sprite, no queue entry, no new state.

/** The sighting `!` pop-and-settle: `t` = frames since the acquisition
 *  (`STARTLE_FRAMES - spotFlash`). Returns the dy to ADD to the glyph —
 *  4px up on the first frame, settling in 2-frame steps, 0 from t=8 on. */
export function alertPop(t: number): number {
  if (t < 0 || t >= 8) return 0;
  return -(4 - (t >> 1));
}

/** Screen shake: `t` = frames left on world.ts's shake counter. ±1px by
 *  parity so consecutive frames cancel and the camera never drifts. */
export function shakeOffset(t: number): number {
  if (t <= 0) return 0;
  return t & 1 ? 1 : -1;
}
