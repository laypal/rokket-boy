// SAFARI ZOON — THE PARK (CH8.0 §7): the stealth map. Three posted RANGERs
// whose sweeps cover the winding rail-fenced path, tall grass '~' with the
// wild table (SANDSHRÜ's home turf, MACHOPP's first catch route), a SODA and a ROKKET BALL off the path. `watch` + the
// shared 'park' heat zone with the PENS, so either point of no return's
// `{ heat: 2 }` follows the player back through here — the escape is hunted.
// No `minStage`: stay out of every cone and heat stays 0 (CH8.1 BDD).
// The doors, the zone and the guard count are the contract
// (tests/ch8-contracts.test.ts). Posts tuned 2026-10-08: every route from
// the gate to the pens now crosses 6 cone tiles across all three rangers
// (was 1 — the east field let you skip ranger4, and ranger2 sat in the
// north-west dead end). No cone overlaps, no landing tile watched; all
// guards sweep on one shared phase, so the x18/x19 corridor is always open
// on one side.
import type { MapDef } from '../../types';
import { safari2Scripts } from '../dialog/safari2';
import { makeMap } from './make';

export const safari2Map: MapDef = makeMap({
  id: 'safari2',
  name: 'SAFARI PARK',
  pal: 'safari',
  music: 'safari',
  watch: true,
  heatZone: 'park',
  rows: [
    '#############o##############',
    '#~~~~       #  ~~~~~~~~~~~ #',
    '#~~~~  BBBBB#BBBBB   ~~~~~ #',
    '#~~~~      #     B   ~~~~~ #',
    '#      s   #     B         #',
    '#BBBBBBBB  #     BBBBBBBB  #',
    '#        B #        ~~~~   #',
    '#  ~~~~  B          ~~~~   #',
    '#  ~~~~  BBBBBBBBB  ~~~~   #',
    '#  ~~~~          B    b    #',
    '#                B  BBBBBBB#',
    '#BBBBBBBBBBBB    B         #',
    '#            B   B   ~~~~~ #',
    '#  ~~~~~~    B       ~~~~~ #',
    '#  ~~~~~~    B  BBBBBB~~~~ #',
    '#  ~~~~~~    B     s       #',
    '#     b      B             #',
    '#      BBBBBBB             #',
    '#                          #',
    '#############o##############',
  ],
  npcs: [
    // CH8-FB.1: one encounter + payday flag per ranger; beaten = goneIf that flag
    { id: 'ranger2', char: 'guard', pal: 'safari', x: 19, y: 8, dir: 'down', goneIf: { flag: 'safariRanger2' }, heatGuard: { encounterId: 'safari_ranger2' } },
    { id: 'ranger3', char: 'guard', pal: 'safari', x: 23, y: 4, dir: 'left', goneIf: { flag: 'safariRanger3' }, heatGuard: { encounterId: 'safari_ranger3' } },
    { id: 'ranger4', char: 'guard', pal: 'safari', x: 18, y: 12, dir: 'up', goneIf: { flag: 'safariRanger4' }, heatGuard: { encounterId: 'safari_ranger4' } },
  ],
  signs: {
    '7,4': [['KEEP TO THE', 'PATH. THE GRASS', 'BITES.']],
    '19,15': [['PENS: NORTH.', 'STAFF ONLY', 'BEYOND THE GATE.']],
  },
  items: {
    '22,9': { id: 'safari_soda', item: 'SODA' },
    '6,16': { id: 'safari_ball', item: 'ROKKET BALL' },
  },
  warps: {
    '13,0': ['safari3', 9, 10, 'up'],
    '13,19': ['safari1', 9, 1, 'down'],
  },
  encounters: {
    rate: 0.15,
    entries: [
      { species: 'sandshru', weight: 3, lv: [24, 28] },
      { species: 'machopp', weight: 2, lv: [24, 28] },
      { species: 'geodood', weight: 1, lv: [24, 27] },
    ],
  },
  scripts: safari2Scripts,
});
