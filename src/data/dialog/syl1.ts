// SYLPHCO 1F — dialogue & interaction scripts (CH6.0 §7/§13). DJAMES, the
// inside man, teaches the ALARM rules from ON the lift pad (goneIf ch6Rules,
// so the script must be safe to run twice — the once-gated SMOKE BALL once
// flag holds); the receptionist points to him; the doorman fights once and
// stands aside. The card-key door 'd' at (10,7) guards the express lift.
import type { ScriptStep } from '../../types';
import { cardDoor, openDoors } from './sylph';

export const syl1Scripts: Record<string, ScriptStep[]> = {
  'npc:djames': [
    {
      say: [
        ['DJAMES: Psst.', "It's me. Don't", 'say the motto.'],
        ["I'm the inside", 'man. The floors', 'up have GUARDS.'],
        ['EYE CONTACT gets', 'you seen. Their', 'gaze sweeps.'],
        ['Seen once: ALARM', 'stage 1. Twice:', 'they chase you.'],
        ['Stage 3 is a', 'LOCKDOWN. 20 secs', 'to reach a pad.'],
        ['Caught? 10% of', 'your coins, and a', 'trip back to HQ.'],
        ['Crates and desks', 'block their gaze.', 'Hide behind them.'],
        ['Leaving a floor', 'clears its ALARM.', 'Pads are exits.'],
      ],
    },
    {
      if: { notFlag: 'ch6Smoke' },
      then: [
        { setFlag: 'ch6Smoke' },
        { giveItem: 'SMOKE BALL' },
        { sfx: 'item' },
        { say: [['A SMOKE BALL', 'drops the ALARM', 'one stage. Here.']] },
        { sysMsg: ['GOT SMOKE BALL!'] },
      ],
    },
    {
      say: [
        ['The CARD KEY is', 'filed in RECORDS', 'on 3F. Need it.'],
        ['BOSS BALL: top', 'office. Go get', 'rich, boss.'],
        ["I'll be in the", 'canteen. Not', 'here. Never here.'],
      ],
    },
    { setFlag: 'ch6Rules' },
    { sysMsg: ['RULES LEARNED!', 'THE PAD IS FREE.'] },
  ],
  'npc:reception': [
    { say: [['RECEPTION: Staff', 'only past here.', 'Lift pad: left.'], ['Talk to the man', 'ON the pad first.', 'Company policy.']] },
  ],
  'npc:doorman': [
    {
      if: { notFlag: 'sylDoorman' },
      then: [
        { say: [['DOORMAN: Staff', 'only past here.', 'You staff? No.']] },
        { battle: 'syl_doorman' },
      ],
      else: [{ say: [['DOORMAN: ...Go', 'on up. I saw', 'nothing.']] }],
    },
  ],
  'at:10,7': cardDoor(10, 7),
  enter: [openDoors([[10, 7]])],
};