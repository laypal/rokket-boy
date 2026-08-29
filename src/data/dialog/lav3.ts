// LAVENDAR 3F — dialogue & interaction scripts (CH5.2/5.3). `mourner_d` is
// the CHARM hint; `medium_b` the second once-only MEDIUM fight; the spirit
// ambush sits on both `step:` approach tiles (belt and braces — CH5.0 §12);
// the altar (`at:2,1`) is the chapter's set piece: mask off the altar, then
// the conscience scene that recruits MYOWTH (doc 02 order — npcRun AFTER
// setFlag ch5Mask, his goneIf reads it), then the ride home (FLW.4).
import type { ScriptStep } from '../../types';
import { RIDE_HOME } from '../encounters';

export const lav3Scripts: Record<string, ScriptStep[]> = {
  'npc:mourner_d': [
    { say: [['MOURNER: The', "CHARM's by the", 'graves, east end.'], ['She wants it', "back. Don't take", 'the mask.']] },
  ],
  'npc:medium_b': [
    {
      if: { notFlag: 'lavMedium2' },
      then: [
        { say: [['MEDIUM: The mask.', "She won't let go.", 'FIGHT me. Please.']] },
        { battle: 'lav_medium2' },
      ],
      else: [{ say: [['Still dazed...']] }],
    },
  ],
  // belt and braces: the spirit fires from either approach tile, CH5.0 §12
  'step:6,1': [
    {
      if: { notFlag: 'ch5Spirit' },
      then: [
        { say: [['A shape in the', 'mist. A bone', 'mask. It is HER.'], ['The mother. The', 'one whose skull', 'this mask was.']] },
        { battle: 'lav_spirit' },
      ],
    },
  ],
  'step:6,2': [
    {
      if: { notFlag: 'ch5Spirit' },
      then: [
        { say: [['A shape in the', 'mist. A bone', 'mask. It is HER.'], ['The mother. The', 'one whose skull', 'this mask was.']] },
        { battle: 'lav_spirit' },
      ],
    },
  ],
  'at:2,1': [
    {
      if: { flag: 'ch5Mask' },
      then: [{ say: [['The altar is', 'bare. You already', 'took it.']] }],
      else: [
        // CH5-FB (Lyall, 2026-08-29): the spirit is a step trigger, not a
        // wall — a clean loss let you walk on and lift the mask with her
        // never calmed, and her trigger still armed on the way back. The
        // altar refuses until ch5Spirit; the CHARM is the only way through.
        {
          if: { notFlag: 'ch5Spirit' },
          then: [{ say: [["She's still here.", 'The mask will', 'not come free.'], ['A whisper: the', 'CHARM. Bring her', 'the CHARM.']] }],
          else: [
        {
          say: [
            ['The BONE MASK.', 'White as old', 'chalk. Priceless.'],
            ["It has a child's", 'face carved into', 'it. You take it.'],
          ],
        },
        { setTile: [2, 1, '%'] },
        { giveItem: 'BONE MASK' },
        { setFlag: 'ch5Mask' },
        { sfx: 'item' },
        { sysMsg: ['BONE MASK!', 'GET OUT.'] },
        { npcRun: { id: 'myowth' } },
        {
          say: [
            ['MYOWTH: I... I', 'followed you up', 'here, boss.'],
            ['I saw them.', 'The mourners.', 'Down there.'],
            ["This one's", 'different, boss.', "I can't laugh."],
            ["I'm coming with", 'you. Someone has', 'to keep count.'],
          ],
        },
        // Branch BEFORE the grant: giveMon routes party-or-box silently, and
        // the line has to tell the truth about where he landed (playtester,
        // 2026-08-29 — the old unconditional "I'm in the LOCKER" read as a
        // lie whenever he'd actually joined).
        {
          if: { partyFull: true },
          then: [
            { giveMon: { species: 'myowth', lv: 18 } },
            { sfx: 'item' },
            { setFlag: 'ch5Myowth' },
            // CH5-FB (Lyall, 2026-08-29): a full crew shouldn't mean a walk
            // back to HQ to fetch him — offer the MON LOCKER right here (the
            // same screen as the HQ terminal; it swaps party <-> box), so the
            // player picks who sits out and fights with Myowth straight away.
            {
              choice: {
                say: [["MYOWTH: Crew's", "full, so I'm in", 'the LOCKER.'], ['Swap someone out', 'for me now?']],
                yes: [{ say: [["Don't ask how it", 'works up here.']] }, { locker: true }],
                no: [{ say: [['Fine. Fetch me', 'from HQ then.']] }],
              },
            },
          ],
          else: [
            { giveMon: { species: 'myowth', lv: 18 } },
            { sfx: 'item' },
            { setFlag: 'ch5Myowth' },
            { say: [['MYOWTH joined!', "Don't get used", 'to it, boss.']] },
          ],
        },
        RIDE_HOME,
          ],
        },
      ],
    },
  ],
  // reload repair (§4.6): the emptied altar must stay empty after a save
  // reload, the moonDig $-chest convention.
  enter: [
    {
      if: { flag: 'ch5Mask' },
      then: [{ setTile: [2, 1, '%'] }],
    },
  ],
};
