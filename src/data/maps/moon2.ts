// MT. MÖÖN — lower tunnels (CH2.2). Tighter and more rubble-choked than
// MT. MOON above. Up-stairs '>' at (3,2) return to moon1 (17,9); down-stairs
// '>' at (17,9) continue to the DIG SITE (moonDig (3,2)). `~` rubble is the
// CH2.1 wild-encounter tile; `T` stalagmites are blocking, not walkable.
import type { MapDef } from '../../types';
import { moon2Scripts } from '../dialog/moon2';
import { makeMap } from './make';

export const moon2Map: MapDef = makeMap({
  id: 'moon2',
  name: 'MOON DEPTHS',
  pal: 'moon',
  music: 'cave',
  rows: [
    '####################',
    '#~                 #',
    '#~ > ~~R#R    b ~  #',
    '# ~  ~ ~# R~  ~ #  #',
    '#~R  ~  #~~~ R  #  #',
    '#  ~   R ~~~## TR  #',
    '#~~   R  ~   ~~ R  #',
    '#~~~    R ~ ~ ~~R  #',
    '# ~ T ## RR  ~ R~  #',
    '# ~~   R   ~ R   > #',
    '#   RR   ~  ~  R  ~#',
    '####################',
  ],
  // Jessika (12,2) sits in the open eastern floor, clear of both stair warps
  // (3,2 and 17,9) so her EKANZZ gift scene never blocks the through route.
  npcs: [{ id: 'jessika', char: 'jessika', x: 12, y: 2, dir: 'down' }],
  signs: {},
  // SIDE.6: a ROKKET BALL on the plain-floor cell (14,2) — clear of
  // chapter2.spec.ts's walked set (row y=1 x2-18, columns x=17/18 y1-9, and
  // the two stair cells) and off Jessika's tile (12,2).
  items: { '14,2': { id: 'moon2_ball', item: 'ROKKET BALL' } },
  warps: {
    '3,2': ['moon1', 17, 9, 'left'],
    '17,9': ['moonDig', 3, 2, 'down'],
  },
  scripts: moon2Scripts,
  // CH2.3 frozen table (task card 20-ch2-mt-moon.md) — do not retune here.
  encounters: {
    rate: 0.15,
    entries: [
      { species: 'zubatt', weight: 3, lv: [4, 6] },
      { species: 'geodood', weight: 2, lv: [4, 6] },
    ],
  },
});
