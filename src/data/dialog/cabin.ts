// CAPTAIN'S CABIN — dialogue & interaction scripts (CH4.2/4.3). The SAFE
// (`at:14,4`) is the chapter's centrepiece: cracking it sets ch4Safe and
// starts the ship's 5-minute lockdown. Doc 02: say BEFORE heat — the say
// steps run first, `{ heat: 3 }` is synchronous and the lockdown clock is
// already ticking the instant it fires, so nothing may follow it.
import type { ScriptStep } from '../../types';

export const cabinScripts: Record<string, ScriptStep[]> = {
  'npc:cabin_watch': [{ say: [['WATCH: No entry.']] }],
  'at:14,4': [
    {
      if: { flag: 'ch4Safe' },
      then: [{ say: [['The safe sits', 'open. Nothing', 'left inside.']] }],
      else: [
        {
          say: [
            ['A dial lock.', 'Easy money for', 'a professional.'],
            ['CLICK. Stacks of', 'coins inside.', 'Grab it all!'],
          ],
        },
        { setFlag: 'ch4Safe' },
        { sfx: 'alarm' },
        { sysMsg: ['ALARM! 5 MIN', 'GET TO THE DOCK'] },
        { heat: 3 },
      ],
    },
  ],
};
