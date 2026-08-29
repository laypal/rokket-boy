// CAPTAIN'S CABIN (CH4.2/4.3) — the safe (`V`) sits at (14,4), guarded by
// one heatGuard posted at the cabin door his cone covers. `at:14,4` (CH4.3)
// runs the crack-the-safe script that starts the ship's lockdown.
import type { MapDef } from '../../types';
import { cabinScripts } from '../dialog/cabin';
import { makeMap } from './make';

export const cabinMap: MapDef = makeMap({
  id: 'cabin',
  name: "CAPTAIN'S CABIN",
  pal: 'ship',
  music: 'ship',
  disguise: 'sailor',
  heatZone: 'ship',
  lockdown: 300,
  watch: true,
  rows: [
    '################',
    '#      #  D  C #',
    '#      #  ,,,  #',
    'o      #  ,,,  #',
    '#      #  ,,, V#',
    '#  X   o       #',
    '#  X           #',
    '################',
  ],
  npcs: [
    { id: 'cabin_watch', char: 'sailor', x: 5, y: 5, dir: 'right', heatGuard: { encounterId: 'ship_watch' } },
  ],
  signs: {},
  items: {},
  warps: {
    '0,3': ['deck1', 21, 5, 'left'],
  },
  scripts: cabinScripts,
});
