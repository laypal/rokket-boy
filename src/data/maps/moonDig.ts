// MT. MÖÖN — excavation site (CH2.2). Up-stairs '>' at (2,2) return to
// moon2 (18,9). The `$` chest at (8,4) is the CH2.3 fossil set piece — left
// clear with open floor around it as its focal spot; `R` boulders frame the
// pit without crowding it. `~` rubble is the CH2.1 wild-encounter tile.
import type { MapDef } from '../../types';
import { moonDigScripts } from '../dialog/moonDig';
import { makeMap } from './make';

export const moonDigMap: MapDef = makeMap({
  id: 'moonDig',
  name: 'DIG SITE',
  pal: 'moon',
  music: 'cave2', // AUD.3: the dig site earns its own drone variant
  rows: [
    '##################',
    '#~   R   ~~   R  #',
    '# > ~~ R   ~~  R #',
    '#~   ~~   R  ~ R #',
    '#~      $  ~R ~~R#',
    '# ~~ R     ~ R ~~#',
    '#~R   ~   R ~~  R#',
    '#~R~  R  ~~ ~~ R~#',
    '#  ~~  R ~  RR ~ #',
    '##################',
  ],
  // BRAD (8,5) guards the chest's south face; goneIf(bradBeaten) — his
  // onWin text says he storms off, and the tile genuinely frees up (CH2.4).
  npcs: [{ id: 'brad', char: 'brad', x: 8, y: 5, dir: 'down', goneIf: { flag: 'bradBeaten' } }],
  signs: {},
  items: {},
  warps: {
    '2,2': ['moon2', 18, 9, 'left'],
  },
  scripts: moonDigScripts,
  // CH2.3 frozen table (task card 20-ch2-mt-moon.md) — do not retune here.
  encounters: {
    rate: 0.15,
    entries: [
      { species: 'geodood', weight: 3, lv: [4, 6] },
      { species: 'zubatt', weight: 1, lv: [4, 6] },
      { species: 'ratikatt', weight: 1, lv: [5, 6] },
    ],
  },
});
