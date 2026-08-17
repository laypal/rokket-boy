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
};
