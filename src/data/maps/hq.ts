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
    { id: 'giovanni', char: 'giovanni', x: 7, y: 3, dir: 'down',
      // ONB.3: lit whenever a briefing or a hand-in is waiting. The notFlag
      // ch2Done/ch3Done guards keep a skipped briefing from leaving a
      // permanent `!` once the chapter is over anyway.
      todoIf: { any: [
        { notFlag: 'briefed' },                                                              // CH1 briefing
        { all: [{ flag: 'lootTaken' }, { notFlag: 'missionDone' }] },                        // CH1 hand-in
        { all: [{ flag: 'missionDone' }, { notFlag: 'ch2Briefed' }, { notFlag: 'ch2Done' }] }, // CH2 briefing
        { all: [{ flag: 'bradBeaten' }, { notFlag: 'ch2Done' }] },                           // CH2 hand-in
        { all: [{ flag: 'ch2Done' }, { notFlag: 'ch3Briefed' }, { notFlag: 'ch3Done' }] },   // CH3 briefing
        { all: [{ flag: 'ch3Done' }, { notFlag: 'ch4Briefed' }, { notFlag: 'ch4Done' }] },   // CH4 briefing
        { all: [{ flag: 'ch4Done' }, { notFlag: 'ch5Briefed' }, { notFlag: 'ch5Done' }] },   // CH5 briefing
        { all: [{ flag: 'ch5Mask' }, { notFlag: 'ch5Done' }] },                              // CH5 hand-in
      ] } },
    { id: 'jessika', char: 'jessika', x: 13, y: 7, dir: 'down', todoIf: { notFlag: 'drillBattleDone' } }, // ONB.3: until her spar is won once
    { id: 'djames', char: 'djames', x: 15, y: 7, dir: 'down' },
    // ONB.3-FB (Lyall 2026-08-22): the ! used to sit on Myowth from the first
    // frame until sneak school was DONE — a marker that lied for a whole
    // chapter. His first talk grants the `myowth` egg, so that's the "met"
    // signal; the second reason to talk (the drill) only exists post-mission.
    { id: 'myowth', char: 'myowth', x: 10, y: 8, dir: 'down', todoIf: { any: [{ notEgg: 'myowth' }, { all: [{ flag: 'missionDone' }, { notFlag: 'drillStealthDone' }] }] } },
    { id: 'vendor', char: 'grunt', x: 6, y: 11, dir: 'down', pal: 'gold' },
    { id: 'bunkgrunt', char: 'medic', x: 3, y: 9, dir: 'down' }, // ONB.7: full-heal NPC gets its own cap+cross so the bunk room's healer reads distinct from the player and every plain grunt
    // RNK.3: the BACK ROOM gear vendor — free floor between the D desks and
    // the C-J-C console cluster on row 2. 'ghost' distinguishes him from the
    // front-of-house 'vendor' (gold) at a glance.
    { id: 'blackmarket', char: 'grunt', x: 10, y: 2, dir: 'down', pal: 'ghost' },
    // SIDE.4: the GRUNTDEX completion clerk — free floor on the room's
    // right-hand side, clear of the console cluster and every e2e walk path.
    { id: 'dexclerk', char: 'grunt', x: 16, y: 5, dir: 'down' },
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
  items: { '5,9': { id: 'hq_smoke', item: 'SMOKE BALL' } },
  warps: { '9,13': ['corner', 9, 2, 'down'], '10,13': ['corner', 10, 2, 'down'] },
  scripts: hqScripts,
});
