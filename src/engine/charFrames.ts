// Build full 16×16 frame canvases per character.
// Frames per direction: [stand, stepA, stepB] — stepB is stepA mirrored.
import { decode } from './renderer';
import { CHARSETS, MYOWTH_A, MYOWTH_B, ZUBATT_OW_A, ZUBATT_OW_B, composeCharset, wornGear, type Charset } from '../data/chars';
import { OBJ_PAL } from '../data/palettes';
// (OBJ_PAL.player is the five-shade player palette — RNK.5c)
import { mirrorRows, stack } from '../data/sprites';
import type { Dir } from '../types';

export type CharFrameSet = Record<Dir, HTMLCanvasElement[]>;
export const CHAR_FRAMES: Record<string, CharFrameSet> = {};

function buildSet(cs: Charset): CharFrameSet {
  const p = cs.pal;
  const hd = cs.head;
  const bd = cs.body;
  const dStand = stack(hd.d, bd.d0);
  const dStep = stack(hd.d, bd.d1);
  const uStand = stack(hd.u, bd.u0);
  const uStep = stack(hd.u, bd.u1);
  const sStand = stack(hd.s, bd.s0);
  const sStep = stack(hd.s, bd.s1);
  return {
    down: [decode(dStand, p), decode(dStep, p), decode(mirrorRows(dStep), p)],
    up: [decode(uStand, p), decode(uStep, p), decode(mirrorRows(uStep), p)],
    left: [decode(sStand, p), decode(sStep, p), decode(sStand, p)],
    right: [decode(mirrorRows(sStand), p), decode(mirrorRows(sStep), p), decode(mirrorRows(sStand), p)],
  };
}

export function buildCharFrames(): void {
  for (const [name, cs] of Object.entries(CHARSETS)) CHAR_FRAMES[name] = buildSet(cs);
  const myowthDown = [
    decode(MYOWTH_A, OBJ_PAL.myowth),
    decode(MYOWTH_B, OBJ_PAL.myowth),
    decode(MYOWTH_A, OBJ_PAL.myowth),
  ];
  CHAR_FRAMES.myowth = { down: myowthDown, up: myowthDown, left: myowthDown, right: myowthDown };
  const zubattDown = [
    decode(ZUBATT_OW_A, OBJ_PAL.zubatt),
    decode(ZUBATT_OW_B, OBJ_PAL.zubatt),
    decode(ZUBATT_OW_A, OBJ_PAL.zubatt),
  ];
  CHAR_FRAMES.zubatt = { down: zubattDown, up: zubattDown, left: zubattDown, right: zubattDown };
  buildPlayerFrames([]); // CHAR_FRAMES.player always exists, gear or not
}

// ── RNK.5a: the player's frames are grunt + worn gear ────────────────────
// Signature = the pieces that would actually draw, so ensurePlayerFrames is
// a cheap per-frame guard: buying a SODA or a duplicate coat rebuilds
// nothing, a promotion or gear purchase rebuilds once. Title/intro scenes
// keep drawing plain CHAR_FRAMES.grunt on purpose.
let playerSig: string | null = null;

export function buildPlayerFrames(ownedGearIds: string[]): void {
  // RNK.5c: decode with the five-shade PLAYER palette so gear rows may use
  // gold (digit 4); the grunt rows themselves only ever use 0–3, so with no
  // gear the result is pixel-identical to CHAR_FRAMES.grunt.
  const cs = composeCharset(CHARSETS.grunt, ownedGearIds);
  CHAR_FRAMES.player = buildSet({ ...cs, pal: OBJ_PAL.player });
  playerSig = wornGear(ownedGearIds).join('|');
}

export function ensurePlayerFrames(ownedGearIds: string[]): void {
  if (wornGear(ownedGearIds).join('|') === playerSig) return;
  buildPlayerFrames(ownedGearIds);
}
