// KANTOO POWER PLANT 2F — dialogue & interaction scripts (CH7.0 §3/§6). Four
// of the twelve 'e' cells are the frozen mines (dialog/plant.ts mine(n)),
// keyed by their exact grid coords; every other 'e' is silent flavour.
import type { ScriptStep } from '../../types';
import { mine } from './plant';

export const plant2Scripts: Record<string, ScriptStep[]> = {
  'step:9,4': mine(1),
  'step:12,5': mine(2),
  'step:15,4': mine(3),
  'step:11,6': mine(4),
  // CH7.0 §6: the 2F TECHNICIAN payday, gated behind his own flag.
  'npc:tech2': [
    {
      if: { notFlag: 'plantTech2' },
      then: [
        { say: [["TECH: You're not", 'on the rota.']] },
        { battle: 'plantTech2' },
      ],
      else: [{ say: [['TECH: Rota says', 'go away.']] }],
    },
  ],
  // CH7.0 §7: the posted heatGuard's idle talk (contact starts plant_watch).
  'npc:watch2': [{ say: [['TECH: Eyes on the', 'gauges. Always.']] }],
};
