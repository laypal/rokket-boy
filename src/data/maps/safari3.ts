// SAFARI ZOON — THE PENS (CH8.0 §2/§7): the point of no return, twice.
// Three rail pens along the top wall, each with a locked 'd' gate and a
// resident idling behind it (CH8-FB.3); the PRIZE CRATE 'X' (4,5) is the
// LOYAL act, the PEN LEVER 'C' (15,7) the BETRAYAL act, 4+ tiles apart and
// each hidden once the other has been chosen (dialog/safari3.ts). Either
// YES sets the shared 'park' zone to heat 2. One RANGER posted at the
// middle pen (tuned 2026-10-08): ~equal reach to the crate (5) and the
// lever (6), so neither branch's escape is harder than the other's.
import type { MapDef } from '../../types';
import { safari3Scripts } from '../dialog/safari3';
import { makeMap } from './make';

export const safari3Map: MapDef = makeMap({
  id: 'safari3',
  name: 'THE PENS',
  pal: 'safari',
  music: 'safari',
  watch: true,
  heatZone: 'park',
  rows: [
    '####################',
    '#BBBB  BBBB  BBBB  #',
    '#B  B  B  B  B  B  #',
    '#BddB  BddB  BddB  #',
    '#                  #',
    '#   X          s   #',
    '#                  #',
    '#              C   #',
    '#                  #',
    '#                  #',
    '#                  #',
    '#########o##########',
  ],
  npcs: [
    // His down cone stops at (9,7): the arrival tile (9,10) is never watched, but
    // walking straight up from the door walks into him (review, 2026-09-15; post 2026-10-08)
    { id: 'ranger5', char: 'guard', pal: 'safari', x: 9, y: 4, dir: 'down', goneIf: { flag: 'safariRanger5' }, heatGuard: { encounterId: 'safari_ranger5' } },
    // CH8-FB.3: a resident idles in each pen behind its locked gate; the lever's
    // puffs take them (goneIf ch8PensEmpty, set AFTER the poofs). MACHOPP is the
    // spriter's derived overworld idle (MACHOPP_OW_A/B); a ZUBATT in the middle.
    { id: 'pen1', char: 'machopp', x: 2, y: 2, dir: 'down', goneIf: { flag: 'ch8PensEmpty' } },
    { id: 'pen2', char: 'zubatt', x: 8, y: 2, dir: 'down', goneIf: { flag: 'ch8PensEmpty' } },
    { id: 'pen3', char: 'machopp', x: 14, y: 2, dir: 'down', goneIf: { flag: 'ch8PensEmpty' } },
  ],
  signs: {
    '15,5': [['PENS 1-3. FEED', 'AT DAWN. THE', 'LEVER OPENS ALL.']],
  },
  items: {},
  warps: {
    '9,11': ['safari2', 13, 1, 'down'],
  },
  scripts: safari3Scripts,
});
