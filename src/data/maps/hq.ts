// ROKKET HQ B1F
import type { MapDef } from '../../types';
import { hqScripts } from '../dialog/hq';
import { makeMap } from './make';

export const hqMap: MapDef = makeMap({
  id: 'hq',
  name: 'ROKKET HQ B1F',
  pal: 'hq',
  music: 'hq',
  rows: [
    '####################',
    '=====s========s=====',
    '#CCC  DDD    CJC L #',
    '#                  #',
    '#  P            P  #',
    '#        12        #',
    '#        34        #',
    '#                  #',
    '#X                 #',
    '#XX  b         L L #',
    '#                  #',
    '#  C               #',
    '#P                P#',
    '#########oo#########',
  ],
  npcs: [
    { id: 'giovanni', char: 'giovanni', x: 7, y: 3, dir: 'down' },
    { id: 'jessika', char: 'jessika', x: 13, y: 7, dir: 'down' },
    { id: 'djames', char: 'djames', x: 15, y: 7, dir: 'down' },
    { id: 'myowth', char: 'myowth', x: 10, y: 8, dir: 'down' },
    { id: 'vendor', char: 'grunt', x: 6, y: 11, dir: 'down', pal: 'gold' },
    { id: 'bunkgrunt', char: 'grunt', x: 3, y: 9, dir: 'down' },
    // RNK.3: the BACK ROOM gear vendor — free floor between the D desks and
    // the C-J-C console cluster on row 2. 'ghost' distinguishes him from the
    // front-of-house 'vendor' (gold) at a glance.
    { id: 'blackmarket', char: 'grunt', x: 10, y: 2, dir: 'down', pal: 'ghost' },
  ],
  // Two pages each: the old 4-line versions lost their last line at draw
  // time (3-line box), which is why the motto read as a half-sentence.
  signs: {
    '5,1': [
      ['ROKKET HQ B1F', 'STAFF ONLY.'],
      ['TEAM MOTTO:', 'STEAL CRITTERS,', 'GET RICH. EASY.'],
    ],
    '14,1': [
      ['NOTICE BOARD:', 'JOB TONIGHT AT', 'THE GAMEZ CORNER.'],
      ['NEW GRUNTS: SEE', 'THE BOSS FIRST.', 'JOBS: USE PANEL.'],
    ],
  },
  items: { '5,9': { name: 'SMOKE BALL', flag: 'gotSmoke' } },
  warps: { '9,13': ['corner', 9, 2, 'down'], '10,13': ['corner', 10, 2, 'down'] },
  scripts: hqScripts,
});
