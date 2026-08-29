// S.S. ANN DECK (CH4.2) — the gala floor. Two posted watch guards flank the
// carpet's pillars (heatGuard, always scanning — watch:true, CH4.0 §1b);
// three gala guests are flavour-only, reusing existing charsets with a pal
// override so no new sprite was needed for a crowd. Stairs down to the hold
// (deck2), an aft door to the captain's cabin.
import type { MapDef } from '../../types';
import { deck1Scripts } from '../dialog/deck1';
import { makeMap } from './make';

export const deck1Map: MapDef = makeMap({
  id: 'deck1',
  name: 'S.S. ANN DECK',
  pal: 'ship',
  music: 'ship',
  disguise: 'sailor',
  heatZone: 'ship',
  lockdown: 300,
  watch: true,
  rows: [
    '########################',
    '#wwwwwwwwwwwwwwwwwwwwww#',
    '#BBBBBBBBBBBBBBBBBBBBBB#',
    '#      I      I        #',
    '#  ,,,,,,,,,,,,,,,,    #',
    '#  ,,,,,,,,,,,,,,,,   o#',
    '#  ,,,,,,,,,,,,,,,,    #',
    '#      I      I        #',
    '#                     >#',
    '#                      #',
    '# >BBBBBBBBBBBBBBBBBBBB#',
    '########################',
  ],
  npcs: [
    { id: 'watch_a', char: 'sailor', x: 7, y: 3, dir: 'down', heatGuard: { encounterId: 'ship_watch' } },
    { id: 'watch_b', char: 'sailor', x: 14, y: 3, dir: 'down', heatGuard: { encounterId: 'ship_watch' } },
    { id: 'captain', char: 'captain', x: 10, y: 5, dir: 'down' },
    { id: 'guest_a', char: 'giovanni', pal: 'kira', x: 5, y: 5, dir: 'down' },
    { id: 'guest_b', char: 'guard', pal: 'brad', x: 16, y: 6, dir: 'down' },
    { id: 'guest_c', char: 'jessika', pal: 'djames', x: 12, y: 4, dir: 'down' },
  ],
  signs: {},
  items: {},
  warps: {
    '2,10': ['dock', 17, 3, 'down'],
    '22,5': ['cabin', 1, 3, 'right'],
    '22,8': ['deck2', 2, 1, 'right'],
  },
  scripts: deck1Scripts,
});
