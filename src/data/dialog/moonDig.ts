// DIG SITE — dialogue & interaction scripts (CH2.3). The fossil-chest set
// piece: this is what CH2's mission steals.
import type { ScriptStep } from '../../types';

export const moonDigScripts: Record<string, ScriptStep[]> = {
  'at:8,4': [
    {
      if: { notFlag: 'fossilsTaken' },
      then: [
        {
          say: [
            ['Two fossils, just', 'like the boss', 'said. Jackpot!'],
            ["Wrap 'em quick --", 'scientists could', 'be back any sec.'],
          ],
        },
        { sfx: 'item' },
        { setFlag: 'fossilsTaken' },
        { setTile: [8, 4, '%'] },
        { say: [['Fossils secured!', 'Time to move.']] },
        // CH2.7 — the moment you hold them, BRAD notices and RUNS you down.
        // No walking around this fight; onFlee loops back into it too.
        { sfx: 'beep' },
        { npcRun: { id: 'brad' } },
        { say: [['BRAD: HEY!', 'Those are MY', 'fossils!'], ['Hand them over', 'or lose them!']] },
        { battle: 'brad_ratikatt' },
      ],
      else: [{ say: [['Just dust now.', 'You already took', 'the fossils.']] }],
    },
  ],
  // CH2.4/2.7 — BRAD guards the chest's south face. Before the fossils are
  // taken he only postures; the AMBUSH (chest script + enter re-ambush)
  // owns the fight, but talking to him post-fossils still battles — the
  // belt-and-braces retry path. goneIf(bradBeaten) once he's down.
  'npc:brad': [
    {
      if: { flag: 'fossilsTaken' },
      then: [
        { say: [['BRAD: Those are', 'MY fossils,', 'errand boy!'], ['Hand them over', 'or lose them!']] },
        { battle: 'brad_ratikatt' },
      ],
      else: [{ say: [['BRAD: Beat it.', "I'm about to be", 'RICH, kid.']] }],
    },
  ],
  // Reload repair (§4.6): the emptied chest must stay empty after a save
  // reload or the $ tile pays out again. Instant/pure — enter runs every
  // entry. CH2.7: arriving with the fossils and BRAD unbeaten (you lost and
  // came back) re-triggers the ambush — the fight is inescapable across
  // sessions, not just in the moment.
  enter: [
    {
      if: { flag: 'fossilsTaken' },
      then: [
        { setTile: [8, 4, '%'] },
        {
          if: { notFlag: 'bradBeaten' },
          then: [
            { sfx: 'beep' },
            { npcRun: { id: 'brad' } },
            { say: [['BRAD: Not done', 'with you yet!']] },
            { battle: 'brad_ratikatt' },
          ],
        },
      ],
    },
  ],
};
