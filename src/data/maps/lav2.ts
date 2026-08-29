// LAVENDAR 2F (CH5.2) — the mist room, and the true gate of the chapter:
// a ghost stands ON the stairs up until the player is holding the SILF
// SCOPE (goneIf: hasItem), so the SCOPE pickup at (9,5) is mandatory, not
// optional loot. Fog is live here too.
import type { MapDef } from '../../types';
import { lav2Scripts } from '../dialog/lav2';
import { makeMap } from './make';

export const lav2Map: MapDef = makeMap({
  id: 'lav2',
  name: 'LAVENDAR 2F',
  pal: 'lavendar',
  music: 'dirge',
  fog: true,
  rows: [
    '####################',
    '#>  t     t      t #',
    '#   ##########     #',
    '#   #~~~~~~~~#  t  #',
    '# t #~~~~~~~~#     #',
    '#   #~~~~b~~~#  t  #',
    '#   #~~~~~~~~#     #',
    '#   #~~~~~~~~#  t  #',
    '#   ####  ####     #',
    '#                  #',
    '#  t        t     >#',
    '####################',
  ],
  npcs: [
    // the gate: gone once the SCOPE is in the PACK (CH5.0 §6)
    { id: 'stair_ghost', char: 'jessika', pal: 'ghost', x: 18, y: 10, dir: 'up', goneIf: { hasItem: 'SILF SCOPE' } },
    // the SCOPE hint — "dropped it in the mist room"
    { id: 'mourner_c', char: 'brad', pal: 'ghost', x: 15, y: 4, dir: 'left' },
    // one-time MEDIUM fight, a possessed grieving stand-in
    { id: 'medium_a', char: 'kira', pal: 'ghost', x: 16, y: 7, dir: 'up' },
  ],
  signs: {},
  items: { '9,5': { id: 'lav_scope', item: 'SILF SCOPE' } },
  warps: {
    '1,1': ['lav1', 18, 8, 'down'],
    '18,10': ['lav3', 18, 9, 'up'],
  },
  scripts: lav2Scripts,
  encounters: {
    rate: 0.15,
    entries: [{ species: 'gastlee', weight: 1, lv: [16, 18] }],
  },
});
