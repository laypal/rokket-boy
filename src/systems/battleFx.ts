// BATTLE FX — pure, frame-driven effect timelines (13-battle-fx.md, BFX.1).
// This module is the planned split of battle.ts's draw/FX code: hit-shake,
// sprite positioning, and the per-move effect engine all live here.
//
// HARD RULE: presentation only. Nothing in this file may consume battleRng —
// cosmetic variation derives from the frame counter `t` alone, so the seeded
// battle snapshots stay byte-identical with FX in the loop.
import type { FxId } from '../types';
import type { TypeId } from '../data/typeChart';
import { FX_SPRITES, type FxSpriteId } from '../data/sprites';
import { typePal, OBJ_PAL, type Palette } from '../data/palettes';
import { ctx, decode, rect, clamp, W } from '../engine/renderer';
import { EASE, lerp, tween } from '../engine/easing';
import type { BattleState } from './battle'; // type-only: no runtime cycle (1f.4 precedent)
import type { XpFillSeg } from './mon'; // type-only — the segs are built by battle.ts

/** All effect ids, in card order — drives lints and tests. */
export const FX_IDS: readonly FxId[] = ['lunge', 'rings', 'gas', 'lob', 'bolt', 'blast'];

// ── QOL.4 / QOL.11 pure helpers (draw-only; battle.ts is the sole caller) ──
/** QOL.4: eased hp-bar value for the draw frame `t` frames into a heal — the
 *  real mon.hp already snapped instantly (battle.ts logic never waits on
 *  this); battleDraw shows this instead of the true hp while b.hpAnim is
 *  active. Clamped past `len` so callers don't have to. */
export function tweenHp(from: number, to: number, t: number, len = 20): number {
  return Math.round(lerp(from, to, clamp(t / len, 0, 1)));
}

/** QOL.11: floating damage-number timeline — rises 8px over 30 frames, then
 *  blinks on/off every 2 frames through the last 10 as it fades. Pure
 *  function of elapsed frame `t`; battle.ts owns the amt/color/anchor and the
 *  b.float expiry, this only answers "where" and "draw it this frame or not".
 *  UX2.3: `boosted` (super-effective hits) swaps in a longer, taller timeline
 *  with a wider blink window — the default (boosted=false) shape is
 *  bit-identical to the pre-UX2.3 formula above (existing pins are the
 *  proof). */
export const FLOAT_LEN = 30;
export const FLOAT_RISE = 8;
export const FLOAT_LEN_SUPER = 42;
export const FLOAT_RISE_SUPER = 10;
export function floatFrame(t: number, boosted = false): { dy: number; show: boolean } {
  const LEN = boosted ? FLOAT_LEN_SUPER : FLOAT_LEN;
  const RISE = boosted ? FLOAT_RISE_SUPER : FLOAT_RISE;
  const BLINK = boosted ? 16 : 10;
  const dy = -10 - Math.floor((t / LEN) * RISE);
  const show = t < LEN && (t < LEN - BLINK || (t & 2) === 0);
  return { dy, show };
}

// ── UX2.1: post-win xp fill timeline ─────────────────────────────────────
/** Each segment fills linearly over XP_SEG_LEN frames; every level cross
 *  (segment boundary except the last) holds the bar full for XP_FLASH_LEN
 *  frames while `show` blinks every 3 (the floatFrame idiom). Pure function
 *  of elapsed frame t — battle.ts owns the segs (mon.ts xpFillSegs) and the
 *  b.xpAnim expiry; this only answers "how full, drawn this frame or not". */
export const XP_SEG_LEN = 30;
export const XP_FLASH_LEN = 10;
export function xpFillFrame(segs: XpFillSeg[], t: number): { fill: number; show: boolean; done: boolean } {
  const span = XP_SEG_LEN + XP_FLASH_LEN;
  const last = segs.length - 1;
  const total = segs.length * XP_SEG_LEN + last * XP_FLASH_LEN;
  if (t >= total) return { fill: segs[last].to, show: true, done: true };
  const k = Math.min(last, Math.floor(t / span));
  const tk = t - k * span;
  if (tk >= XP_SEG_LEN) return { fill: 1, show: (Math.floor(t / 3) & 1) === 0, done: false };
  const seg = segs[k];
  return { fill: seg.from + (seg.to - seg.from) * (tk / XP_SEG_LEN), show: true, done: false };
}

