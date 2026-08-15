// MT. MOON (upper cavern) — dialogue & interaction scripts (CH2.3).
// Myowth delivers the SWIPE tutorial here, fourth wall fully intact.
import type { ScriptStep } from '../../types';

export const moon1Scripts: Record<string, ScriptStep[]> = {
  'npc:myowth': [
    {
      say: [
        ['MYOWTH: Psst!', 'New kid! Wild', 'mons lurk here.'],
        ['SWIPE in a wild', 'fight throws a', 'ROKKET BALL.'],
        ['No BALLS in your', 'PACK? No catch.', 'Shop up first.'],
        ['(Fourth wall? I', 'live here, pal.)'],
      ],
    },
    // route hint — a separate page so it always reads as its own beat
    { say: [["Dig site's south", 'past the tunnel.']] },
  ],
  // CH2.4 — the canonical first shop: a grunt wheeled the stall into the
  // cave. Same ScriptStep shop contract as the HQ stall.
  'npc:vendor': [
    { say: [['GRUNT: Balls,', 'sodas. Cave', 'prices, sorry.']] },
    { shop: 'moonCart' },
  ],
};
