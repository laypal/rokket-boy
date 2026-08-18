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
  // SIDE.3 map secrets — two wall cells on the left/right border, well off
  // the chapter1.spec.ts walked set ({5,4}/{5,5}/{5,6}, the chest-and-back
  // column). `at:` shadows the generic `tile:#` (there isn't one), so these
  // fire on their exact border cell only.
  'at:0,2': [
    {
      if: { notEgg: 'vaultbrick' },
      then: [
        { addEgg: 'vaultbrick' },
        { sfx: 'item' },
        { say: [['A brick, slightly', 'loose. Something', 'dumb hides here.']] },
        { sysMsg: ['EGG FOUND!'] },
      ],
      else: [{ say: [['Still loose.']] }],
    },
  ],
  'at:11,4': [
    {
      if: { notEgg: 'vaultwall' },
      then: [
        { addEgg: 'vaultwall' },
        { sfx: 'item' },
        { say: [['Scratched into', 'the wall: "GIO IS', 'A SOFTIE." Bold.']] },
        { sysMsg: ['EGG FOUND!'] },
      ],
      else: [{ say: [['Still there.']] }],
    },
  ],
  // Reload repair (§4.6): the emptied chest must stay empty after a save
  // reload or the $ tile pays out again. Instant/pure — enter runs every entry.
  enter: [{ if: { flag: 'lootTaken' }, then: [{ setTile: [5, 3, '%'] }] }],
};