// ── UX2.4: evolution cinematic timeline ──────────────────────────────────
/** Frames the scene spends holding before the pulse starts. */
export const EVO_HOLD = 45;
/** Frame the accelerating silhouette ramp ends and the whiteout begins. */
export const EVO_RAMP_END = 225;
/** Frame the whiteout ends and the reveal begins. */
export const EVO_WHITE_END = 245;
/** Frame the reveal completes. UX2.4-FB: the scene does NOT hand back here —
 *  it holds on the revealed mon with its name boxed until A confirms
 *  (battle.ts owns the wait; 'done' just means "fully revealed"). */
export const EVO_END = 305;
/** A fast-forwards here — the start of the reveal, so the outcome is unchanged. */
export const EVO_SKIP_TO = 245;
/** A does nothing before this frame: A is also the button that CONFIRMED the
 *  evolution, so without a dead-zone the same press skips the scene it started
 *  (the UX2.1 mash-A lesson). */
export const EVO_SKIP_ARM = 30;
/** Frames per flat shade step in the reveal (2 steps, then full colour).
 *  UX2.4-FB: doubled 15 -> 30 — the reveal is the slow half of the arc, the
 *  counterweight to the accelerating ramp that precedes it. */
export const EVO_REVEAL_STEP = 30;
const EVO_PERIOD_FROM = 24;
const EVO_PERIOD_TO = 4;

function buildEvoFlips(): number[] {
  const out: number[] = [];
  const span = EVO_RAMP_END - EVO_HOLD;
  let t = EVO_HOLD;
  while (t < EVO_RAMP_END) {
    out.push(t);
    const p = (t - EVO_HOLD) / span;
    t += Math.max(EVO_PERIOD_TO, Math.round(EVO_PERIOD_FROM - (EVO_PERIOD_FROM - EVO_PERIOD_TO) * p));
  }
  return out;
}

/** Frames on which the ramp swaps which sprite is silhouetted. Frozen: the
 *  gaps shrink 24 -> 4, and a change here re-times the crescendo the sting
 *  is written against. */
export const EVO_FLIPS: readonly number[] = buildEvoFlips();

export interface EvoFrame {
  phase: 'hold' | 'ramp' | 'white' | 'reveal' | 'done';
  showNew: boolean; // draw the evolved species instead of the current one
  shade: 0 | 1 | 2 | 3; // 0..2 = flat fill in pal[shade]; 3 = the sprite's real palette
  white: boolean; // cover the whole screen in pal[3]
}

/** Pure frame -> what to draw. battle.ts owns the elapsed count and the
 *  hand-off; this decides nothing about the evolution itself. */
export function evolveFrame(t: number): EvoFrame {
  if (t >= EVO_END) return { phase: 'done', showNew: true, shade: 3, white: false };
  if (t >= EVO_WHITE_END) {
    const step = Math.floor((t - EVO_WHITE_END) / EVO_REVEAL_STEP);
    const shade: 0 | 1 | 2 | 3 = step === 0 ? 2 : step === 1 ? 1 : 3;
    return { phase: 'reveal', showNew: true, shade, white: false };
  }
  if (t >= EVO_RAMP_END) return { phase: 'white', showNew: true, shade: 3, white: true };
  if (t >= EVO_HOLD) {
    let flips = 0;
    for (const f of EVO_FLIPS) if (f <= t) flips++;
    return { phase: 'ramp', showNew: (flips & 1) === 1, shade: 0, white: false };
  }
  return { phase: 'hold', showNew: false, shade: 3, white: false };
}

/**
 * Non-move battle interactions (13-battle-fx.md, BFX.3): heal item, SMOKE
 * BALL, ball throw (success/fail), faint. A SEPARATE union from `FxId` — no
 * `MoveDef` ever references these, so the roster lint ("every FxId is used by
 * at least one move") stays meaningful. Scene ids are engine-internal only.
 */
export type SceneFxId = 'heal' | 'smoke' | 'throwOk' | 'throwFail' | 'faint';
export type AnyFxId = FxId | SceneFxId;
export const SCENE_FX_IDS: readonly SceneFxId[] = ['heal', 'smoke', 'throwOk', 'throwFail', 'faint'];

function isSceneFx(fx: AnyFxId): fx is SceneFxId {
  return (SCENE_FX_IDS as readonly string[]).includes(fx);
}

