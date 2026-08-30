// SYLPHCO 4F (CH6.0 §12) — LABS, the second STEALTH floor (watch:true, no
// wild table, three posted guards). The lift up, E (11,9), sits in a
// walled room behind the card-key door 'd' (12,7). Pad D' (1,1) returns to
// 2F's east wing. Route (1,1)->(1,4)->row 4->(12,4)->(12,6)->door is exposed
// only at (6,4) while guard_d faces down — cone table in
// .paul/plan/ch6-sylphco/maps.md.
import type { MapDef } from '../../types';
import { syl4Scripts } from '../dialog/syl4';
import { makeMap } from './make';

export const syl4Map: MapDef = makeMap({
  id: 'syl4',
  name: 'SYLPHCO 4F',
  pal: 'sylph',
  music: 'sylph',
  watch: true,
  rows: [
    '########################',
    '#W s     X   X         #',
    '#                      #',
    '#  X X    L L L   X    #',
    '#                      #',
    '#     D D    X X       #',
    '#  X               X   #',
    '#        ###d###       #',
    '#        #     #       #',
    '#  X X   # W s #  X    #',
    '#        #######       #',
    '########################',
  ],
  npcs: [
    { id: 'guard_d', char: 'guard', pal: 'chief', x: 6, y: 2, dir: 'right', heatGuard: { encounterId: 'syl_watch' } },
    { id: 'guard_e', char: 'guard', pal: 'chief', x: 16, y: 4, dir: 'left', heatGuard: { encounterId: 'syl_watch' } },
    { id: 'guard_f', char: 'guard', pal: 'chief', x: 20, y: 8, dir: 'up', heatGuard: { encounterId: 'syl_watch' } },
  ],
  signs: {
    '3,1': [['LIFT PAD -> 2F', 'EAST WING.'], ['LABS. GUARDS', 'AGAIN. THE LIFT', 'UP IS CARD-KEYED.']],
    '13,9': [['LIFT PAD -> 5F.', 'THE TOP FLOOR.']],
  },
  items: {},
  warps: {
    '1,1': ['syl2', 21, 9, 'down'],
    '11,9': ['syl5', 1, 1, 'down'],
  },
  scripts: syl4Scripts,
});
