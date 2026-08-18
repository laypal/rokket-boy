// SIDE.5 — training room scripts. `enter` re-arms heat 1 on EVERY entry
// (a warp-out scrubs map heat, so re-entry must re-light it); the intro
// pages repeat until the course is beaten, then stay out of the way. The
// goal pad is a STEP-ON trigger (2026-08-15 playtest: A-facing a walkable
// tile is a guessing game — you had to be below it facing up); it pays 150c
// exactly once (drillStealthDone) and warps home every time. `tile:W` is a
// nudge for anyone who presses A at the pad instead of walking on it.
import type { ScriptStep } from '../../types';

export const hqDrillScripts: Record<string, ScriptStep[]> = {
  enter: [
    {
      if: { notFlag: 'drillStealthDone' },
      then: [
        {
          say: [
            ['MYOWTH: See the', 'PAD, top right?', 'WALK ONTO it.'],
            ['Guards see three', 'tiles ahead.', 'Crates block it.'],
            ['Spotted? Alarm', 'runs out, you', 'restart. No cost.'],
          ],
        },
      ],
    },
    { heat: 1 },
  ],
  'step:10,1': [
    { sfx: 'beep' },
    {
      if: { notFlag: 'drillStealthDone' },
      then: [
        { setFlag: 'drillStealthDone' },
        { addCoins: 150 },
        { sfx: 'item' },
        { say: [['MYOWTH: Clean', 'run! 150 coins,', 'as promised.']] },
        { sysMsg: ['GOT 150 COINS!'] },
      ],
      else: [{ say: [['MYOWTH: Still', 'got it, see?']] }],
    },
    { warp: ['hq', 10, 9, 'down'] },
  ],
  'tile:W': [{ say: [['The goal pad.', 'Step onto it', 'to finish.']] }],
  // SIDE.3 map secret — the west wall by the entrance, faced from (1,1). No
  // e2e spec drives hqDrill at all (grepped the e2e dir clean), so there's
  // no walked-cell set to dodge here; kept clear of drillguard (7,4) and the
  // goal pad (10,1) anyway.
  'at:0,1': [
    {
      if: { notEgg: 'drillsign' },
      then: [
        { addEgg: 'drillsign' },
        { sfx: 'item' },
        { say: [["MYOWTH'S POSTER:", '"YOU GOT THIS,', 'PROBABLY!"']] },
        { sysMsg: ['EGG FOUND!'] },
      ],
      else: [{ say: [['Still probably.']] }],
    },
  ],
};