export interface FxParticle {
  x: number;
  y: number;
  sprite: FxSpriteId;
  pal: Palette;
}
export interface FxPrims {
  dx: number; // attacker sprite pixel offset
  dy: number;
  particles: FxParticle[]; // absolute screen coords (sprite centres)
  flash: boolean; // full-field flash flag
  shake: number; // extra scene shake amplitude (px)
  hideDefender: boolean; // BFX.3 — true while the ball-throw swallow hides the foe sprite
}
export interface ActiveFx {
  id: AnyFxId;
  t: number;
  side: 'me' | 'foe';
  type: TypeId;
  done: () => void;
}

// Sprite-centre anchors from battleDraw geometry: player back sprite is drawn
// at (8,52) 48×40, foe front at (96,2) 56×56.
export const ME_ANCHOR = { x: 32, y: 72 } as const;
export const FOE_ANCHOR = { x: 124, y: 30 } as const;

// Timeline lengths (frames, hard cap 45 per card). Named so BFX.4 tuning
// touches constants, not shapes.
const LEN: Record<FxId, number> = {
  lunge: 20,
  rings: 30,
  gas: 37, // last puff spawns at 16 + LIFE 20 = dead by 36, so the final frame is clean
  lob: 30,
  bolt: 20,
  blast: 36,
};

// gas puff x-offsets from the defender anchor (BFX.2 design table).
const GAS_XOFF = [-12, -6, 0, 6, 12];

// Scene effect lengths (BFX.3). Deliberate deviation from the move cap: the
// 45-frame cap exists so battles don't drag BETWEEN moves; a ball throw is a
// set piece (Gen 1's is ~2s), so scene effects are capped at 90 instead.
const SCENE_LEN: Record<SceneFxId, number> = {
  heal: 34,
  smoke: 43,
  throwFail: 60,
  throwOk: 78,
  faint: 26,
};

// heal spark x-offsets from the healed mon's anchor.
const HEAL_XOFF = [-15, -9, -3, 3, 9, 15];

// smoke puff grid — 4 columns x 3 rows, absolute screen coords; index
// k = row * 4 + col (row-major, matching the frozen spec's k formula).
const SMOKE_X = [20, 60, 100, 140];
const SMOKE_Y = [16, 48, 80];
const SMOKE_POS: { x: number; y: number }[] = [];
for (const y of SMOKE_Y) for (const x of SMOKE_X) SMOKE_POS.push({ x, y });

// ball-throw wobble (QOL.2) — a base shape scaled by a per-cycle amplitude
// that decays, so the struggle reads as a losing fight instead of a loop.
// Cycle 0 at amp 4 reproduces the old flat WOB array exactly (pinned by a
// test) — two 12-frame cycles for throwFail, three for throwOk.
const WOB_SHAPE = [0, -0.75, -1, -0.75, 0, 0.75, 1, 0.75, 0, 0, 0, 0];
const THROWFAIL_AMPS = [4, 2];
const THROWOK_AMPS = [4, 3, 2];

/** Wobble offset for wobble-frame `w` (0-based from the start of the wobble
 * region): the shape scaled by the amplitude of its 12-frame cycle. */
function wobOffset(w: number, amps: readonly number[]): number {
  const amp = amps[Math.floor(w / 12)] ?? 0;
  return Math.round(WOB_SHAPE[w % 12] * amp);
}

// Scene effects pick their palette by id (no move type applies) — Callers
// pass 'NORMAL' as the type for every scene effect; it is ignored.
const SCENE_PAL: Record<SceneFxId, string> = {
  heal: 'heal',
  smoke: 'koffink',
  throwOk: 'gold',
  throwFail: 'gold',
  faint: 'guard',
};

export function fxLength(fx: AnyFxId): number {
  return isSceneFx(fx) ? SCENE_LEN[fx] : LEN[fx];
}

/**
 * Draw primitives for frame `t` of an effect. Pure and deterministic: the
 * same (fx, t, side, type) always yields the same output. `side` is the
 * ATTACKER's side; 'foe' mirrors every trajectory (dx sign included).
 *
 * BFX.1 scope: `lunge` is the fully-realised reference effect; the other five
 * are basic type-tinted placeholders that BFX.2 shapes per the design table.
 */
