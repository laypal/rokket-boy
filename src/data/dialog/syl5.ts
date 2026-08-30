// SYLPHCO 5F — dialogue & interaction scripts (CH6.0 §4/§5/§13). The
// president's floor: an EXEC trainer, the HEAL PAD 'h' (asks first, §4), the
// card-key office door 'd' (7,7), and inside it the BOSS BALL chest '$'
// (9,8) — flanked by the BODYGUARD duo (guard_a == guard_b, the chained
// syl_guard1→syl_guard2 fight with no heal between). `at:9,8` is the steal
// set piece; `enter` repairs the chest on reload (the moonDig convention).
import type { ScriptStep } from '../../types';
import { cardDoor, openDoors } from './sylph';
import { RIDE_HOME } from '../encounters';

// CH6.0 §5: both bodyguards run the SAME script — define once, use twice.
const duo: ScriptStep[] = [
  {
    if: { notFlag: 'ch6Duo' },
    then: [
      { say: [['BODYGUARD: The', "president's busy.", 'Take a number.']] },
      { battle: 'syl_guard1' },
    ],
  },
];

export const syl5Scripts: Record<string, ScriptStep[]> = {
  'npc:exec': [
    {
      if: { notFlag: 'sylExec' },
      then: [
        { say: [['EXEC: You are', 'NOT on the', 'schedule.']] },
        { battle: 'syl_exec' },
      ],
      else: [{ say: [['EXEC: Reschedule.', 'Please.']] }],
    },
  ],
  'npc:guard_a': duo,
  'npc:guard_b': duo,
  'npc:president': [
    {
      if: { flag: 'ch6Ball' },
      then: [{ say: [['PRESIDENT: You', 'will REGRET this.', 'All of you.']] }],
      else: [{ say: [['PRESIDENT: Get', 'OUT of my office.', 'Guards!']] }],
    },
  ],
  'step:10,5': [
    { choice: { say: [['A HEAL PAD hums.', 'Rest here?']], yes: [{ healParty: true }, { sfx: 'item' }, { sysMsg: ['PARTY HEALED!'] }] } },
  ],
  'at:7,7': cardDoor(7, 7),
  'at:9,8': [
    {
      if: { flag: 'ch6Ball' },
      then: [{ say: [['The case is', 'empty. You', 'emptied it.']] }],
      else: [
        {
          if: { notFlag: 'ch6Duo' },
          then: [{ say: [['Two BODYGUARDS', 'stand between you', 'and the case.']] }],
          else: [
            { say: [['The BOSS BALL.', 'One prototype.', 'Catches anything.'], ['SYLPHCO spent a', 'fortune on it.', 'You spend a step.']] },
            { setTile: [9, 8, '%'] },
            { giveItem: 'BOSS BALL' },
            { setFlag: 'ch6Ball' },
            { sfx: 'item' },
            { sysMsg: ['BOSS BALL!', 'GET OUT.'] },
            RIDE_HOME,
          ],
        },
      ],
    },
  ],
  enter: [openDoors([[7, 7]]), { if: { flag: 'ch6Ball' }, then: [{ setTile: [9, 8, '%'] }] }],
};