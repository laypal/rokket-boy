// GB-style palettes: BG 4 shades dark->light + an alert slot; OBJ index 0
// outline, '.' transparent.
// ── Background palettes (dark → light, exactly 4 shades, GB style) ──────
import type { TypeId } from './typeChart';

export type Palette = string[];

// FLW.2: index 4 of every BG palette is ALERT — one shared red, outside each
// map's ramp on purpose. Menus draw from whichever map palette is live
// (`BG_PAL[G.map.pal]`), so a hurt-HP signal built from the ramp itself would
// be teal in HQ, magenta in the casino and gold in the vault — and on a
// `pal[3]` window fill the pal[0]/pal[1] gap reads on inspection rather than
// at a glance. Same reasoning as RNK.5c's player gold below: when no existing
// shade can carry the meaning, the palette gains a slot rather than the
// meaning being faked. Every window interior is pal[3] (the lightest shade of
// its ramp, `renderer.ts:115`), so this red reads on all eight.
export const ALERT = '#c81e3c';
/** Index of the ALERT slot in every BG palette. Draw code indexes the slot
 *  by name so the contract is greppable, not a bare `pal[4]`. */
export const ALERT_IDX = 4;

export const BG_PAL: Record<string, Palette> = {
  gray:   ['#0a0a0f', '#4a4a58', '#9a9aac', '#e8e8f0', ALERT],   // boot
  green:  ['#0f380f', '#306230', '#8bac0f', '#9bbc0f', ALERT],   // DMG classic — title/battle
  hq:     ['#0a1420', '#1d4552', '#4e9aa8', '#cdeef0', ALERT],   // Rökket HQ — cold teal
  casino: ['#1c0a22', '#5c2166', '#b8459c', '#f6cdec', ALERT],   // Gamez Corner — magenta
  vault:  ['#100a04', '#4e3a12', '#a8842e', '#f0e2b0', ALERT],   // vault — gold
  night:  ['#080810', '#22224a', '#5555a0', '#b8b8e8', ALERT],   // intro sky
  moon:   ['#050810', '#16294e', '#3e6496', '#a8c4e0', ALERT],   // Mt. Möön caves — dark blue
  span:   ['#081418', '#1a5a58', '#3aa89c', '#d0f0e8', ALERT],   // NUGGET SPAN — daylight river teal (CH3.2)
  tower:  ['#080810', '#22304a', '#46608a', '#e8d24a', ALERT],   // ONB.8 — Rokket Corp at night; shade 3 is a lit window
  ship:   ['#06101c', '#1c3a5c', '#4a86b0', '#d8ecf8', ALERT],   // CH4.2 — S.S. ANN, night sea
  lavendar: ['#0c0814', '#3a2458', '#7a58a8', '#e0d0f0', ALERT], // CH5.0 §11 — LAVENDAR TOWER, purple; shade 0 is the fog
  sylph: ['#0a1418', '#1e4a58', '#4a9aa8', '#d8f0f0', ALERT],    // CH6.0 §12 — SYLPHCO TOWER, a cold corporate teal
};

