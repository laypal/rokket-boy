// SYLPHCO 1F (CH6.0 §12) — the lobby, a battle floor (no heat). Door 'o'
// (9,11) back to the ANN DOCK; lift pad A (3,4) up to 2F, with DJAMES —
// Rokket's inside man — standing ON it until he has taught the ALARM rules
// (goneIf ch6Rules, the CH5 stair-ghost gate); the express lift F' (10,8)
// to 5F sits behind the card-key door 'd' (10,7). Grid frozen in
// .paul/plan/ch6-sylphco/maps.md.
import type { MapDef } from '../../types';
import { syl1Scripts } from '../dialog/syl1';
import { makeMap } from './make';

export const syl1Map: MapDef = makeMap({
  id: 'syl1',
  name: 'SYLPHCO 1F',
  pal: 'sylph',
  music: 'sylph',
  rows: [
    '####################',
    '#K K K    C    I   #',
    '#                  #',
    '#s       ,,,,,,    #',
    '#  W     ,,,,,,    #',
    '#        ,,,,,,    #',
    '#  P              P#',
    '#   ######d#####   #',
    '#   #  s  W    #   #',
    '#   ############   #',
    '#                  #',
    '#########o##########',
  ],
  npcs: [
    // the HEAT onboarding gate — on the pad until the rules are taught (§7)
    { id: 'djames', char: 'djames', x: 3, y: 4, dir: 'down', goneIf: { flag: 'ch6Rules' } },
    { id: 'reception', char: 'jessika', pal: 'chief', x: 4, y: 2, dir: 'down' },
    { id: 'doorman', char: 'guard', pal: 'chief', x: 12, y: 5, dir: 'left' },
  ],
  signs: {
    '1,3': [
      ['SYLPHCO TOWER.', 'LIFT PAD -> 2F.', 'STAFF ONLY.'],
      ['ALARM RULES:', 'EYE CONTACT =', 'SEEN. HIDE.'],
      ['3 SIGHTINGS =', 'LOCKDOWN. 20s TO', 'A LIFT PAD.'],
    ],
    '7,8': [['EXPRESS LIFT', '-> 5F. CARD KEY', 'HOLDERS ONLY.']],
  },
  items: {},
  warps: {
    '3,4': ['syl2', 1, 1, 'down'],
    '10,8': ['syl5', 3, 8, 'down'],
    '9,11': ['dock', 18, 6, 'left'],
  },
  scripts: syl1Scripts,
});
