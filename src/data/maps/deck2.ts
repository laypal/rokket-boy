// BELOW DECK (CH4.2) — crew quarters and the hold. Bilge `~` tiles (right
// side) carry a wild table; one posted heatGuard covers the lockers.
import type { MapDef } from '../../types';
import { deck2Scripts } from '../dialog/deck2';
import { makeMap } from './make';

export const deck2Map: MapDef = makeMap({
  id: 'deck2',
  name: 'BELOW DECK',
  pal: 'ship',
  music: 'ship',
  disguise: 'sailor',
  heatZone: 'ship',
  lockdown: 300,
  watch: true,
  rows: [
    '####################',
    '#>      X   ~~~~~~ #',
    '#   X   X   ~~~~~~ #',
    '#       X   ~~~~~~ #',
    '#  L L L    ~~~~~~ #',
    '#           ~~~~~~ #',
    '#  X      X        #',
    '#      b  X   X    #',
    '#                  #',
    '####################',
  ],
  npcs: [
    { id: 'hold_watch', char: 'sailor', x: 9, y: 4, dir: 'down', heatGuard: { encounterId: 'ship_hold' } },
  ],
  signs: {},
  items: {
    '7,7': { id: 'deck2_soda', item: 'SODA' },
  },
  warps: {
    '1,1': ['deck1', 21, 8, 'left'],
  },
  scripts: deck2Scripts,
  encounters: {
    rate: 0.15,
    entries: [
      { species: 'ratikatt', weight: 3, lv: [10, 13] },
      { species: 'zubatt', weight: 2, lv: [10, 13] },
    ],
  },
});
