// KANTOO POWER PLANT 3F (CH7.0 §5/§9) — GENERATOR HALL. Vents '~' roll
// MAGNEMYT; a full-width LIVE FLOOR band on row 5 between the hall and the
// chest (Lyall, 2026-09-09: live floor on every floor, so the boots keep
// paying off); the ENERGY CELL chest '$' (18,2) at the far end; the ONE
// corridor tile (7,8) between the hall and the stairs pocket is the
// VOLTRAWK dive (`step:7,8`, after the CELL, until an outcome flag). A
// fresh arrival from 2F lands at (1,9) — it never crosses (7,8) before the
// CELL, so the dive only fires on the way OUT. Grid frozen in .paul/PLAN.md.
import type { MapDef } from '../../types';
import { plant3Scripts } from '../dialog/plant3';
import { makeMap } from './make';

export const plant3Map: MapDef = makeMap({
  id: 'plant3',
  name: 'POWER PLANT 3F',
  pal: 'plant',
  music: 'plant',
  minStage: 1,
  rows: [
    '####################',
    '#                 X#',
    '#  ~~~            $#',
    '#  ~~~   X   X     #',
    '#  ~~~             #',
    '#zzzzzzzzzzzzzzzzzz#',
    '#    X       X     #',
    '#                  #',
    '####### ############',
    '#>                 #',
    '#                  #',
    '####################',
  ],
  npcs: [
    { id: 'tech3', char: 'guard', pal: 'plant', x: 6, y: 2, dir: 'down' },
    { id: 'watch3', char: 'guard', pal: 'plant', x: 14, y: 7, dir: 'left', heatGuard: { encounterId: 'plant_watch' } },
  ],
  signs: {},
  items: {},
  warps: {
    '1,9': ['plant2', 22, 10, 'down'],
  },
  // CH7.0 §4: the same table as 1F, levels bumped for the floor.
  encounters: { rate: 0.15, entries: [{ species: 'magnemyt', weight: 3, lv: [27, 30] }, { species: 'voltorbb', weight: 1, lv: [27, 30] }] },
  scripts: plant3Scripts,
});
