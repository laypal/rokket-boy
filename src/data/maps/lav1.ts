// LAVENDAR 1F (CH5.2) — the tower's ground floor, a mourners' hall. Door
// 'o' at (9,11) leads back to CERULEUN EDGE (south wall); stairs '>' at
// (18,7) climb to lav2. Fog is live here (MapDef.fog) — the whole chapter
// is walked half-blind until the SILF SCOPE turns up on 2F.
import type { MapDef } from '../../types';
import { lav1Scripts } from '../dialog/lav1';
import { makeMap } from './make';

export const lav1Map: MapDef = makeMap({
  id: 'lav1',
  name: 'LAVENDAR 1F',
  pal: 'lavendar',
  music: 'dirge',
  fog: true,
  rows: [
    '####################',
    '#  t   t    t   t  #',
    '#                  #',
    '#  t  ~~~~~~~   t  #',
    '#     ~~~~~~~      #',
    '#  t  ~~~~~~~   t  #',
    '#                  #',
    '#  t   t    t   t >#',
    '#                  #',
    '#  P     s      P  #',
    '#                  #',
    '#########o##########',
  ],
  npcs: [
    // the grieving kid's mon that went up the tower and didn't come down
    { id: 'mourner_a', char: 'guard', pal: 'ghost', x: 4, y: 8, dir: 'down' },
    // "the tower keeps what the tower keeps" — points the way to the stairs
    { id: 'mourner_b', char: 'jessika', pal: 'ghost', x: 14, y: 2, dir: 'down' },
  ],
  signs: {
    '9,9': [['LAVENDAR TOWER', 'REST IN PIECES.', 'NO STEALING.']],
  },
  items: {},
  warps: {
    '9,11': ['outskirts', 10, 7, 'down'],
    '18,7': ['lav2', 1, 2, 'down'],
  },
  scripts: lav1Scripts,
  encounters: {
    rate: 0.12,
    entries: [{ species: 'gastlee', weight: 1, lv: [15, 17] }],
  },
});