export function fxFrame(fx: AnyFxId, t: number, side: 'me' | 'foe', type: TypeId): FxPrims {
  t = clamp(t, 0, fxLength(fx) - 1);
  const dir = side === 'me' ? 1 : -1;
  const atk = side === 'me' ? ME_ANCHOR : FOE_ANCHOR;
  const def = side === 'me' ? FOE_ANCHOR : ME_ANCHOR;
  const pal = isSceneFx(fx) ? OBJ_PAL[SCENE_PAL[fx]] : typePal(type);
  const p: FxPrims = { dx: 0, dy: 0, particles: [], flash: false, shake: 0, hideDefender: false };

  switch (fx) {
    case 'lunge': {
      // thrust 0..7 → 8px toward the defender, hold, ease-out return; star
      // burst blooms at the defender over the contact frames.
      if (t < 8) p.dx = dir * t;
      else if (t < 12) p.dx = dir * 8;
      else p.dx = dir * Math.round(8 * (1 - tween(t - 11, 8, EASE.decelerate)));
      if (t >= 8 && t < 16) {
        const r = 3 + (t - 8);
        for (const [ox, oy] of [[-r, -r], [r, -r], [-r, r], [r, r]]) {
          p.particles.push({ x: def.x + ox, y: def.y + oy, sprite: 'star', pal });
        }
      }
      break;
    }
    case 'rings': {
      // three rings launched 6 frames apart, each travelling atk→def in 18,
      // with a perpendicular flanking pair either side of the centre. Push
      // order is centre, then +spread, then -spread (a test pins this).
      const vx = def.x - atk.x;
      const vy = def.y - atk.y;
      const L = Math.hypot(vx, vy);
      const nx = -vy / L;
      const ny = vx / L;
      for (let i = 0; i < 3; i++) {
        const rt = t - i * 6;
        if (rt < 0 || rt >= 18) continue;
        const f = rt / 18;
        const cx = Math.round(lerp(atk.x, def.x, f));
        const cy = Math.round(lerp(atk.y, def.y, f));
        const sp = 2 + Math.round(10 * f);
        p.particles.push({ x: cx, y: cy, sprite: 'ring', pal });
        p.particles.push({ x: cx + Math.round(nx * sp), y: cy + Math.round(ny * sp), sprite: 'ring', pal });
        p.particles.push({ x: cx - Math.round(nx * sp), y: cy - Math.round(ny * sp), sprite: 'ring', pal });
      }
      break;
    }
    case 'gas': {
      // five puffs, spawned 4 frames apart, LIFE 20: bloom over the defender,
      // wobble 2px, and rise 0..9px without wrapping (BFX.1's `pt % 16` reset
      // popped visibly — that pop is the bug this card fixes).
      for (let i = 0; i < 5; i++) {
        const pt = t - i * 4;
        if (pt < 0 || pt >= 20) continue;
        p.particles.push({
          x: def.x + GAS_XOFF[i] + ((pt >> 2) & 1 ? 1 : -1),
          y: def.y - Math.floor((pt * 10) / 20),
          sprite: 'puff',
          pal,
        });
      }
      break;
    }
    case 'lob': {
      // one projectile puff arcs atk→def (~16px apex) over 18 frames, then
      // splats into a five-point burst that grows on the defender.
      if (t < 18) {
        const f = t / 17;
        p.particles.push({
          x: Math.round(lerp(atk.x, def.x, f)),
          y: Math.round(lerp(atk.y, def.y, f)) - Math.round(16 * 4 * f * (1 - f)),
          sprite: 'puff',
          pal,
        });
      } else {
        const r = Math.min(13, 2 + (t - 18));
        for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [-1, -1], [1, -1]]) {
          p.particles.push({ x: def.x + ox * r, y: def.y + oy * r, sprite: 'puff', pal });
        }
      }
      break;
    }
    case 'bolt': {
      // jagged spark chain strobing along the atk→def line, anchors included
      // (verbatim from BFX.1 — the unjagged endpoints are what make the
      // chain touch both anchors, pinned by a test).
      if ((t & 3) < 2) {
        for (let i = 0; i <= 4; i++) {
          const f = i / 4;
          const jag = i === 0 || i === 4 ? 0 : ((i + (t >> 1)) & 1 ? 3 : -3);
          p.particles.push({
            x: Math.round(lerp(atk.x, def.x, f)),
            y: Math.round(lerp(atk.y, def.y, f)) + jag,
            sprite: 'spark',
            pal,
          });
        }
      }
      // NEW — defender crackle: a tight rotating cross reads as a localised
      // flash without claiming FxPrims.flash (that stays blast's signature —
      // BFX.2 plan deviation note).
      if (t >= 12 && t < 18) {
        const cross = (t >> 1) & 1 ? [[-4, 0], [4, 0], [0, -4], [0, 4]] : [[-3, -3], [3, -3], [-3, 3], [3, 3]];
        for (const [ox, oy] of cross) {
          p.particles.push({ x: def.x + ox, y: def.y + oy, sprite: 'spark', pal });
        }
      }
      break;
    }
    case 'blast': {
      // full-field double flash, decaying shake, bigger/faster star burst.
      p.flash = (t >= 0 && t < 4) || (t >= 8 && t < 12);
      if (t < 4) p.shake = 0;
      else if (t < 12) p.shake = 3;
      else if (t < 20) p.shake = 2;
      else if (t < 28) p.shake = 1;
      else p.shake = 0;
      if (t >= 4) {
        const r = Math.min(28, 2 * (t - 3));
        for (const [ox, oy] of [[2, 0], [1, 2], [-1, 2], [-2, 0], [-1, -2], [1, -2]]) {
          p.particles.push({
            x: def.x + Math.round((ox * r) / 2),
            y: def.y + Math.round((oy * r) / 2),
            sprite: 'star',
            pal,
          });
        }
      }
      break;
    }
    // ── BFX.3 scene effects (item/ball-throw/faint feel) ──────────────────
    case 'heal': {
      // six sparks over the healed mon, spawned 3 frames apart, life 18,
      // rising 0..24px. No `flash` — the green reads through the palette
      // instead (same call BFX.2 made for `bolt`: `flash` stays blast-only).
      for (let i = 0; i < 6; i++) {
        const pt = t - i * 3;
        if (pt < 0 || pt >= 18) continue;
        p.particles.push({
          x: atk.x + HEAL_XOFF[i],
          y: atk.y + 8 - Math.floor((pt * 24) / 18),
          sprite: 'spark',
          pal,
        });
      }
      break;
    }
    case 'smoke': {
      // 12 puffs over a 4x3 grid, absolute screen coords (side is ignored —
      // the field billows to full cover before the flee text plays).
      for (let k = 0; k < SMOKE_POS.length; k++) {
        const pt = t - k * 2;
        if (pt < 0 || pt >= 20) continue;
        p.particles.push({
          x: SMOKE_POS[k].x + ((pt >> 2) & 1 ? 1 : -1),
          y: SMOKE_POS[k].y - Math.floor((pt * 6) / 20),
          sprite: 'puff',
          pal,
        });
      }
      break;
    }
    case 'throwFail': {
      // arc atk(me)->def(foe), swallow + sparks, two decaying wobbles, then a
      // 2-frame pop (QOL.2) as the ball visibly bursts open and the mon
      // reappears (hideDefender resets to false at the pop), into the burst.
      if (t < 18) {
        const f = t / 17;
        p.particles.push({
          x: Math.round(lerp(ME_ANCHOR.x, FOE_ANCHOR.x, f)),
          y: Math.round(lerp(ME_ANCHOR.y, FOE_ANCHOR.y, f)) - Math.round(20 * 4 * f * (1 - f)),
          sprite: 'ball',
          pal,
        });
      } else if (t < 46) {
        p.hideDefender = true;
        const bx = t < 22 ? FOE_ANCHOR.x : FOE_ANCHOR.x + wobOffset(t - 22, THROWFAIL_AMPS);
        p.particles.push({ x: bx, y: FOE_ANCHOR.y, sprite: 'ball', pal });
        if (t < 22) {
          for (const ox of [-6, 0, 6]) {
            p.particles.push({ x: FOE_ANCHOR.x + ox, y: FOE_ANCHOR.y, sprite: 'spark', pal });
          }
        }
      } else if (t === 46) {
        // pop, frame 1: ball still visible, sparks kick out to the ±5
        // diagonals — the visible "open" beat the old flat burst lacked.
        p.particles.push({ x: FOE_ANCHOR.x, y: FOE_ANCHOR.y, sprite: 'ball', pal });
        for (const [ox, oy] of [[-5, -5], [5, -5], [-5, 5], [5, 5]]) {
          p.particles.push({ x: FOE_ANCHOR.x + ox, y: FOE_ANCHOR.y + oy, sprite: 'spark', pal });
        }
      } else if (t === 47) {
        // pop, frame 2: ball gone, sparks punch out to the ±8 diagonals.
        for (const [ox, oy] of [[-8, -8], [8, -8], [-8, 8], [8, 8]]) {
          p.particles.push({ x: FOE_ANCHOR.x + ox, y: FOE_ANCHOR.y + oy, sprite: 'spark', pal });
        }
      } else if (t < 57) {
        // burst: five sparks growing outward, t 48..56.
        const r = Math.min(12, 3 + (t - 48));
        for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [-1, -1], [1, -1]]) {
          p.particles.push({ x: FOE_ANCHOR.x + ox * r, y: FOE_ANCHOR.y + oy * r, sprite: 'spark', pal });
        }
      }
      // t 57..59: nothing — final frame clean.
      break;
    }
    case 'throwOk': {
      // identical arc/swallow to throwFail but THREE decaying wobbles, then
      // (QOL.2) the ball stops dead before glowing — a palette-bright pulse
      // that holds to the FINAL frame and hands straight over to b.caught
      // (battle.ts): hideDefender releasing early would flash the caught mon
      // back on screen for the closing frames.
      if (t < 18) {
        const f = t / 17;
        p.particles.push({
          x: Math.round(lerp(ME_ANCHOR.x, FOE_ANCHOR.x, f)),
          y: Math.round(lerp(ME_ANCHOR.y, FOE_ANCHOR.y, f)) - Math.round(20 * 4 * f * (1 - f)),
          sprite: 'ball',
          pal,
        });
      } else {
        p.hideDefender = true;
        if (t < 22) {
          p.particles.push({ x: FOE_ANCHOR.x, y: FOE_ANCHOR.y, sprite: 'ball', pal });
          for (const ox of [-6, 0, 6]) {
            p.particles.push({ x: FOE_ANCHOR.x + ox, y: FOE_ANCHOR.y, sprite: 'spark', pal });
          }
        } else if (t < 58) {
          // three 12-frame wobbles, t 22..57, amplitude decaying per cycle.
          p.particles.push({
            x: FOE_ANCHOR.x + wobOffset(t - 22, THROWOK_AMPS),
            y: FOE_ANCHOR.y,
            sprite: 'ball',
            pal,
          });
        } else if (t < 60) {
          // stop dead: ball alone at rest, t 58..59 — no stars yet.
          p.particles.push({ x: FOE_ANCHOR.x, y: FOE_ANCHOR.y, sprite: 'ball', pal });
        } else {
          // glow: ball holds position; four stars pulse at the diagonals,
          // radius alternating 6/9 every 4 frames, heal-palette green
          // against the gold ball — t 60..77, the FINAL frame stays lit
          // straight into "Gotcha!" (overlap, not a gap).
          p.particles.push({ x: FOE_ANCHOR.x, y: FOE_ANCHOR.y, sprite: 'ball', pal });
          const u = t - 60;
          const r = (u >> 2) & 1 ? 9 : 6;
          for (const [ox, oy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
            p.particles.push({ x: FOE_ANCHOR.x + ox * r, y: FOE_ANCHOR.y + oy * r, sprite: 'star', pal: OBJ_PAL['heal'] });
          }
        }
      }
      break;
    }
    case 'faint': {
      // the fainting sprite slides 56px down and off-frame. Deliberately does
      // NOT settle to dy=0 on the final frame — that "offset settles to zero"
      // invariant is a MOVE-effect rule; this is the named exception (the
      // sprite is then hidden because its hp is 0, see spriteShown).
      p.dy = Math.round(56 * tween(t, 25, EASE.accelerate));
      break;
    }
  }
  // `dir * 0` yields -0 on the mirrored side; normalise so consumers (and
  // Object.is-based test matchers) see a plain 0.
  p.dx ||= 0;
  p.dy ||= 0;
  return p;
}

