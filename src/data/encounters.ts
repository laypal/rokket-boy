// Battle encounters. Phase 1b: foes are species references (plan §4.1) —
// the player side comes from the party in game state.
import type { EncounterDef, ScriptStep } from '../types';

// FLW.4: "ride back to HQ, or walk?" — one step, reused at every chapter-closing
// onWin so it reads as a system feature, not an NPC's line. Ordering rule wherever
// it's used: LAST in onWin, after `{ rankUp }` and BEFORE `{ endScreen }` —
// endScreen doesn't suspend the script and a choice does (openChoice sets
// G.state='dialog'), so a choice after it would clobber MISSION COMPLETE before
// it drew. `no` is omitted: script.ts only pushes a branch `if (branch)`, so
// declining falls through to the world. Warp cell = the GAMEZ CORNER stairs'
// landing (corner.ts), so ride and walk arrive identically. CH1 is excluded on
// purpose: the HEAT escape IS the chapter and the hand-in is already at HQ.
// CH5.2: exported so lav3's altar script (dialog/lav3.ts) can reuse it — the
// only chapter-closing choice that fires from map data instead of an
// ENCOUNTERS onWin (the mask hand-in happens back at HQ, not on the fight).
export const RIDE_HOME: ScriptStep = {
  choice: {
    say: [['Job done. Head', 'back to HQ now?']],
    yes: [{ warp: ['hq', 9, 12, 'up'] }],
  },
};

