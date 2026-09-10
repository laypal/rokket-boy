// GAMEZ CORNER
import type { MapDef } from '../../types';
import { cornerScripts } from '../dialog/corner';
import { makeMap } from './make';

export const cornerMap: MapDef = makeMap({
  id: 'corner',
  name: 'GAMEZ CORNER',
  pal: 'casino',
  music: 'casino',
  rows: [
    '####################',
    '===p=========s======',
    '#                  #',
    '#K  MM  MM  MM  QQ #',
    '#                  #',
    '#   MM  MM  MM  MM #',
    '#                  s',
    '#I  MM  MM  MM  MM o',
    '#                  #',
    '#P                P#',
    '#########oo#########',
  ],
  npcs: [
    { id: 'poster_guard', char: 'guard', x: 3, y: 2, dir: 'down', goneIf: { flag: 'guardBeaten' }, heatGuard: { encounterId: 'guard_voltorbb' } },
    { id: 'dealer', char: 'guard', x: 1, y: 4, dir: 'right' },
    { id: 'gambler', char: 'djames', x: 8, y: 6, dir: 'left', pal: 'guard' },
  ],
  signs: {
    // F42: the gated cave mouth is signposted — you can read where it goes
    // long before the job that opens it.
    '19,6': [['MT. MOON:', 'CAVE MOUTH EAST.', 'MIND THE DARK.']], '13,1': [['GAMEZ CORNER', 'THE PLAYING', 'NEVER STOPS!']] },
  items: {},
  // stairs at 2,2 revealed by the poster switch (tile:p script adds the warp)
  // cave mouth at (19,7) — CH2.2 entrance to MT. MOON; off the chapter1 e2e
  // path (it only ever touches x=10 on row 7, in transit) so the standing
  // Chapter 1 regression is untouched
  warps: {
    '9,10': ['hq', 9, 12, 'up'], '10,10': ['hq', 10, 12, 'up'],
    '19,7': ['moon1', 1, 5, 'right'],
  },
  // F42 GATE.0: the cave mouth is visible from the first visit; it opens once
  // the CH1 job is handed in.
  gates: {
    '19,7': { cond: { flag: 'missionDone' }, msg: ['MT. MOON IS THE', 'JOB AFTER THIS.'] },
  },
  scripts: cornerScripts,
});
