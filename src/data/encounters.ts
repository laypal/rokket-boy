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
  // ── CH3 Nugget Span ─────────────────────────────────────────────────────
  // Rokket's fake "PRIZE BRIDGE": five marks paid entry, the player is the
  // house. Each mark's script fires { battle: id } behind { notFlag } (the
  // other worker's bridge/outskirts scripts); the mark's onWin sets ITS OWN
  // flag and pays a fixed, un-rank-scaled coin sum (addCoins is raw by
  // contract — RNK.0's steal perk is SWIPE-only, jobs perk is hand-in only).
  // onLose/onFlee are [] on purpose: a whiteout or flee cannot pay, and the
  // flag guard (not the payout step) is what stops a re-run from paying
  // twice. Marks are earnest contestants who thought it was a real prize
  // bridge — sly, self-aware, never cruel (plan §5.4 tone bible).
  span_camper: {
    trainer: 'CAMPER',
    foe: { species: 'ratikatt', lv: 7 },
    winText: ['CAMPER: Whoa!', "Didn't think", 'the house wins.'],
    onWin: [
      { setFlag: 'spanCamper' },
      { addCoins: 40 },
      { sfx: 'item' },
      { sysMsg: ['GOT 40 COINS!'] },
      { say: [['The camper packs', 'up, muttering', 'about the odds.']] },
    ],
    onLose: [],
    onFlee: [],
  },
  span_picnicker: {
    trainer: 'PICNICKER',
    foe: { species: 'zubatt', lv: 8 },
    winText: ['PICNICKER: Oh!', 'Well fought.', 'Take the pot.'],
    onWin: [
      { setFlag: 'spanPicnicker' },
      { addCoins: 50 },
      { sfx: 'item' },
      { sysMsg: ['GOT 50 COINS!'] },
      { say: [['She folds up her', 'basket, still', 'smiling, though.']] },
    ],
    onLose: [],
    onFlee: [],
  },
  span_hiker: {
    trainer: 'HIKER',
    foe: { species: 'geodood', lv: 9 },
    winText: ['HIKER: Ha! Beat', 'by a rookie.', "Fair's fair."],
    onWin: [
      { setFlag: 'spanHiker' },
      { addCoins: 60 },
      { sfx: 'item' },
      { sysMsg: ['GOT 60 COINS!'] },
      { say: [['The hiker shrugs', 'off the loss and', 'trudges onward.']] },
    ],
    onLose: [],
    onFlee: [],
  },
  span_youngster: {
    trainer: 'YOUNGSTER',
    foe: { species: 'ekanzz', lv: 10 },
    winText: ['YOUNGSTER: No', 'way! I trained', 'for weeks!'],
    onWin: [
      { setFlag: 'spanYoungster' },
      { addCoins: 80 },
      { sfx: 'item' },
      { sysMsg: ['GOT 80 COINS!'] },
      { say: [['The youngster', 'storms off mad,', 'kicking planks.']] },
    ],
    onLose: [],
    onFlee: [],
  },
  span_lass: {
    trainer: 'LASS',
    foe: { species: 'voltorbb', lv: 11 },
    winText: ['LASS: Hmph! You', 'got lucky, is', 'all. Take it.'],
    onWin: [
      { setFlag: 'spanLass' },
      { addCoins: 100 },
      { sfx: 'item' },
      { sysMsg: ['GOT 100 COINS!'] },
      { say: [['The lass flounces', 'off the bridge,', 'nose in the air.']] },
    ],
    onLose: [],
    onFlee: [],
  },
  // AGENT KIRA runs the span and, once all five marks are beaten, tests the
  // player's loyalty herself. Winning promotes on the spot — she is the
  // recruiter, so rankUp fires here directly (no report-to-boss step this
  // chapter, unlike CH2.4's hand-in). rankUp BEFORE endScreen (the 1e rule);
  // the encounter carries no addCoins of its own — rankUp pays the OPERATIVE
  // reward from rankRewards.ts.
  span_kira: {
    trainer: 'AGENT KIRA',
    foe: { species: 'arbok', lv: 12 },
    winText: ['KIRA: ...Good.', 'That was the', 'test. You pass.'],
    onWin: [
      { setFlag: 'ch3Done' },
      { say: [['KIRA: The boss', 'wants loyalty', 'that bites back.'], ['Welcome up a', 'rung, OPERATIVE.', "Don't waste it."]] },
      { music: 'victory' },
      { rankUp: true },
      { endScreen: true },
    ],
    onLose: [],
    onFlee: [{ say: [['KIRA: Cold feet?', 'The span will', "wait. I won't."]] }],
  },
};