export const ENCOUNTERS: Record<string, EncounterDef> = {
  // FLW.4: no RIDE_HOME here — see the note on RIDE_HOME above.
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
      RIDE_HOME, // FLW.4: no rankUp/endScreen here — the hand-in is at HQ
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
    // ONB.5-FB: CHOMP, not the lv5 learnset's WRAP. Measured over 200 seeded
    // runs: WRAP (power 25) into KOFFINK's def 95 does ~2 damage a turn, so
    // the player never dropped below 13/19 and the `lowHp` beat fired 0% of
    // the time — a coaching line that could not physically happen. CHOMP puts
    // the floor at ~8/19 and lowHp at ~12%, keeping the win rate at 98%.
    // Level stays 5 ON PURPOSE: raising it was the obvious fix, but xp scales
    // with the foe's level and would have pushed the starter to lv7, undoing
    // ONB.1's tuning that the first win dings to exactly L6. Its 0.85 accuracy
    // also buys the occasional whiff Lyall asked for (Lyall, 2026-08-22).
    foe: { species: 'ekanzz', lv: 5, moves: ['chomp'] },
    // ONB.5: mid-battle coaching. No speaker tag — mid-battle text never
    // carries one (foeLabel already names the trainer on their own move
    // lines); winText's "JESSIKA:" prefix below is a different context (the
    // battle-end concession card), not the convention in here.
    coach: [
      { on: 'firstTurn', say: ['Relax, rookie.', 'Lose this and', 'nothing happens.'] },
      { on: 'playerHurt', unless: 'itemUsed', say: ['Stung, huh? Hit', 'ITEM. That SODA', "won't use itself."] },
      { on: 'itemUsed', unless: 'swiped', say: ['Good. Now SWIPE', "me while I'm", 'distracted.'] },
      { on: 'lowHp', unless: 'itemUsed', say: ["You're nearly", 'out! ITEM. NOW.', "Don't be a hero."] },
    ],
    // ONB.5-FB: the same gate the SODA hand-over sits behind (hq.ts). The
    // two MUST agree — a rematch hands over no SODA, so coaching that names
    // one there is a lie, which is the whole failure this card exists to
    // avoid. Lose the first spar and the flag stays clear: fresh SODA, and
    // the lesson runs again, which is right.
    coachIf: { notFlag: 'drillBattleDone' },
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
      RIDE_HOME, // FLW.4: after rankUp, before endScreen — see the ordering comment above
      { endScreen: true },
    ],
    onLose: [],
    onFlee: [{ say: [['KIRA: Cold feet?', 'The span will', "wait. I won't."]] }],
  },
  // ── CH4 S.S. ANN ────────────────────────────────────────────────────────
  // Posted watch guards (heatGuard contact, not a scripted ambush): a delay,
  // not a payday — onWin/onLose are both empty by CH4.0 §1b's design (the
  // gala is never "calm", so these fights are the cost of being spotted, not
  // a reward). The chief is the real gate: a chained 2-mon boss like BRAD's
  // onFlee, ratikate then arbok, winning the gangway back for the escape.
  ship_watch: {
    trainer: 'SHIP WATCH',
    foe: { species: 'golbatt', lv: 13 },
    winText: ['WATCH: Ugh...', 'caught me', 'napping.'],
    onWin: [],
    onLose: [],
    onFlee: [],
  },
  ship_hold: {
    trainer: 'HOLD WATCH',
    foe: { species: 'gravlr', lv: 13 },
    winText: ['WATCH: Fine,', 'go on then.', 'Nothing to see.'],
    onWin: [],
    onLose: [],
    onFlee: [],
  },
  ss_chief1: {
    trainer: 'SECURITY CHIEF',
    foe: { species: 'ratikate', lv: 15 },
    winText: ['CHIEF: Hah!', '...that was the', 'warm-up.'],
    onWin: [{ battle: 'ss_chief2' }],
    onLose: [],
    onFlee: [{ say: [['CHIEF: Run. Fine.', "I'll be waiting."]] }],
  },
  ss_chief2: {
    trainer: 'SECURITY CHIEF',
    foe: { species: 'arbok', lv: 16 },
    winText: ['CHIEF: ...Get', 'out of my sight.'],
    onWin: [
      { setFlag: 'ch4Done' },
      {
        say: [
          ['CHIEF: ...Fine.', 'Go. Before I', 'change my mind.'],
          ['A radio crackle:', 'LIEUTENANT,', 'confirmed.'],
        ],
      },
      { music: 'victory' },
      { rankUp: true },
      RIDE_HOME, // FLW.4: after rankUp, before endScreen — see the ordering comment above
      { endScreen: true },
    ],
    onLose: [],
    onFlee: [{ say: [['CHIEF: Coward.', "I'm not chasing."]] }],
  },
  // ── CH5 LAVENDAR TOWER ──────────────────────────────────────────────────
  // The two MEDIUMs are once-only side fights (own flags, own coin payouts,
  // no ride-home — the chapter isn't over). lav_spirit is the set piece:
  // CH5.0 §2's unwinnable contract — no trainer, uncatchable, every hit
  // passes through, LEG IT and SMOKE BALL are both off. The ONE way out is
  // using the BONE CHARM (the item named in `unwinnable`), which ends the
  // fight via winBattle with no xp; a full wipe is a spar-style clean loss
  // (party healed in place, no coins lost, map unchanged) with the hint —
  // "bring the CHARM" — living in onLose as the epilogue. `music: 'ghost'`
  // overrides the default battle track for the one fight that needs it.
  lav_medium1: {
    trainer: 'MEDIUM',
    foe: { species: 'gastlee', lv: 17 },
    winText: ["MEDIUM: It's...", 'gone. Thank you.'],
    onWin: [
      { setFlag: 'lavMedium1' },
      { addCoins: 120 },
      { say: [['She slumps, then', 'presses coins', 'into your hand.']] },
    ],
    onLose: [],
    onFlee: [],
  },
  lav_medium2: {
    trainer: 'MEDIUM',
    foe: { species: 'hauntor', lv: 20 },
    winText: ['MEDIUM: The mask.', 'She let go of me.'],
    onWin: [
      { setFlag: 'lavMedium2' },
      { addCoins: 200 },
      { say: [['She staggers off,', 'muttering about', 'a debt owed.']] },
    ],
    onLose: [],
    onFlee: [],
  },
  // ── CH6 SYLPHCO TOWER ───────────────────────────────────────────────────
  // syl_watch is the stealth floors' contact fight (heatGuard on syl2/syl4):
  // a delay, not a payday — onWin/onLose empty, the ship_watch shape (CH6.0
  // §6). The trainers below are the chapter's once-only paydays: doorman +
  // two clerks + exec each pay once behind their own flag; the bodyguard duo
  // chains guard1 → guard2 with NO heal in between (CH6.0 §5), and only
  // guard2's onWin sets ch6Duo — a wipe or flee between the two records
  // nothing and leaves the office chest sealed.
  syl_watch: {
    trainer: 'SYLPH GUARD',
    foe: { species: 'drowzey', lv: 21 },
    winText: ['GUARD: Ugh.', 'Just... go.', "I didn't see you."],
    onWin: [],
    onLose: [],
    onFlee: [],
  },
  syl_doorman: {
    trainer: 'DOORMAN',
    foe: { species: 'golbatt', lv: 21 },
    winText: ['DOORMAN: Fine.', 'FINE. Take the', 'lift.'],
    onWin: [
      { setFlag: 'sylDoorman' },
      { addCoins: 150 },
      { sfx: 'item' },
      { sysMsg: ['GOT 150 COINS!'] },
      { say: [['He straightens', 'his tie and looks', 'at the ceiling.']] },
    ],
    onLose: [],
    onFlee: [],
  },
  syl_clerk1: {
    trainer: 'CLERK',
    foe: { species: 'drowzey', lv: 22 },
    winText: ['CLERK: Fine!', 'Records are', 'yours. Sort of.'],
    onWin: [
      { setFlag: 'sylClerkA' },
      { addCoins: 180 },
      { sfx: 'item' },
      { sysMsg: ['GOT 180 COINS!'] },
      { say: [['She goes back to', 'filing, slower', 'than before.']] },
    ],
    onLose: [],
    onFlee: [],
  },
  syl_clerk2: {
    trainer: 'CLERK',
    foe: { species: 'gravlr', lv: 23 },
    winText: ['CLERK: Ugh. The', 'cabinet. Go on.'],
    onWin: [
      { setFlag: 'sylClerkB' },
      { addCoins: 200 },
      { sfx: 'item' },
      { sysMsg: ['GOT 200 COINS!'] },
      // 'the way, muttering' is 18 chars — trimmed to fit the 17-char box
      { say: [['He slides aside,', 'muttering about', 'overtime.']] },
    ],
    onLose: [],
    onFlee: [],
  },
  syl_exec: {
    trainer: 'EXEC',
    foe: { species: 'hypnoz', lv: 25 },
    winText: ['EXEC: Noted.', "I'll escalate", 'this.'],
    onWin: [
      { setFlag: 'sylExec' },
      { addCoins: 300 },
      { sfx: 'item' },
      { sysMsg: ['GOT 300 COINS!'] },
      { say: [['He types a memo', 'about you, very', 'fast.']] },
    ],
    onLose: [],
    onFlee: [],
  },
  syl_guard1: {
    trainer: 'BODYGUARD',
    foe: { species: 'machopp', lv: 25 },
    winText: ['GUARD: Tch.', 'PARTNER. Your', 'turn.'],
    onWin: [{ battle: 'syl_guard2' }],
    onLose: [],
    onFlee: [{ say: [['GUARD: Run, then.', "We're not going", 'anywhere.']] }],
  },
  syl_guard2: {
    trainer: 'BODYGUARD',
    foe: { species: 'machoke', lv: 27 },
    winText: ['GUARD: ...Fine.', "He's all yours."],
    onWin: [
      { setFlag: 'ch6Duo' },
      { say: [['The bodyguards', 'limp off to call', 'someone.']] },
    ],
    onLose: [],
    onFlee: [{ say: [['GUARD: Back to', 'square one, then.']] }],
  },
  lav_spirit: {
    foe: { species: 'marowl', lv: 22 },
    uncatchable: true,
    unwinnable: { item: 'BONE CHARM', hint: ['She cannot be', 'hurt. Try using', 'ITEM: BONE CHARM'] },
    music: 'ghost',
    winText: [],
    onWin: [
      { setFlag: 'ch5Spirit' },
      { say: [['She takes the', 'charm. The mask', 'slips from her.'], ['The mist thins.', 'She is gone.']] },
    ],
    onLose: [{ say: [['A whisper in the', 'dark: the CHARM.', 'Bring the CHARM.']] }],
    onFlee: [],
  },
};
