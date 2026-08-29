// ANN DOCK — dialogue & interaction scripts (CH4.2). Jessika hands over the
// SAILOR SUIT here (the hint NPC for the whole ship, no-softlock rule); the
// CHIEF blocks the gangway once the safe is cracked; the drunk deckhand
// points at the cabin — the second hint NPC (the safe itself has no other
// clue on the ship).
import type { ScriptStep } from '../../types';

export const dockScripts: Record<string, ScriptStep[]> = {
  'npc:jessika': [
    {
      if: { flag: 'ch4Suit' },
      then: [{ say: [['JESSIKA: Suit', 'still fits? Good.', 'Get to it.']] }],
      else: [
        {
          say: [
            ['JESSIKA: Psst.', 'Borrowed you a', 'SAILOR SUIT.'],
            ['SELECT: wear it', 'or take it off.', 'Blend in, dummy.'],
            ["Don't RUN in it.", 'Sailors never', 'sprint. Walk it.'],
          ],
        },
        { setFlag: 'ch4Suit' },
        { sfx: 'item' },
        { sysMsg: ['SAILOR SUIT!', 'SELECT: WEAR IT'] },
      ],
    },
  ],
  'npc:chief': [
    { say: [['CHIEF: Nice', 'uniform. Empty', 'those pockets.']] },
    { battle: 'ss_chief1' },
  ],
  'npc:sailor_dock': [
    { say: [['DECKHAND: *hic*', "Cap'n's safe is", 'in his cabin.']] },
    { say: [['Aft door off the', 'main deck. Not', 'that I told you.']] },
  ],
};