// ── timeline driver (update-side) ─────────────────────────────────────────
/** Start an effect; `done` fires when it ends and hands back to the say/damage chain. */
export function playFx(b: BattleState, fx: AnyFxId, side: 'me' | 'foe', type: TypeId, done: () => void): void {
  b.fx = { id: fx, t: 0, side, type, done };
}

/** Advance the active effect one frame; called from battleUpdate's 'anim' case. */
export function tickFx(b: BattleState): void {
  if (!b.fx) return;
  b.fx.t++;
  if (b.fx.t >= fxLength(b.fx.id)) {
    const done = b.fx.done;
    b.fx = null;
    done();
  }
}

// ── hit shake + sprite positioning (moved verbatim from battle.ts) ────────
export const SHAKE_FRAMES = 14;
/**
 * Hit-shake x-offset. Amplitude eases out (ease-out on the remaining fraction
 * gives an exponential-ish settle), sign oscillates on the `& 2` bit like the
 * original square wave. Integer for pixel-art crispness. `left` is the shake
 * counter after this frame's decrement (SHAKE_FRAMES-1 .. 0).
 */
export function shakeOffset(left: number): number {
  const amp = lerp(0, 3, tween(left, SHAKE_FRAMES, EASE.decelerate));
  return Math.round((left & 2 ? 1 : -1) * amp);
}

