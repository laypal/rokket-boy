// MOON DEPTHS — dialogue & interaction scripts (CH2.3). Jessika's EKANZZ
// gift scene: she likes creepy mons and found one worth handing off.
import type { ScriptStep } from '../../types';

export const moon2Scripts: Record<string, ScriptStep[]> = {
  'npc:jessika': [
    {
      if: { notFlag: 'gotEkanzz' },
      then: [
        {
          say: [
            ['JESSIKA: Ooh, a', 'creepy little', 'guy! For you.'],
            ['Found it in the', 'rubble. Cute,', 'right? Keep it.'],
          ],
        },
        { giveMon: { species: 'ekanzz', lv: 5 } },
        { sfx: 'item' },
        { setFlag: 'gotEkanzz' },
        { say: [['EKANZZ joined', "you! Don't tell", 'the boss, hm?']] },
      ],
      else: [{ say: [['JESSIKA: Treat', 'it well, okay?']] }],
    },
    // route hint — always shown, gift or not
    { say: [["Dig site's past", 'the tunnel south.']] },
  ],
};
