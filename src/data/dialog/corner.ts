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
  'npc:dealer': [
    { say: [['DEALER: Coins?', 'No coins here.', 'Never were. Heh.']] },
    {
      choice: {
        say: [['...But I run a', 'little game.', 'PICKPOCKET.'], ['30 COINS a hand.', 'Sit down?']],
        yes: [{ cardFlip: true }],
        no: [{ say: [['DEALER: Smart.', "That's how I'd", 'play it too.']] }],
      },
    },
  ],
  'npc:gambler': [
    {
      say: [
        ['GAMBLER: These', 'slots took my', 'last credit...'],
        ['...and my shoes.'],
        ['The hummin one', 'top right? Pays', 'in CANDY they say'],
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
  // SIDE.7-FB: the special machine — visibly flavoured so the player knows
  // which one to farm. 2-coin stake per spin. Shares slotSpins with the
  // ordinary `M` bank (spin jobs still count) but rolls its own seeded
  // prize table via varRoll: nested `if`s on the SAME spin number are ONE
  // weighted draw (varRoll(n,p) reuses n's uniform for every p), so the
  // ascending thresholds 0.04/0.10/0.25/0.55 slice a single roll into bands
  // — 4% candy / 6% +10 / 15% +5 / 30% +1 / 45% nothing, EV ~1.5 per 2 staked.
  // NOTE: addCoins does not clamp at 0 (script.ts) — safe here only because
  // this stake is gated behind coinsAtLeast 2 first, so coins is always >=2
  // when the -2 lands.
  'tile:Q': [
    {
      if: { coinsAtLeast: 2 },
      then: [
        { addCoins: -2 },
        { incVar: 'slotSpins' },
        { sfx: 'coin' },
        {
          if: { varRoll: ['slotSpins', 0.04] },
          then: [
            { giveItem: 'LEVEL CANDY' },
            { sfx: 'item' },
            {
              say: [
                ['* * *', 'JACKPOT!!', 'A LEVEL CANDY!'],
              ],
            },
            { sysMsg: ['CANDY IN PACK!', 'PARTY > LEFT', 'TO USE IT.'] },
          ],
          else: [
            {
              if: { varRoll: ['slotSpins', 0.10] },
              then: [
                { addCoins: 10 },
                { say: [['* $ $ $ *', 'TEN COINS!']] },
              ],
              else: [
                {
                  if: { varRoll: ['slotSpins', 0.25] },
                  then: [
                    { addCoins: 5 },
                    { say: [['* $ $ *', 'Five coins!']] },
                  ],
                  else: [
                    {
                      if: { varRoll: ['slotSpins', 0.55] },
                      then: [
                        { addCoins: 1 },
                        { say: [['* $ *', 'One coin. Heh.']] },
                      ],
                      else: [
                        {
                          sayCycle: {
                            counter: 'slotSpins',
                            dialogs: [
                              [['*hmmmm* ...', 'This one feels', 'different.']],
                              [['*clunk* ...', 'Almost.']],
                              [['*whirrr*', 'It hums louder.']],
                            ],
                          },
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
      else: [{ say: [['NEED 2 COINS.', 'The slot just', 'stares back.']] }],
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