/**
 * Battle sprite positions for this draw frame: entrance slide (eased), hit
 * shake (decrements the counters — call once per draw, as battleDraw did),
 * and the active effect's attacker offset + scene shake folded in.
 */
export function spritePos(b: BattleState): { me: { x: number; y: number }; foe: { x: number; y: number }; slide: number } {
  const slide = clamp(b.t / 40, 0, 1);
  const slideE = EASE.decelerate(slide);
  let fx = 96 + Math.round((1 - slideE) * 70);
  let fy = 2;
  let mx = 8 - Math.round((1 - slideE) * 70);
  let my = 52;
  if (b.shakeFoe > 0) {
    b.shakeFoe--;
    fx += shakeOffset(b.shakeFoe);
  }
  if (b.shakeMe > 0) {
    b.shakeMe--;
    mx += shakeOffset(b.shakeMe);
  }
  if (b.fx) {
    const p = fxFrame(b.fx.id, b.fx.t, b.fx.side, b.fx.type);
    if (b.fx.side === 'me') {
      mx += p.dx;
      my += p.dy;
    } else {
      fx += p.dx;
      fy += p.dy;
    }
    if (p.shake) {
      const s = (b.t & 2 ? 1 : -1) * p.shake;
      mx += s;
      fx += s;
    }
  }
  return { me: { x: mx, y: my }, foe: { x: fx, y: fy }, slide };
}

