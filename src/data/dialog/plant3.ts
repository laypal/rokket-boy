// KANTOO POWER PLANT 3F — dialogue & interaction scripts (CH7.0 §5/§6). The
// CELL chest, its enter repair, the VOLTRAWK dive and the TECHNICIAN payday.
import type { ScriptStep } from '../../types';

export const plant3Scripts: Record<string, ScriptStep[]> = {
  // CH7.0 §6: the 3F TECHNICIAN payday, gated behind his own flag.
  'npc:tech3': [
    {
      if: { notFlag: 'plantTech3' },
      then: [
        { say: [["TECH: You're not", 'on the rota.']] },
        { battle: 'plantTech3' },
      ],
      else: [{ say: [['TECH: Rota says', 'go away.']] }],
    },
  ],
  // CH7.0 §7: the posted heatGuard's idle talk (contact starts plant_watch).
  'npc:watch3': [{ say: [['TECH: Eyes on the', 'gauges. Always.']] }],
  // CH7.0 §5: the ENERGY CELL chest — the lights die, the plant goes quiet,
  // VOLTRAWK wakes (the dive below only fires once ch7Cell is set).
  'at:18,2': [
    {
      if: { flag: 'ch7Cell' },
      then: [{ say: [['The housing is', 'empty. The plant', 'is dark.']] }],
      else: [
        { say: [['The ENERGY CELL.', 'It hums. The', 'whole hall hums.'], ['You pull. The', 'hum stops.']] },
        { fx: { id: 'flash' } }, // Lyall (2026-09-09): every light in the plant at once — a ~1 s full-screen white-out
        { fx: { id: 'spark', at: [18, 2] } },
        { fx: { id: 'spark', at: [15, 2] } },
        { fx: { id: 'spark', at: [12, 2] } },
        { sfx: 'alarm' },
        { setTile: [18, 2, '%'] },
        { giveItem: 'ENERGY CELL' },
        { setFlag: 'ch7Cell' },
        { sysMsg: ['THE LIGHTS DIE.', 'GET OUT.'] },
      ],
    },
  ],
  // The moonDig/syl5 repair convention: a reload after the CELL is out finds
  // the housing already empty.
  enter: [{ if: { flag: 'ch7Cell' }, then: [{ setTile: [18, 2, '%'] }] }],
  // CH7.0 §5: the one corridor tile between the hall and the stairs pocket —
  // fires the VOLTRAWK dive once the CELL is out and no outcome flag is set
  // yet. A whiteout records nothing, so it fires again on the next crossing.
  'step:7,8': [
    {
      if: {
        all: [
          { flag: 'ch7Cell' },
          { notFlag: 'ch7Caught' },
          { notFlag: 'ch7Beaten' },
          { notFlag: 'ch7Fled' },
        ],
      },
      then: [
        { say: [['A SHRIEK from', 'the rafters.', 'Something dives.']] },
        { battle: 'plant_voltrawk' },
      ],
    },
  ],
};
