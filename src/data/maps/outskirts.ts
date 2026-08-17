// CERULEUN EDGE — the town outskirts east of MT. MOON (CH3.2). Door 'o' at
// (0,6) leads back into moon1 (18,4); the north exit 'o' at (10,0) is the
// approach to the NUGGET SPAN. A shill grunt hypes the "prize bridge" con
// from the open floor; the sign says the same, louder. `w`/`B` scenery
// (river glimpse + fence posts) previews the bridge before you reach it.
// Palette 'span' + the 'bridge' track (CH3.2) carry over from the span itself.
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
    '#         P         #',
    '#  w             w  #',
    '#  B             B  #',
    'o                   #',
    '#                   #',
    '#####################',
  ],
  npcs: [
    { id: 'shill', char: 'grunt', x: 14, y: 6, dir: 'down' },
  ],
  signs: {
    '6,2': [['PRIZE BRIDGE ->', 'WIN A NUGGET!', 'ENTRY: YOUR EGO.']],
  },
  items: {},
  warps: {
    '0,6': ['moon1', 18, 4, 'left'],
    '10,0': ['bridge', 6, 18, 'up'],
  },
  scripts: outskirtsScripts,
});
