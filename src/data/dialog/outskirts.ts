// CERULEUN EDGE — dialogue & interaction scripts (CH3.2). Just the shill's
// chatter; the PRIZE BRIDGE sign itself lives in the map's `signs` table.
import type { ScriptStep } from '../../types';

export const outskirtsScripts: Record<string, ScriptStep[]> = {
  'npc:shill': [
    {
      say: [
        ['GRUNT: Cross the', 'SPAN, win big!', '(Wink wink.)'],
        ['Everyone wins*', '(*results vary)'],
      ],
    },
  ],
  // SIDE.3 map secret — the river at (3,4)/(17,4) is the only water a player
  // can face on the whole route (NUGGET SPAN's lane is railed on both sides),
  // so the `swim` egg lives here. `tile:w` fires for either tile.
  'tile:w': [
    {
      if: { notEgg: 'swim' },
      then: [
        { addEgg: 'swim' },
        { sfx: 'item' },
        { say: [['You consider a', 'swim. You', 'reconsider.']] },
        { sysMsg: ['EGG FOUND!'] },
      ],
      else: [{ say: [['Still cold.', 'Still no.']] }],
    },
  ],
};
