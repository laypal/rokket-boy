// THE PENS — the point of no return, twice (CH8.0 §2). Two `at:`
// interactables, each hidden once EITHER branch has been chosen, each
// asking one YES/NO before it does anything, each setting its own flag
// FIRST. No step anywhere clears ch8Poached or ch8Freed; no third
// interactable exists (the deck's non-goal, ch8-contracts lint). Either YES
// sets the shared 'park' zone to heat 2 — the rangers hunt on the way out.
import type { Cond, ScriptStep } from '../../types';

/** Chosen already — one way or the other. */
const CHOSEN: Cond = { any: [{ flag: 'ch8Poached' }, { flag: 'ch8Freed' }] };

/** The three pens' locked gates (`d`, two wide) the lever opens (setTile to floor). */
const PEN_GATES: [number, number][] = [[2, 3], [3, 3], [8, 3], [9, 3], [14, 3], [15, 3]];

const OPEN_PENS: ScriptStep[] = PEN_GATES.map(([x, y]) => ({ setTile: [x, y, ' '] }));

/** Where the residents stand — the puffs land here (CH8-FB.3). */
const RESIDENTS: [number, number][] = [[2, 2], [8, 2], [14, 2]];

export const safari3Scripts: Record<string, ScriptStep[]> = {
  // enter-repair: an opened pen stays open across a reload (the CH7 mine
  // convention — flags are saved, tiles are not)
  enter: [{ if: { flag: 'ch8Freed' }, then: OPEN_PENS }],
  // the locked gates — no CARD KEY check here, the lever is the only key
  'tile:d': [{ say: [['LOCKED. THE', 'LEVER OPENS ALL', 'THREE.']] }],
  // the PRIZE CRATE — the LOYAL act
  'at:4,5': [
    {
      if: CHOSEN,
      then: [{ say: [['An empty crate.', 'Straw and a', 'water bowl.']] }],
      else: [
        { say: [['The prize. Crated', 'and breathing.'], ['The contract says', 'take it.']] },
        {
          choice: {
            say: [['TAKE IT?', 'NO WAY BACK.']],
            yes: [
              { setFlag: 'ch8Poached' },
              { giveItem: 'PRIZE CRATE' },
              { sfx: 'pickup' },
              { sysMsg: ['GOT PRIZE CRATE!'] },
              { heat: 2 },
              { say: [['Somewhere a', 'whistle blows.', 'The park wakes.']] },
            ],
          },
        },
      ],
    },
  ],
  // the PEN LEVER — the BETRAYAL act
  'at:15,7': [
    {
      if: CHOSEN,
      then: [{ say: [['The lever is', 'locked off.']] }],
      else: [
        { say: [['Every pen on one', 'lever.'], ['Pull it and the', 'job is dead.']] },
        {
          choice: {
            say: [['PULL IT?', 'NO WAY BACK.']],
            yes: [
              { setFlag: 'ch8Freed' },
              { sfx: 'unlock' },
              ...OPEN_PENS,
              ...PEN_GATES.map(([x, y]): ScriptStep => ({ fx: { id: 'dust', at: [x, y] } })),
              { say: [['The gates swing', 'open.']] },
              // CH8-FB.3 (Lyall): the residents go in one screen — a puff each,
              // THEN the flag that hides them, so the puff lands on a body
              ...RESIDENTS.map(([x, y]): ScriptStep => ({ fx: { id: 'poof', at: [x, y] } })),
              { sfx: 'poof' },
              { setFlag: 'ch8PensEmpty' },
              { sysMsg: ['THE PENS ARE OPEN'] },
              { heat: 2 },
              { say: [['They run. All of', 'them. Then the', 'whistles start.']] },
            ],
          },
        },
      ],
    },
  ],
};
