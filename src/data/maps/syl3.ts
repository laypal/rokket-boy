// SYLPHCO 3F (CH6.0 §12) — RECORDS, a battle floor: two CLERK trainers and
// the CARD KEY pickup (15,8) in a one-tile-mouthed alcove that clerk_b
// stands in front of until beaten (goneIf sylClerkB). The `~` clutter is
// the chapter's only wild table (DROWZEY, so the dex stays reachable —
// CH6.0 assumption 8). Pads: B' (1,1) back to 2F, C (17,8) in the alcove
// to 2F's east wing.
import type { MapDef } from '../../types';
import { syl3Scripts } from '../dialog/syl3';
import { makeMap } from './make';

export const syl3Map: MapDef = makeMap({
  id: 'syl3',
  name: 'SYLPHCO 3F',
  pal: 'sylph',
  music: 'sylph',
  rows: [
    '####################',
    '#W s   L L L L L   #',
    '#                  #',
    '#  ~~~~    C  C    #',
    '#  ~~~~            #',
    '#  ~~~~   D D D    #',
    '#                  #',
    '#   L L L     ######',
    '#             #b W #',
    '#  X   X      ## ###',
    '#                  #',
    '####################',
  ],
  npcs: [
    { id: 'clerk_a', char: 'kira', pal: 'chief', x: 12, y: 2, dir: 'down' },
    // the alcove mouth — beaten = gone, the BRAD precedent
    { id: 'clerk_b', char: 'guard', pal: 'chief', x: 16, y: 9, dir: 'down', goneIf: { flag: 'sylClerkB' } },
  ],
  signs: {
    '3,1': [['LIFT PAD -> 2F', 'WEST SIDE.'], ['RECORDS DEPT.', 'CARD KEYS ARE', 'FILED SOUTH-EAST.']],
  },
  items: { '15,8': { id: 'syl_cardkey', item: 'CARD KEY' } },
  warps: {
    '1,1': ['syl2', 1, 10, 'down'],
    '17,8': ['syl2', 19, 10, 'down'],
  },
  scripts: syl3Scripts,
  encounters: { rate: 0.15, entries: [{ species: 'drowzey', weight: 1, lv: [20, 23] }] },
});
