// SAFARI ZOON GATE — dialogue & interaction scripts (CH8.0 §3/§7). The
// inside man teaches the ranger rules once (ch8Rules, "told, not
// discovered") and seeds the moral hook; the branch boss on the exit tile
// talks, then fights. Every line here is worker B's to polish
// (tests/ch8-contracts.test.ts pins the flags, not the words).
import type { ScriptStep } from '../../types';

export const safari1Scripts: Record<string, ScriptStep[]> = {
  'npc:insider': [
    {
      if: { flag: 'ch8Rules' },
      then: [{ say: [['Rangers sweep in', 'a circle. Move', 'when they turn.']] }],
      else: [
        {
          // no PASS, no park — Giovanni is always reachable, so no softlock
          if: { notFlag: 'ch8Briefed' },
          then: [{ say: [['MAN: No pass, no', 'park. Come back', 'with one.']] }],
          else: [
        {
          say: [
            ['MAN: Pass? Good.', "I'm the man", 'inside. Listen.'],
            ['RANGERS sweep in', 'a circle. Move', 'when they turn.'],
            ['Seen once, they', 'startle. Twice,', 'they hunt you.'],
            ['Three times and', 'the WARDEN locks', 'the whole park.'],
            ['The PENS are past', 'the park. The', 'prize is there.'],
            ["...It's a pup,", 'the prize. Just', 'saying.'],
          ],
        },
        { setFlag: 'ch8Rules' },
        { sfx: 'confirm' },
          ],
        },
      ],
    },
  ],
  'npc:warden': [
    { say: [['WARDEN: That', 'crate is a life.', 'Put it down.'], ['No? Then you go', 'through me.']] },
    { battle: 'safari_warden' },
  ],
  'npc:petrelle': [
    { say: [['PETRELLE: You', 'opened them. Do', 'you know what'], ['you are now?', "Let's find out."]] },
    { battle: 'safari_petrelle' },
  ],
};
