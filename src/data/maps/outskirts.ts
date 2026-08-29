// CERULEUN EDGE — the town outskirts east of MT. MOON (CH3.2). Door 'o' at
// (0,6) leads back into moon1 (18,4); the north exit 'o' at (10,0) is the
// approach to the NUGGET SPAN. A shill grunt hypes the "prize bridge" con
// from the open floor; the sign says the same, louder. `w`/`B` scenery
// (river glimpse + fence posts) previews the bridge before you reach it.
// Palette 'span' + the 'bridge' track (CH3.2) carry over from the span itself.
// CH4.2: a second east door at (20,6) opens onto the ANN DOCK. CH5.2: a
// south door 'o' at (10,8) opens onto LAVENDAR TOWER (row 8, was all wall).
import type { MapDef } from '../../types';
import { outskirtsScripts } from '../dialog/outskirts';
import { makeMap } from './make';

export const outskirtsMap: MapDef = makeMap({
  id: 'outskirts',
  name: 'CERULEUN EDGE',
  pal: 'span',
  music: 'bridge',
  rows: [
    '##########o##########',
    '#                   #',
    '#     s             #',
    '#    b    P     b   #',
    '#  w             w  #',
    '#  B             B  #',
    'o                   o',
    '#                   #',
    '##########o##########',
  ],
  npcs: [
    { id: 'shill', char: 'grunt', x: 14, y: 6, dir: 'down' },
  ],
  signs: {
    '6,2': [['PRIZE BRIDGE ->', 'WIN A NUGGET!', 'ENTRY: YOUR EGO.']],
  },
  // SIDE.6: two pickups here (the leaf's escape hatch — bridge's 2-wide lane
  // has no room for a blocking `b` without a grid change beyond a single
  // egg alcove, so bridge_ball becomes outskirts_ball instead; journaled in
  // the SIDE.3/6 report). Both cells are plain floor, clear of the room's
  // only walked cells (chapter3.spec.ts only ever touches (10,0)/(10,1)),
  // the shill NPC (14,6) and the sign (6,2).
  items: {
    '5,3': { id: 'outskirts_soda', item: 'SODA' },
    '16,3': { id: 'outskirts_ball', item: 'ROKKET BALL' },
  },
  warps: {
    '0,6': ['moon1', 18, 4, 'left'],
    '10,0': ['bridge', 6, 18, 'up'],
    '20,6': ['dock', 1, 6, 'right'],
    '10,8': ['lav1', 9, 10, 'up'],
  },
  scripts: outskirtsScripts,
});
