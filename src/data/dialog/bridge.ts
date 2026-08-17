// NUGGET SPAN — dialogue & interaction scripts (CH3.2/3.3). Each mark is a
// shared `<name>Intro` constant (say pages + the battle step) referenced by
// BOTH the lane `step:` trigger and the `npc:` talk trigger — belt and
// braces, same idea as BRAD's ambush (moonDig.ts). The `step:` entry is
// silent once the mark is beaten (the tile just walks through); the `npc:`
// entry adds a one-page sore-loser line for that case instead.
import type { ScriptStep } from '../../types';

const camperIntro: ScriptStep[] = [
  {
    say: [
      ['CAMPER: Whoa, a', 'challenger! Beat', 'me, win a NUGGET!'],
      ['Step up, house.', "Let's see what", 'you got!'],
    ],
  },
  { battle: 'span_camper' },
];

const picnickerIntro: ScriptStep[] = [
  {
    say: [
      ['PICNICKER: Ooh,', 'a real duel! I', 'packed snacks!'],
      ['Win me a', 'NUGGET, house!'],
    ],
  },
  { battle: 'span_picnicker' },
];

const hikerIntro: ScriptStep[] = [
  {
    say: [
      ['HIKER: Long walk', 'for a shot at a', "NUGGET. Let's go."],
      ['Trail-worn,', 'not scared.'],
    ],
  },
  { battle: 'span_hiker' },
];

const youngsterIntro: ScriptStep[] = [
  {
    say: [
      ['YOUNGSTER: Bet', 'I can win this', 'NUGGET fair!'],
      ['Bring it on!'],
    ],
  },
  { battle: 'span_youngster' },
];

const lassIntro: ScriptStep[] = [
  {
    say: [
      ['LASS: Final act,', 'house. Show me', 'the goods.'],
      ['Last mark', 'standing.'],
    ],
  },
  { battle: 'span_lass' },
];

// KIRA holds the top of the span — the loyalty test at the end of CH3
// (§ frozen script, task card). Beating every mark first is a hard gate;
// beating her sets ch3Done and closes the chapter (the CHAPTERS table's
// own "REPORT TO BOSS" step, since she IS the recruiter here).
const kiraScript: ScriptStep[] = [
  {
    if: { flag: 'ch3Done' },
    then: [{ say: [['KIRA: Back to', 'work, OPERATIVE.', 'The span is ours.']] }],
    else: [
      {
        if: { notFlag: 'spanLass' },
        then: [{ say: [['KIRA: The marks', 'first, grunt.', 'Then we talk.']] }],
        else: [
          {
            say: [
              ['KIRA: Five for', 'five. Not bad', 'for an AGENT.'],
              ['But the boss', 'asked me one', 'thing about you.'],
              ['Do you fold when', 'it is a ROKKET', 'across the line?'],
              ['Show me.'],
            ],
          },
          { battle: 'span_kira' },
        ],
      },
    ],
  },
];

export const bridgeScripts: Record<string, ScriptStep[]> = {
  'step:6,15': [{ if: { notFlag: 'spanCamper' }, then: camperIntro }],
  'npc:camper': [
    {
      if: { notFlag: 'spanCamper' },
      then: camperIntro,
      else: [{ say: [['CAMPER: Still', 'sore about that', 'loss. Rematch?']] }],
    },
  ],

  'step:6,12': [{ if: { notFlag: 'spanPicnicker' }, then: picnickerIntro }],
  'npc:picnicker': [
    {
      if: { notFlag: 'spanPicnicker' },
      then: picnickerIntro,
      else: [{ say: [['PICNICKER: Ugh,', 'my sandwich is', 'still soggy.']] }],
    },
  ],

  'step:6,9': [{ if: { notFlag: 'spanHiker' }, then: hikerIntro }],
  'npc:hiker': [
    {
      if: { notFlag: 'spanHiker' },
      then: hikerIntro,
      else: [{ say: [['HIKER: Lost my', 'footing there.', 'Next time.']] }],
    },
  ],

  'step:6,6': [{ if: { notFlag: 'spanYoungster' }, then: youngsterIntro }],
  'npc:youngster': [
    {
      if: { notFlag: 'spanYoungster' },
      then: youngsterIntro,
      else: [{ say: [['YOUNGSTER: No', 'fair, I want', 'a rematch!']] }],
    },
  ],

  'step:6,3': [{ if: { notFlag: 'spanLass' }, then: lassIntro }],
  'npc:lass': [
    {
      if: { notFlag: 'spanLass' },
      then: lassIntro,
      else: [{ say: [['LASS: Beaten.', 'Guess the house', 'always wins.']] }],
    },
  ],

  'step:6,1': kiraScript,
  'npc:kira': kiraScript,
};
