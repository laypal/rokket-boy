// GB-style palettes: BG 4 shades dark->light; OBJ index 0 outline, '.' transparent.
// ── Background palettes (dark → light, exactly 4 shades, GB style) ──────
import type { TypeId } from './typeChart';

export type Palette = string[];

export const BG_PAL: Record<string, Palette> = {
  gray:   ['#0a0a0f', '#4a4a58', '#9a9aac', '#e8e8f0'],   // boot
  green:  ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'],   // DMG classic — title/battle
  hq:     ['#0a1420', '#1d4552', '#4e9aa8', '#cdeef0'],   // Rökket HQ — cold teal
  casino: ['#1c0a22', '#5c2166', '#b8459c', '#f6cdec'],   // Gamez Corner — magenta
  vault:  ['#100a04', '#4e3a12', '#a8842e', '#f0e2b0'],   // vault — gold
  night:  ['#080810', '#22224a', '#5555a0', '#b8b8e8'],   // intro sky
  moon:   ['#050810', '#16294e', '#3e6496', '#a8c4e0'],   // Mt. Möön caves — dark blue
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
