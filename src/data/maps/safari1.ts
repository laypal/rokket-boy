// SAFARI ZOON — GATE (CH8.0 §7). Door 'o' (5,11) back through the NUGGET
// SPAN's north rail; the ticket BOOTH 'K' with the inside man beside it
// (todo `!` until he has taught the ranger rules — ch8Rules); the WARDEN's
// lodge is a sign, no interior; one posted RANGER in the lane; the rail
// fence with its gap is the way north to the PARK (9,0). After either point
// of no return the branch's boss stands on (5,10) — the tile in front of
// the exit — WARDEN on the loyal path, EXEC PETRELLE on the betrayal path
// (goneIf on the OTHER branch's flag or his own defeat). Arrival from the
// span lands on (5,9), inside the boss. `watch` (rangers scan calm), no
// zone: the gate stays cool on the escape — the boss is the wall (§3).
import type { MapDef } from '../../types';
import { safari1Scripts } from '../dialog/safari1';
import { makeMap } from './make';

export const safari1Map: MapDef = makeMap({
  id: 'safari1',
  name: 'SAFARI ZOON',
  pal: 'safari',
  music: 'safari',
  watch: true,
  rows: [
    '#########o##########',
    '#         s        #',
    '#   s              #',
    '#                  #',
    '#  KKK        X X  #',
    '#                  #',
    '#BBBBBBB  BBBBBBBBB#',
    '#                  #',
    '#                  #',
    '#  s               #',
    '#                  #',
    '#####o##############',
  ],
  npcs: [
    // row 5, not 3: at the arrival tile the camera clamps to the map's top and a
    // row-3 NPC's `!` (drawn 14 px above him) sits off the screen (playtester, 2026-09-15)
    { id: 'insider', char: 'guard', pal: 'safari', x: 5, y: 5, dir: 'down', todoIf: { notFlag: 'ch8Rules' } },
    // CH8-FB.1: a beaten ranger is off the map for good (goneIf his payday flag)
    { id: 'ranger1', char: 'guard', pal: 'safari', x: 13, y: 7, dir: 'left', goneIf: { flag: 'safariRanger1' }, heatGuard: { encounterId: 'safari_ranger1' } },
    { id: 'warden', char: 'guard', pal: 'safari', x: 5, y: 10, dir: 'up', goneIf: { any: [{ notFlag: 'ch8Poached' }, { flag: 'ch8Warden' }] } },
    { id: 'petrelle', char: 'kira', pal: 'petrelle', x: 5, y: 10, dir: 'up', goneIf: { any: [{ notFlag: 'ch8Freed' }, { flag: 'ch8Petrelle' }] } },
  ],
  signs: {
    '10,1': [['THE PARK. STAY ON', 'THE PATH. RANGERS', 'ON PATROL.']],
    '4,2': [["WARDEN'S LODGE.", 'KNOCK. WAIT.', 'BE HONEST.']],
    '3,9': [['SAFARI ZOON.', 'PASS HOLDERS', 'ONLY.']],
  },
  items: {},
  warps: {
    '9,0': ['safari2', 13, 18, 'up'],
    '5,11': ['bridge', 6, 1, 'down'],
  },
  scripts: safari1Scripts,
});
