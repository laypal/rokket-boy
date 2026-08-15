// GAMEZ CORNER — dialogue & interaction scripts (ported from npcDialog/interact v2).
import type { ScriptStep } from '../../types';

export const cornerScripts: Record<string, ScriptStep[]> = {
  'npc:poster_guard': [
    {
      say: [
        ['GUARD: Hey! No', 'grunts allowed', 'near this wall!'],
        ['You want past?', 'Get past my', 'VOLTORBB first!'],
      ],
    },
    { battle: 'guard_voltorbb' },
  ],
  'npc:dealer': [{ say: [['DEALER: Coins?', 'No coins here.', 'Never were. Heh.']] }],
  'npc:gambler': [
    {
      say: [
        ['GAMBLER: These', 'slots took my', 'last credit...'],
        ['...and my shoes.'],
      ],
    },
  ],
  // poster hides the vault switch
  'tile:p': [
    {
      if: { notFlag: 'guardBeaten' },
      then: [{ say: [['A poster of a', 'grinning MYOWTH.', '...Suspicious.']] }],
      else: [
        {
          if: { notFlag: 'switchFound' },
          then: [
            { setFlag: 'switchFound' },
            { sfx: 'switch' },
            { setTile: [2, 2, '>'] },
            { addWarp: ['2,2', ['vault', 5, 5, 'up']] },
            {
              say: [
                ['There is a switch', 'behind the', 'poster!'],
                ['*CLUNK*', 'A stairway slid', 'open below!'],
              ],
            },
          ],
          else: [{ say: [['The switch has', 'been flipped.']] }],
        },
      ],
    },
  ],
  // slots — easter egg on persistence
  'tile:M': [
    { incVar: 'slotSpins' },
    { sfx: 'coin' },
    {
      if: { varEq: ['slotSpins', 10] },
      then: [
        {
          if: { notEgg: 'jackpot' },
          then: [
            { addEgg: 'jackpot' },
            { addCoins: 777 },
            {
              say: [
                ['7 7 7', 'JACKPOT!!', '+777 COINS!'],
                ['(The dealer is', 'glaring at you.)'],
              ],
            },
          ],
          else: [
            {
              sayCycle: {
                counter: 'slotSpins',
                dialogs: [
                  [['*whirrr* ...', 'Nothing.']],
                  [['*clunk* ...', 'So close!']],
                  [['*ka-chunk*', 'Two cherries!']],
                ],
              },
            },
          ],
        },
      ],
      else: [
        {
          sayCycle: {
            counter: 'slotSpins',
            dialogs: [
              [['*whirrr* ...', 'Nothing.']],
              [['*clunk* ...', 'So close!']],
              [['*ka-chunk*', 'Two cherries!']],
            ],
          },
        },
      ],
    },
  ],
  'tile:K': [{ say: [['COIN EXCHANGE', '-- CLOSED --']] }],
  'tile:P': [{ say: [['A plastic plant.', 'Even the plants', 'here are fake.']] }],
  // Reload repair (§4.6): script-driven map mutations don't survive a page
  // reload, so a loaded game re-applies the poster switch's stairs here —
  // otherwise the vault is unreachable forever. Steps must stay instant/pure
  // (setTile/addWarp only) since enter runs on EVERY entry.
  enter: [
    {
      if: { flag: 'switchFound' },
      then: [
        { setTile: [2, 2, '>'] },
        { addWarp: ['2,2', ['vault', 5, 5, 'up']] },
      ],
    },
  ],
};
