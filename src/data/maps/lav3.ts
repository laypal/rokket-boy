// LAVENDAR 3F (CH5.2/5.3) — the top floor: the mist chamber gauntlet
// (rows 3-6, gastlee/hauntor territory) guards the altar at (2,1), the
// chapter's set piece. The spirit ambush sits on both approach tiles
// (`step:6,1`/`step:6,2`, belt and braces) so it can't be walked around.
// Myowth tags along once the mask is taken (goneIf gates on ch5Mask/
// ch5Myowth) — see dialog/lav3.ts for the conscience scene.
import type { MapDef } from '../../types';
import { lav3Scripts } from '../dialog/lav3';
import { makeMap } from './make';

export const lav3Map: MapDef = makeMap({
  id: 'lav3',
  name: 'LAVENDAR 3F',
  pal: 'lavendar',
  music: 'dirge',
  fog: true,
  rows: [
    '####################',
    '#K$K               #',
    '#                  #',
    '#tttttttttttt      #',
    '#~~~~~~~~~~~~      #',
    '#~~~~~~~~~~~~t     #',
    '#tttttttttttt      #',
    '#                  #',
    '#  t     t   t     #',
    '#              b   #',
    '#  t     t   t    >#',
    '####################',
  ],
  npcs: [
    // the CHARM hint — "she wants it back, don't take the mask"
    { id: 'mourner_d', char: 'guard', pal: 'ghost', x: 16, y: 8, dir: 'down' },
    // one-time MEDIUM fight, same shape as 2F's
    { id: 'medium_b', char: 'kira', pal: 'ghost', x: 14, y: 5, dir: 'left' },
    // stays an HQ NPC even once he's in the party (CH5.0 assumption 5)
    { id: 'myowth', char: 'myowth', x: 12, y: 1, dir: 'left', goneIf: { any: [{ notFlag: 'ch5Mask' }, { flag: 'ch5Myowth' }] } },
  ],
  signs: {},
  items: { '15,9': { id: 'lav_charm', item: 'BONE CHARM' } },
  warps: {
    '18,10': ['lav2', 18, 9, 'up'],
  },
  scripts: lav3Scripts,
  encounters: {
    rate: 0.2,
    entries: [
      { species: 'gastlee', weight: 3, lv: [17, 19] },
      { species: 'hauntor', weight: 1, lv: [19, 21] },
    ],
  },
});
