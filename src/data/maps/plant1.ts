// KANTOO POWER PLANT 1F (CH7.0 §9) — INTAKE HALL. Door 'o' (9,11) back to
// the ANN DOCK's new south door; MYOWTH stands beside it until he has taught
// the plant rules (goneIf ch7Rules, the DJames pad gate); the forced 3-tile
// LIVE FLOOR strip at column 9 rows 4–6 is the only way north — it teaches
// the damage (3 hp) before the RUBBER BOOTS 'b' (3,3) behind it; a `~` vent
// patch rolls MAGNEMYT; stairs '>' (17,1) → 2F. Heat floored at 1 (§1).
// Grid frozen in .paul/PLAN.md (2026-09-09).
import type { MapDef } from '../../types';
import { plant1Scripts } from '../dialog/plant1';
import { makeMap } from './make';

export const plant1Map: MapDef = makeMap({
  id: 'plant1',
  name: 'POWER PLANT 1F',
  pal: 'plant',
  music: 'plant',
  minStage: 1,
  rows: [
    '####################',
    '#X   ~~~     s   > #',
    '#    ~~~           #',
    '#  b ~~~           #',
    '#########z##########',
    '#########z##########',
    '#########z##########',
    '#                  #',
    '#         X   X    #',
    '#  X               #',
    '#          s       #',
    '#########o##########',
  ],
  npcs: [
    // the rules gate — beside the door until he has talked (§7)
    { id: 'myowth', char: 'myowth', x: 8, y: 10, dir: 'right', goneIf: { flag: 'ch7Rules' } },
    { id: 'tech1', char: 'guard', pal: 'plant', x: 15, y: 3, dir: 'left' },
    { id: 'watch1', char: 'guard', pal: 'plant', x: 3, y: 8, dir: 'right', heatGuard: { encounterId: 'plant_watch' } },
  ],
  signs: {
    '11,10': [
      ['KANTOO POWER', 'PLANT. STAFF', 'ONLY. NO SHOES.'],
      ['LIVE FLOOR: 1 HP', 'A STEP. BOOTS IN', 'THE INTAKE HALL.'],
      ['THE ALARM NEVER', 'SLEEPS HERE.', 'HIDE ANYWAY.'],
    ],
    '13,1': [['INTAKE -> CELL', 'STORE 2F ->', 'GENERATOR 3F.']],
  },
  items: {
    '3,3': { id: 'plant_boots', item: 'RUBBER BOOTS' },
  },
  warps: {
    '17,1': ['plant2', 1, 10, 'down'],
    '9,11': ['dock', 9, 8, 'up'],
  },
  // CH7.0 §4: the vent rolls MAGNEMYT over VOLTORBB.
  encounters: { rate: 0.15, entries: [{ species: 'magnemyt', weight: 3, lv: [24, 27] }, { species: 'voltorbb', weight: 1, lv: [24, 26] }] },
  scripts: plant1Scripts,
});
