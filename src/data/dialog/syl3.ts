// SYLPHCO 3F — dialogue & interaction scripts (CH6). RECORDS, a battle floor:
// two once-only CLERK trainers guarding the RECORDS south-east (the CARD KEY
// pickup at 15,8, behind clerk_b's alcove). No doors on this floor.
import type { ScriptStep } from '../../types';

export const syl3Scripts: Record<string, ScriptStep[]> = {
  'npc:clerk_a': [
    {
      if: { notFlag: 'sylClerkA' },
      then: [
        { say: [['CLERK: Records', 'are CONFIDENTIAL.', 'Who let you in?']] },
        { battle: 'syl_clerk1' },
      ],
      else: [{ say: [['CLERK: Filing.', "Don't mind me."]] }],
    },
  ],
  'npc:clerk_b': [
    {
      if: { notFlag: 'sylClerkB' },
      then: [
        { say: [['CLERK: The key', 'cabinet is behind', 'me. So. No.']] },
        { battle: 'syl_clerk2' },
      ],
      else: [{ say: [['CLERK: Take it.', 'Take everything.']] }],
    },
  ],
};