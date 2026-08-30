// ANN DOCK (CH4.2) — the quayside outside CERULEUN EDGE's new east door.
// West door 'o' at (0,6) leads back to outskirts; the gangway '>' at (17,2)
// climbs onto the S.S. ANN's deck. No heatZone/lockdown/watch here — this
// tile IS the heist's escape (CH4.0 §1: the gangway warp clears the ship's
// shared heat zone because the dock's heatKey differs from it).
import type { MapDef } from '../../types';
import { dockScripts } from '../dialog/dock';
import { makeMap } from './make';

export const dockMap: MapDef = makeMap({
  id: 'dock',
  name: 'ANN DOCK',
  pal: 'ship',
  music: 'ship',
  disguise: 'sailor',
  rows: [
    '####################',
    '#wwwwwwwwwwwwwwwwww#',
    '#wwwwwwwwwwwwwwww>w#',
    '#BBBBBBBBBBBBBBBB B#',
    '#                  #',
    '#   X    s         #',
    'o                  o',
    '#   X       X      #',
    '#  P             P #',
    '####################',
  ],
  npcs: [
    // Jessika hands over the SAILOR SUIT — the hint NPC for the whole ship
    // (no-softlock rule): without it the gangway is a dead end.
    { id: 'jessika', char: 'jessika', x: 4, y: 6, dir: 'down', todoIf: { notFlag: 'ch4Suit' } },
    // The chief blocks the gangway foot once the safe is cracked and stays
    // gone once he's fallen — goneIf mirrors the encounter's own gate.
    { id: 'chief', char: 'chief', x: 17, y: 4, dir: 'up', goneIf: { any: [{ notFlag: 'ch4Safe' }, { flag: 'ch4Done' }] } },
    // The drunk deckhand — a second hint NPC, points at the cabin door.
    { id: 'sailor_dock', char: 'sailor', x: 12, y: 5, dir: 'down' },
  ],
  signs: {
    '9,5': [['S.S. ANN GALA', 'TONIGHT!', 'CREW ONLY ABOARD']],
  },
  items: {},
  warps: {
    '19,6': ['syl1', 9, 10, 'up'], // CH6.2: SYLPHCO TOWER, across the quay
    '0,6': ['outskirts', 19, 6, 'left'],
    '17,2': ['deck1', 2, 9, 'up'],
  },
  scripts: dockScripts,
});
