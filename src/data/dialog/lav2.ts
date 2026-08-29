// LAVENDAR 2F — dialogue & interaction scripts (CH5.2). `stair_ghost` is the
// true gate up (goneIf: hasItem SILF SCOPE, in lav2.ts's map data) — this is
// its refusal line; `mourner_c` is the hint that sends the player after the
// SCOPE; `medium_a` is the once-only MEDIUM fight.
import type { ScriptStep } from '../../types';

export const lav2Scripts: Record<string, ScriptStep[]> = {
  'npc:stair_ghost': [
    { say: [['A shape in the', 'fog. You cannot', 'make it out.'], ["It won't move.", 'You need to SEE', 'it first.']] },
  ],
  'npc:mourner_c': [
    { say: [['MOURNER: Dropped', 'my SILF SCOPE in', 'the mist room.'], ['North of the gap.', "Keep it. I've no", 'use for it now.']] },
  ],
  'npc:medium_a': [
    {
      if: { notFlag: 'lavMedium1' },
      then: [
        { say: [["MEDIUM: She's...", 'in me. She wants', 'a FIGHT. Now!']] },
        { battle: 'lav_medium1' },
      ],
      else: [{ say: [['Still dazed...']] }],
    },
  ],
};