/** Draw the active effect's overlay: field flash + particles at 2× (16×16). */
export function drawFxOverlay(b: BattleState): void {
  if (!b.fx) return;
  const p = fxFrame(b.fx.id, b.fx.t, b.fx.side, b.fx.type);
  if (p.flash) rect(0, 0, W, 96, '#f8f8f0');
  for (const pt of p.particles) {
    ctx.drawImage(decode(FX_SPRITES[pt.sprite], pt.pal), pt.x - 8, pt.y - 8, 16, 16);
  }
}

/**
 * Whether a battle sprite should be drawn this frame (BFX.3). Plain `hp > 0`
 * breaks two ways once scene fx exist: a fainting sprite must stay visible at
 * 0 hp while it slides out, and a swallowed foe must vanish at full hp. Order
 * matters — checked top to bottom, first match wins:
 *  1. an active `faint` fx on THIS side always shows it (the slide must be
 *     seen at 0 hp);
 *  2. an active fx that sets `hideDefender` this frame hides its DEFENDER
 *     side (the opposite of `fx.side`, which is the attacker/thrower);
 *  3. `b.caught` hides the foe once the throwOk fx has ended (hideDefender
 *     only lasts while the fx is active — see the throwOk case in fxFrame);
 *  4. otherwise, plain `hp > 0`.
 */
export function spriteShown(b: BattleState, side: 'me' | 'foe', hp: number): boolean {
  if (b.fx) {
    if (b.fx.id === 'faint' && b.fx.side === side) return true;
    const frame = fxFrame(b.fx.id, b.fx.t, b.fx.side, b.fx.type);
    const defenderSide = b.fx.side === 'me' ? 'foe' : 'me';
    if (frame.hideDefender && side === defenderSide) return false;
  }
  if (b.caught && side === 'foe') return false;
  return hp > 0;
}
