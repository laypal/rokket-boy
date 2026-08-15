// Typed quest state (was the global `flags` object) + condition evaluator,
// rank ladder and chapter state machine (§4.7). Chapter progress is derived
// from flags via Cond — nothing here persists beyond what SaveV1 already
// carries, so the state machine costs no save-shape bump.
import type { Cond, Flags } from '../types';
import type { JobContract } from './jobs';
import { RANK_REWARDS } from '../data/rankRewards';

export interface QuestState {
  flags: Flags;
  coins: number;
  eggs: Set<string>;
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
    gotSmoke: false,
    fossilsTaken: false,
    gotEkanzz: false,
    bradBeaten: false,
    ch2Done: false,
    jobsIntroSeen: false,
    drillBattleDone: false,
    drillStealthDone: false,
  };
}

export const quest: QuestState = {
  flags: freshFlags(),
  coins: 0,
  eggs: new Set(),
  vars: {},
  items: [],
  rank: 'GRUNT',
  job: null,
};

export function resetQuest(): void {
  quest.flags = freshFlags();
  quest.coins = 0;
  quest.eggs = new Set();
  quest.vars = {};
  quest.items = [];
  quest.rank = 'GRUNT';
  quest.job = null;
}

export function checkCond(c: Cond): boolean {
  if ('flag' in c) return quest.flags[c.flag];
  if ('notFlag' in c) return !quest.flags[c.notFlag];
  if ('egg' in c) return quest.eggs.has(c.egg);
  if ('notEgg' in c) return !quest.eggs.has(c.notEgg);
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
