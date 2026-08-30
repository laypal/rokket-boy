// SYLPHCO 5F (CH6.0 §12) — the president's floor, a battle floor: one EXEC
// trainer, the HEAL PAD 'h' (10,5) before the card-key office door 'd'
// (7,7), and inside it the BOSS BALL chest '$' (9,8) flanked by pillars
// with the two BODYGUARDS in front of it (both goneIf ch6Duo — the chained
// duo, .paul/PLAN.md CH6.0 §5). Pads: E' (1,1) back to 4F, F (3,8) the
// express lift down to the lobby. `at:9,8` is the steal; `enter` repairs
// the chest on reload (the moonDig $-chest convention).
import type { MapDef } from '../../types';
import { syl5Scripts } from '../dialog/syl5';
import { makeMap } from './make';

export const syl5Map: MapDef = makeMap({
  id: 'syl5',
  name: 'SYLPHCO 5F',
  pal: 'sylph',
  music: 'sylph',
  rows: [
    '####################',
    '#W s      P     P  #',
    '#                  #',
    '#   C C      L L   #',
    '#                  #',
    '#  D D    h   s    #',
    '#                  #',
    '#######d############',
    '#  W    I$I        #',
    '#  s               #',
    '#                  #',
    '####################',
  ],
  npcs: [
    { id: 'exec', char: 'giovanni', pal: 'chief', x: 14, y: 2, dir: 'down' },
    // the duo — both run the same script, both leave once it's won
    { id: 'guard_a', char: 'guard', pal: 'chief', x: 9, y: 9, dir: 'down', goneIf: { flag: 'ch6Duo' } },
    { id: 'guard_b', char: 'guard', pal: 'chief', x: 10, y: 9, dir: 'down', goneIf: { flag: 'ch6Duo' } },
    { id: 'president', char: 'giovanni', pal: 'captain', x: 12, y: 9, dir: 'left' },
  ],
  signs: {
    '3,1': [['LIFT PAD -> 4F', 'LABS.'], ["PRESIDENT'S", 'OFFICE. HEAL PAD', 'FOR STAFF ONLY.']],
    '14,5': [['HEAL PAD.', 'STEP ON TO REST.', 'FREE FOR STAFF.']],
    '3,9': [['EXPRESS LIFT', '-> 1F LOBBY.']],
  },
  items: {},
  warps: {
    '1,1': ['syl4', 11, 9, 'down'],
    '3,8': ['syl1', 10, 8, 'down'],
  },
  scripts: syl5Scripts,
});
