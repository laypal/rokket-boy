// SIDE.5 — HQ TRAINING ROOM (the stealth drill). A drill map (MapDef.drill):
// a stage-3 lockdown bust resets the player to the start tile instead of
// whiting out. The posted guard runs the REAL 1f heat machinery — gaze
// sweep, startle, chase — but contact starts the spar-flagged drill_guard
// encounter, so nothing in this room can ever punish. The W pad at (10,1)
// is the goal (A on it, locker idiom); the approach column crosses the
// guard's right-gaze at row 4, which is the timing lesson.
import type { MapDef } from '../../types';
import { hqDrillScripts } from '../dialog/hqDrill';
import { makeMap } from './make';

export const hqDrillMap: MapDef = makeMap({
  id: 'hqDrill',
  name: 'TRAINING ROOM',
  pal: 'hq',
  music: 'hq',
  rows: [
    '############',
    '#         W#',
    '#   X  X   #',
    '#          #',
    '#  X       #',
    '#          #',
    '#   X  X   #',
    '#          #',
    '#          #',
    '#####o######',
  ],
  npcs: [
    { id: 'drillguard', char: 'guard', x: 7, y: 4, dir: 'down', heatGuard: { encounterId: 'drill_guard' } },
  ],
  signs: {},
  items: {},
  warps: { '5,9': ['hq', 10, 9, 'down'] },
  scripts: hqDrillScripts,
  drill: { x: 5, y: 8 },
});