// ── Sprite (OBJ) palettes — GBC style, index 0 is outline, '.'=transparent
export const OBJ_PAL: Record<string, Palette> = {
  grunt:   ['#0c0c14', '#c81e3c', '#e8b088', '#e8e8f0'],
  // RNK.5c: the PLAYER's palette = grunt + a fifth "Rokket gold" slot (idx
  // 4) reserved for worn gear. The 2026-08-15 contact sheet showed gear
  // drawn in the uniform's own black/red vanishing into it; gold is the
  // one hue the base sprite never uses, so gear reads as gear. Only
  // CHAR_FRAMES.player decodes with this; NPC grunts stay four-shade.
  player:  ['#0c0c14', '#c81e3c', '#e8b088', '#e8e8f0', '#e0b840'],
  jessika: ['#0c0c14', '#e0447f', '#e8b088', '#f0f0f8'],
  djames:  ['#0c0c14', '#5868d8', '#e8b088', '#f0f0f8'],
  giovanni:['#0c0c14', '#d87020', '#e8b088', '#c8c8d0'],
  guard:   ['#0c0c14', '#3858a0', '#e8b088', '#c8c8d0'],
  brad:    ['#0c0c14', '#2e9e4a', '#e8b088', '#e8f0e8'],
  myowth:  ['#241408', '#d8a828', '#f0e0b0', '#ffffff'],
  koffink: ['#181024', '#6a4898', '#a888cc', '#e8e0f4'],
  voltorbb:['#141414', '#c82838', '#909098', '#f0f0f0'],
  gold:    ['#241408', '#a8741c', '#e0b840', '#f8ecc0'],
  fire:    ['#140804', '#c83010', '#f08828', '#f8e0a0'],
  ghost:   ['#0c0c14', '#585880', '#9890c0', '#e0e0f0'],
  heal:    ['#0c1408', '#2a7a2a', '#68c840', '#d8f8b0'], // BFX.3 — heal-item green ramp
  ratikatt:['#1c1408', '#8a5a28', '#c89858', '#f0dcb0'], // SPR.A — RATIKATT/RATIKATE line, dusty brown
  zubatt:  ['#140c1c', '#5c3878', '#8868a8', '#ded0f0'], // SPR.A — ZUBATT/GOLBATT line, cave purple
  geodood: ['#1c1408', '#6e5438', '#a8886a', '#e0c8a8'], // SPR.B — GEODOOD/GRAVLR line, rocky grey-brown
  ekanzz:  ['#140a1c', '#3a6e2c', '#6e3a8e', '#c8e0a8'], // SPR.B — EKANZZ/ARBÖK line, venom green-violet
  kira:    ['#0c0c14', '#8a3fa0', '#e8b088', '#f0f0f8'], // CH3.2 — AGENT KIRA, violet/plum accent
  medic:   ['#0c0c14', '#c81e3c', '#e8b088', '#f8f8f8'], // ONB.7 — bunk healer, grunt dark/red/skin + a lifted shade-3 so the cap reads clinic-white
  // CH4.1 — the SAILOR disguise: the player palette with the Rokket red
  // swapped for navy. Five shades on purpose: it decodes CHAR_FRAMES.player
  // (gear gold in slot 4) as well as the ship's sailor NPCs.
  sailor:  ['#0c0c14', '#2850c8', '#e8b088', '#f0f0f8', '#e0b840'],
  // CH4.2 — S.S. ANN crew: the captain (navy + cream trim) and the
  // security chief (black suit, cool grey accents).
  captain: ['#0c0c14', '#1c2c60', '#e8b088', '#f0e0a0'],
  chief:   ['#0c0c14', '#303040', '#e8b088', '#c8c8d0'],
  // SPR.C / CH5 — GASTLEE/HAUNTOR line, violet-black ghost ramp.
  gastlee: ['#0c0814', '#3a2060', '#8a68b8', '#e8e0f8'],
  // SPR.C / CH5 — MAROWL (bossOnly), bone-white on brown.
  marowl:  ['#1c1408', '#7a5a30', '#c8a870', '#f4ecd8'],
  // SPR.D / CH6 — DROWZEY/HYPNÖZ line, tapir yellow-brown; MACHOPP/MACHÖKE
  // line, blue-grey.
  drowzey: ['#1c1408', '#a07828', '#e0c060', '#f8f0d0'],
  machopp: ['#0c1018', '#3858a0', '#8098c8', '#e0e8f8'],
};

// ── Battle-FX type tints (13-battle-fx.md) ───────────────────────────────
// Every move type maps to an OBJ palette; FX sprites are recoloured with it.
// Reuses character palettes where the hue fits; `fire`/`ghost` are FX-only.
const TYPE_PAL: Record<TypeId, string> = {
  NORMAL: 'guard',
  POISON: 'koffink',
  ELECTRIC: 'gold',
  GHOST: 'ghost',
  FIGHTING: 'grunt',
  GROUND: 'giovanni',
  PSYCHIC: 'jessika',
  FIRE: 'fire',
  WATER: 'djames',
};

export function typePal(t: TypeId): Palette {
  return OBJ_PAL[TYPE_PAL[t]];
}
