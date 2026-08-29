// Typed quest state (was the global `flags` object) + condition evaluator,
// rank ladder and chapter state machine (§4.7). Chapter progress is derived
// from flags via Cond — nothing here persists beyond what SaveV1 already
// carries, so the state machine costs no save-shape bump.
import type { Cond, Flags } from '../types';
import type { JobContract } from './jobs';
import { RANK_REWARDS } from '../data/rankRewards';
import { SPECIES } from '../data/mons';
import { dexComplete } from './dex';
import { mulberry32 } from '../engine/rng';

export interface QuestState {
  flags: Flags;
  coins: number;
  eggs: Set<string>;
  pickups: Set<string>;         // SIDE.6: taken item-ball ids (persisted like eggs)
  vars: Record<string, number>; // scratch counters (e.g. slotSpins)
  items: string[];              // PACK contents
  rank: string;                 // §4.7 ladder; stub until 1e's rank system
  job: JobContract | null;      // SIDE.1: the one active job-board contract
}

function freshFlags(): Flags {
  return {
    briefed: false,
    guardBeaten: false,
    switchFound: false,
    lootTaken: false,
    missionDone: false,
    fossilsTaken: false,
    gotEkanzz: false,
    bradBeaten: false,
    ch2Done: false,
    jobsIntroSeen: false,
    drillBattleDone: false,
    drillStealthDone: false,
    sparSodaGiven: false,
    spanCamper: false,
    spanPicnicker: false,
    spanHiker: false,
    spanYoungster: false,
    spanLass: false,
    ch3Done: false,
    introSeen: false,
    ch2Briefed: false,
    ch3Briefed: false,
    introToured: false,
    ch4Briefed: false,
    ch4Suit: false,
    ch4Safe: false,
    ch4Done: false,
    disguised: false,
    ch5Briefed: false,
    ch5Spirit: false,
    ch5Mask: false,
    ch5Myowth: false,
    ch5Done: false,
    lavMedium1: false,
    lavMedium2: false,
    myowthGagSeen: false,
  };
}

export const quest: QuestState = {
  flags: freshFlags(),
  coins: 0,
  eggs: new Set(),
  pickups: new Set(),
  vars: {},
  items: [],
  rank: 'GRUNT',
  job: null,
};

export function resetQuest(): void {
  quest.flags = freshFlags();
  quest.coins = 0;
  quest.eggs = new Set();
  quest.pickups = new Set();
  quest.vars = {};
  quest.items = [];
  quest.rank = 'GRUNT';
  quest.job = null;
}

/** SIDE.4: who owns what, for the `dexComplete` Cond. The dex is derived
 *  from the party + box (state.ts), which this engine-free module must not
 *  import — main.ts registers the live provider once at boot, tests
 *  register fixtures. Default: nobody owns anything. */
let dexMons: () => { species: string }[] = () => [];
export function setDexMons(f: () => { species: string }[]): void {
  dexMons = f;
}

/** CH5.3 playtest: how full is the party, for the `partyFull` Cond. Same
 *  shape as setDexMons — the party lives in state.ts, which this module
 *  must not import; main.ts registers the live reader, tests register
 *  fixtures. Default: empty. Exists because the join scene's "I'm in the
 *  LOCKER" line fired unconditionally and read as a lie whenever Myowth had
 *  actually joined (playtester, 2026-08-29). */
export const PARTY_CAP = 4;
let partySize: () => number = () => 0;
export function setPartySize(f: () => number): void {
  partySize = f;
}

/** SIDE.7: deterministic per-spin jackpot roll — spin number `n` always
 *  rolls the same outcome under probability `p`, so a winning spin count is
 *  reproducible and pinnable in tests; never an unseeded roll. */
export function varRoll(n: number, p: number): boolean {
  return mulberry32(0x51de7 + n * 7919)() < p;
}

export function checkCond(c: Cond): boolean {
  if ('flag' in c) return quest.flags[c.flag];
  if ('notFlag' in c) return !quest.flags[c.notFlag];
  if ('egg' in c) return quest.eggs.has(c.egg);
  if ('notEgg' in c) return !quest.eggs.has(c.notEgg);
  if ('dexComplete' in c) return dexComplete(dexMons(), SPECIES);
  // ONB.3 compound forms — recursive, so any-of-alls (a "hand-in OR briefing
  // waiting" marker) is one Cond in map data, no per-NPC evaluator
  if ('all' in c) return c.all.every(checkCond);
  if ('any' in c) return c.any.some(checkCond);
  if ('varRoll' in c) return varRoll(quest.vars[c.varRoll[0]] ?? 0, c.varRoll[1]);
  if ('coinsAtLeast' in c) return quest.coins >= c.coinsAtLeast;
  if ('hasItem' in c) return quest.items.includes(c.hasItem); // CH5.0 §6
  if ('partyFull' in c) return partySize() >= PARTY_CAP;
  return quest.vars[c.varEq[0]] === c.varEq[1];
}

