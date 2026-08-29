// LAVENDAR 1F — dialogue & interaction scripts (CH5.2). Two mourners, no
// gates on this floor — the tone bible's turn (plan §5.4): grieving people,
// and the player is here to rob a grave. Both are say-only.
import type { ScriptStep } from '../../types';

export const lav1Scripts: Record<string, ScriptStep[]> = {
  'npc:mourner_a': [
    { say: [["MOURNER: My kid's", 'MON went up here.', 'Never came back.']] },
    { say: [['I still hear it', 'cry. Somewhere', 'up there. Still.']] },
  ],
  'npc:mourner_b': [
    { say: [['MOURNER: The', 'tower keeps what', 'the tower keeps.']] },
    { say: [['Stairs are east.', 'Go on, then.', 'If you must.']] },
  ],
};
