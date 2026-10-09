// NUGGET SPAN — the prize bridge (CH3.2/3.3). A dead-straight lane (x=5,6)
// over open water, rails either side. Five marks stand on the lane at
// (5, 15/12/9/6/3); AGENT KIRA holds the top at (5,1). The rail behind her
// was ROAD CLOSED until CH8: (6,0) is now the gated door to the SAFARI ZOON
// (ch7Done, F42 toast) with the sign on the rail at (7,1) — CH8.0 §7.
// Losing to any of them whitesouts to HQ — flags persist, so the run resumes
// at the next unbeaten mark on the next attempt (belt-and-braces `step:`/
// `npc:` triggers, same shape as BRAD's ambush). No wild encounters here.
import type { MapDef } from '../../types';
import { bridgeScripts } from '../dialog/bridge';
import { makeMap } from './make';

export const bridgeMap: MapDef = makeMap({
  id: 'bridge',
  name: 'NUGGET SPAN',
  pal: 'span',
  music: 'bridge',
  rows: [
    'wwwwB#oBwwww',
    'wwwwB  swwww',
    'wwwwB  Bwwww',
    'wwwwB  Bwwww',
    'wwwwB  Bwwww',
    'wwwwB  Bwwww',
    'wwwwB  Bwwww',
    'wwwwB  Bwwww',
    'wwwwB  Bwwww',
    'wwwwB  Bwwww',
    'wwwwB  Bwwww',
    'wwwwB  Bwwww',
    'wwwwB  Bwwww',
    'wwwwB  Bwwww',
    'wwwwB  Bwwww',
    'wwwwB  Bwwww',
    'wwwwB  Bwwww',
    'wwwwB  Bwwww',
    'wwwwB  Bwwww',
    'wwwwBooBwwww',
  ],
  npcs: [
    { id: 'camper', char: 'grunt', pal: 'guard', x: 5, y: 15, dir: 'down', goneIf: { flag: 'spanCamper' } },
    { id: 'picnicker', char: 'jessika', pal: 'gold', x: 5, y: 12, dir: 'down', goneIf: { flag: 'spanPicnicker' } },
    { id: 'hiker', char: 'djames', pal: 'brad', x: 5, y: 9, dir: 'down', goneIf: { flag: 'spanHiker' } },
    { id: 'youngster', char: 'guard', pal: 'gold', x: 5, y: 6, dir: 'down', goneIf: { flag: 'spanYoungster' } },
    { id: 'lass', char: 'jessika', pal: 'brad', x: 5, y: 3, dir: 'down', goneIf: { flag: 'spanLass' } },
    { id: 'kira', char: 'kira', x: 5, y: 1, dir: 'down' },
  ],
  signs: {
    '7,1': [['SAFARI ZOON', 'AHEAD. PASS', 'HOLDERS ONLY.']], // CH8.0 §7: on the rail beside the door, readable from (6,1) — (5,0) faces only Kira's tile
  },
  items: {},
  warps: {
    '5,19': ['outskirts', 10, 1, 'down'],
    '6,19': ['outskirts', 10, 1, 'down'],
    '6,0': ['safari1', 5, 9, 'up'], // CH8.0 §7: the north rail opens onto the SAFARI ZOON gate
  },
  gates: {
    '6,0': { cond: { flag: 'ch7Done' }, msg: ['THE SAFARI ZOON', 'IS THE JOB', 'AFTER THIS.'] },
  },
  scripts: bridgeScripts,
});
