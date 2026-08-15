// Battle encounters. Phase 1b: foes are species references (plan §4.1) —
// the player side comes from the party in game state.
import type { EncounterDef } from '../types';

export const ENCOUNTERS: Record<string, EncounterDef> = {
  guard_voltorbb: {
    trainer: 'GUARD',
    foe: { species: 'voltorbb', lv: 4 },
    winText: ['GUARD: Fine!', 'FINE! Go on', 'then...'],
    onWin: [
      { setFlag: 'guardBeaten' },
      // v2 truncated 'The guard shuffles' to 17 chars at runtime; kept verbatim
      { say: [['The guard shuffle', 'away from the', 'poster wall...']] },
    ],
    onLose: [], // whiteout handled by the battle engine (last HQ, minus 10% coins)
    onFlee: [],
  },
  // CH2.4 — rival grunt BRAD ambushes over the fossils at the dig site.
  // goneIf(bradBeaten) on his NPC makes the storm-off line literal.
  brad_ratikatt: {
    trainer: 'BRAD',
    foe: { species: 'ratikatt', lv: 6 },
    winText: ['BRAD: Tch!', 'Keep your dusty', 'rocks then!'],
    onWin: [
      { setFlag: 'bradBeaten' },
      { say: [['BRAD storms off', 'into the dark.']] },
    ],
    onLose: [],
    // CH2.7: fleeing loops straight back into the fight — his mon resets,
    // yours keeps its damage, so running is strictly worse. Inescapable by
    // data, no engine change.
    onFlee: [
      { say: [['BRAD: Running', "won't save the", 'fossils!']] },
      { battle: 'brad_ratikatt' },
    ],
  },
  // ── SIDE.5 HQ training drills ──────────────────────────────────────────
  // Both are spar battles: losing skips the whiteout entirely (battle.ts
  // training exemption — no coin loss, no warp, party patched up), so they
  // are safe to fail by contract. Rewards pay once via drill flags; the
  // drills themselves stay repeatable. XP flows from the normal win path.
  spar_jessika: {
    trainer: 'JESSIKA',
    spar: true,
    foe: { species: 'ekanzz', lv: 5 },
    winText: ['JESSIKA: Not', 'bad, rookie!'],
    onWin: [
      {
        if: { notFlag: 'drillBattleDone' },
        then: [
          { setFlag: 'drillBattleDone' },
          { addCoins: 100 },
          { sfx: 'item' },
          { say: [['JESSIKA: First', 'win pays. Here,', '100 coins.']] },
          { sysMsg: ['GOT 100 COINS!'] },
        ],
        else: [{ say: [['JESSIKA: Sharp!', 'Same time', 'tomorrow?']] }],
      },
    ],
    onLose: [{ say: [['JESSIKA: Again', 'sometime! Drills', 'cost nothing.']] }],
    onFlee: [{ say: [['JESSIKA: Smart!', 'LEG IT works', 'in drills too.']] }],
  },
  // The stealth-course guard (hqDrill's heatGuard). Contact starts this
  // instead of a punishment fight; win or lose, the run continues.
  drill_guard: {
    trainer: 'DRILL GUARD',
    spar: true,
    foe: { species: 'voltorbb', lv: 4 },
    winText: ['GUARD: Good', 'hustle!'],
    onWin: [{ say: [['GUARD: Ha! Fair', 'cop. As you', 'were, sneak.']] }],
    onLose: [{ say: [['GUARD: Sloppy!', 'Watch my gaze', 'next time.']] }],
    onFlee: [{ say: [['GUARD: Running', 'IS sneaking...', 'ish. Go on.']] }],
  },
};
