// KANTOO POWER PLANT 2F (CH7.0 §3/§9) — CELL STORE. Twelve 'e' cells in a
// LIVE FLOOR ring; four are `step:` mines (dialog/plant.ts mine(n) —
// (9,4) (12,5) (15,4) (11,6)) that start a wild VOLTORBB and re-arm on a
// flee or whiteout. Without boots the ring costs 1 hp in and 1 out. Stairs
// '>' (1,10) ↔ 1F, '>' (22,10) → 3F. Grid frozen in .paul/PLAN.md.
import type { MapDef } from '../../types';
import { plant2Scripts } from '../dialog/plant2';
import { makeMap } from './make';

export const plant2Map: MapDef = makeMap({
  id: 'plant2',
  name: 'POWER PLANT 2F',
  pal: 'plant',
  music: 'plant',
  minStage: 1,
  rows: [
    '########################',
    '#      X               #',
    '#            zzzzzzz   #',
    '#      zzzzzzz     z   #',
    '#      z e e e e e z   #',
    '#      z  e e e e  z   #',
    '#      z e e     e z   #',
    '#      zzzzzzzzzzzzz   #',
    '#                      #',
    '# s                    #',
    '#>                    >#',
    '########################',
  ],
  npcs: [
    { id: 'watch2', char: 'guard', pal: 'plant', x: 4, y: 2, dir: 'right', heatGuard: { encounterId: 'plant_watch' } },
    { id: 'tech2', char: 'guard', pal: 'plant', x: 18, y: 8, dir: 'left' },
  ],
  signs: {
    '2,9': [['CELL STORE.', 'DO NOT KICK THE', 'CELLS.']],
  },
  items: {},
  warps: {
    '1,10': ['plant1', 17, 1, 'down'],
    '22,10': ['plant3', 1, 9, 'down'],
  },
  scripts: plant2Scripts,
});
