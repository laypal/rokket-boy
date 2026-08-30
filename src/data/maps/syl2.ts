// SYLPHCO 2F (CH6.0 §12) — the first STEALTH floor: watch:true so the three
// posted guards scan for eye contact even at ALARM 0 (CH4.0 §1b), no wild
// table, crates/desks/shelves as gaze cover. Heat is keyed by this map id
// (no zone), so any lift pad off the floor clears it (the deck's rule).
// Pads: A' (1,1) to the lobby, B (1,10) to 3F RECORDS, and the east wing
// behind the card-key door 'd' (18,9): C' (19,10) to 3F's alcove, D (21,9)
// up to 4F. Cone table in .paul/plan/ch6-sylphco/maps.md.
import type { MapDef } from '../../types';
import { syl2Scripts } from '../dialog/syl2';
import { makeMap } from './make';

export const syl2Map: MapDef = makeMap({
  id: 'syl2',
  name: 'SYLPHCO 2F',
  pal: 'sylph',
  music: 'sylph',
  watch: true,
  rows: [
    '########################',
    '#W s      L L L        #',
    '#                      #',
    '#  X X X     X         #',
    '#                      #',
    '#     X X       X X X  #',
    '#                      #',
    '#  D D D      X        #',
    '#                 ######',
    '#   X   X   X     d  W #',
    '#W s              #W  s#',
    '########################',
  ],
  npcs: [
    { id: 'guard_a', char: 'guard', pal: 'chief', x: 7, y: 2, dir: 'down', heatGuard: { encounterId: 'syl_watch' } },
    { id: 'guard_b', char: 'guard', pal: 'chief', x: 13, y: 6, dir: 'left', heatGuard: { encounterId: 'syl_watch' } },
    { id: 'guard_c', char: 'guard', pal: 'chief', x: 16, y: 4, dir: 'down', heatGuard: { encounterId: 'syl_watch' } },
  ],
  signs: {
    '3,1': [['LIFT PAD -> 1F', 'LOBBY.'], ['GUARDS ON THIS', 'FLOOR. THEIR GAZE', 'SWEEPS. HIDE.']],
    '3,10': [['LIFT PAD -> 3F', 'RECORDS DEPT.']],
    '22,10': [['EAST WING LIFTS.', 'N PAD -> 4F LABS.', 'S PAD -> 3F.']],
  },
  items: {},
  warps: {
    '1,1': ['syl1', 3, 4, 'down'],
    '1,10': ['syl3', 1, 1, 'down'],
    '19,10': ['syl3', 17, 8, 'down'],
    '21,9': ['syl4', 1, 1, 'down'],
  },
  scripts: syl2Scripts,
});