// ── Rank ladder (§2/§4.7) ───────────────────────────────────────────────────

export const RANKS = [
  'GRUNT',
  'AGENT',
  'OPERATIVE',
  'LIEUTENANT',
  'EXECUTIVE',
  "BOSS'S RIVAL",
] as const;

/** Advance quest.rank one stage (clamped at the top) and return the new rank.
 *  An unrecognised rank (corrupt save) restarts the ladder at GRUNT.
 *  RNK.1: the promotion grant (coins + gear trophy) rides this call — it
 *  already sits before endScreen under CH2's ordered-event-log test, so the
 *  reward needs no hook of its own. Only a REAL advance pays: the top-rung
 *  clamp and the corrupt-save restart grant nothing. */
export function rankUp(): string {
  const i = RANKS.indexOf(quest.rank as (typeof RANKS)[number]);
  const ni = Math.min(i + 1, RANKS.length - 1);
  quest.rank = RANKS[ni];
  if (i >= 0 && ni > i) {
    const r = RANK_REWARDS[quest.rank];
    if (r) {
      quest.coins += r.coins;
      if (r.gear) quest.items.push(r.gear);
    }
  }
  return quest.rank;
}

// ── Chapter state machine (§4.7) ────────────────────────────────────────────
// ChapterId spans the full campaign; step data arrives with each §6 chapter
// card, like maps and encounters do. Steps are ordered; the current objective
// is the first unmet step. Level design enforces the order today, and
// first-unmet semantics tolerate flags arriving out of order.

export type ChapterId =
  | 'ch1' | 'ch2' | 'ch3' | 'ch4' | 'ch5'
  | 'ch6' | 'ch7' | 'ch8' | 'ch9' | 'ch10';

export interface ChapterStep {
  objective: string; // STATUS line, ≤17 chars (content lint)
  done: Cond;
}

export interface ChapterDef {
  id: ChapterId;
  steps: ChapterStep[];
}

export const CHAPTERS: ChapterDef[] = [
  {
    id: 'ch1',
    steps: [
      { objective: 'SEE THE BOSS', done: { flag: 'briefed' } },
      { objective: 'BEAT THE GUARD', done: { flag: 'guardBeaten' } },
      { objective: 'FIND THE SWITCH', done: { flag: 'switchFound' } },
      { objective: 'GRAB THE CASE', done: { flag: 'lootTaken' } },
      { objective: 'REPORT TO BOSS', done: { flag: 'missionDone' } },
    ],
  },
  {
    id: 'ch2',
    steps: [
      { objective: 'RAID MT. MOON', done: { flag: 'fossilsTaken' } },
      { objective: 'BEAT BRAD', done: { flag: 'bradBeaten' } },
      { objective: 'REPORT TO BOSS', done: { flag: 'ch2Done' } },
    ],
  },
  // CH3: the five marks fall in lane order, so the last one's flag is the
  // gauntlet's "done"; KIRA's win sets ch3Done AND promotes on the spot
  // (she is the recruiter — no separate report-to-boss step this chapter).
  {
    id: 'ch3',
    steps: [
      { objective: 'WORK THE SPAN', done: { flag: 'spanLass' } },
      { objective: 'BEAT KIRA', done: { flag: 'ch3Done' } },
    ],
  },
  // CH4 (S.S. ANN): suit up, crack the safe, then win the gangway back from
  // the chief — ss_chief2's onWin sets ch4Done and promotes to LIEUTENANT.
  {
    id: 'ch4',
    steps: [
      { objective: 'SUIT UP', done: { flag: 'ch4Suit' } },
      { objective: 'CRACK THE SAFE', done: { flag: 'ch4Safe' } },
      { objective: 'BEAT THE CHIEF', done: { flag: 'ch4Done' } },
    ],
  },
  // CH5 (LAVENDAR TOWER): the SCOPE is a hard gate (a ghost holds the 2F
  // stairs until it's in the PACK), so these always fall in order. Myowth's
  // join is a scene between the mask and the hand-in, not an objective.
  {
    id: 'ch5',
    steps: [
      { objective: 'FIND THE SCOPE', done: { hasItem: 'SILF SCOPE' } },
      { objective: 'CALM THE SPIRIT', done: { flag: 'ch5Spirit' } },
      { objective: 'TAKE THE MASK', done: { flag: 'ch5Mask' } },
      { objective: 'REPORT TO BOSS', done: { flag: 'ch5Done' } },
    ],
  },
];

/** First unmet step across all authored chapters; every step met → the
 *  between-chapters tease. */
export function currentObjective(): string {
  for (const ch of CHAPTERS)
    for (const step of ch.steps)
      if (!checkCond(step.done)) return step.objective;
  return 'AWAIT ORDERS.';
}

/** H:MM (GB convention) for the STATUS play-time line. */
export function formatPlayTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h + ':' + String(m).padStart(2, '0');
}
