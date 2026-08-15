// HIDDEN VAULT — interaction scripts (ported from interact() v2).
import type { ScriptStep } from '../../types';

export const vaultScripts: Record<string, ScriptStep[]> = {
  // the chest heist beat: loot, alarm, leg it
  'tile:$': [
    { setTile: [5, 3, '%'] },
    { setFlag: 'lootTaken' },
    { giveItem: 'CASE OF COINS' },
    { addCoins: 9999 },
    { sfx: 'item' },
    {
      say: [
        ['Got the CASE', 'OF COINS!'],
        ['*WEE-OO WEE-OO*', 'The alarm!', 'LEG IT!!'],
      ],
    },
    { sfx: 'alarm' },
  ],
  'tile:%': [{ say: [['Empty. You saw', 'to that.']] }],
  'tile:V': [{ say: [['A colossal vault', 'door. Sealed for', 'years... until']] }],
  'tile:X': [{ say: [['Crates of...', 'you would rather', 'not know.']] }],
  // Reload repair (§4.6): the emptied chest must stay empty after a save
  // reload or the $ tile pays out again. Instant/pure — enter runs every entry.
  enter: [{ if: { flag: 'lootTaken' }, then: [{ setTile: [5, 3, '%'] }] }],
};
