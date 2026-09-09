// KANTOO POWER PLANT 1F — dialogue & interaction scripts (CH7.0 §7). MYOWTH
// steps out of the party beside the door and teaches the plant rules once
// (goneIf ch7Rules — the DJames pad gate; the puff is JCE.6's rule). The
// TECHNICIAN payday, the vent flavour and anything else on this floor are
// worker B's (.paul/PLAN.md), gated by tests/ch7-contracts.test.ts.
import type { ScriptStep } from '../../types';

export const plant1Scripts: Record<string, ScriptStep[]> = {
  'npc:myowth': [
    {
      say: [
        ['MYOWTH: Boss.', 'Quick word before', 'we go in.'],
        ['The ALARM here', 'NEVER sleeps.', 'Stage 1, always.'],
        ['Every TECH on', 'every floor is', 'looking. Hide.'],
        ['LIVE FLOOR bites', '1 HP a step. It', 'stops at 1 HP.'],
        ['RUBBER BOOTS are', 'on 1F, past the', 'first live strip.'],
        ['2F: the CELL', 'STORE. Some cells', 'are VOLTORBB.'],
        ['3F: the ENERGY', 'CELL. Grab it.', 'Then RUN.'],
        ['If something', 'with WINGS shows', 'up... you can'],
        ["run. Boss won't", "know. I won't", 'tell. Meow.'],
      ],
    },
    // JCE.6: the puff over HIS tile, then the sound, both before the flag
    { fx: { id: 'poof', at: [8, 10] } },
    { sfx: 'poof' },
    { setFlag: 'ch7Rules' },
    { sysMsg: ['RULES LEARNED!', 'MYOWTH IS BACK', 'IN THE PARTY.'] },
  ],
  // CH7.0 §6: the 1F TECHNICIAN payday, gated behind his own flag.
  'npc:tech1': [
    {
      if: { notFlag: 'plantTech1' },
      then: [
        { say: [["TECH: You're not", 'on the rota.']] },
        { battle: 'plantTech1' },
      ],
      else: [{ say: [['TECH: Rota says', 'go away.']] }],
    },
  ],
  // CH7.0 §7: the posted heatGuard's idle talk (contact starts plant_watch).
  'npc:watch1': [{ say: [['TECH: Eyes on the', 'gauges. Always.']] }],
};
