// SIDE.1 — job board contracts (plan §2, .paul/PLAN.md "SIDE.1" frozen
// design). Pure and engine-free: generation is seeded (mulberry32, never
// Math.random) and derived from quest state, so the board's offers survive a
// reload without being saved; only the TAKEN contract persists (SaveV3).
// Progress is derived — pack counts for fetch, monotonic counters minus a
// base stamped at take for hunt/spin — so nothing here can drift on reload.
// The screen that renders all this lives in jobsScreen.ts.
import { mulberry32 } from '../engine/rng';
import { quest, RANKS } from './quest';
import { ITEMS } from '../data/items';
import { packCounts } from './inventory';
import { perkPct } from './perks';

export type JobKind = 'fetch' | 'hunt' | 'spin';

export interface JobContract {
  kind: JobKind;
  slot: number;   // board slot 0–2 this contract occupies (per-slot re-roll, SIDE.1-FB)
  item?: string;  // fetch only — an id from FETCH_POOL
  need: number;   // fetch: item count · hunt: KOs · spin: slot spins
  payout: number; // coins on hand-in, fixed at generation
  base: number;   // hunt/spin: counter value at take; fetch (and offers): 0
}

/** Fetch targets — priced shop items only, so the board can never ask for a
 *  key/quest item and the buy-from-vendor loop always exists. The jobs lint
 *  bounds the ids ("4x " + id ≤ 17). */
export const FETCH_POOL = ['SODA', 'ROKKET BALL'];

/** Kind unlocked at rank index: fetch @ GRUNT, hunt @ AGENT, spin @ OPERATIVE. */
function unlockedKinds(rankIdx: number): JobKind[] {
  const kinds: JobKind[] = ['fetch'];
  if (rankIdx >= 1) kinds.push('hunt');
  if (rankIdx >= 2) kinds.push('spin');
  return kinds;
}

/** Payout formulas (frozen in PLAN; hand-derived in tests). Fetch pays the
 *  shop cost plus a 50·(rankIdx+1) premium so completing one always profits. */
export function jobPayout(kind: JobKind, need: number, rankIdx: number, item?: string): number {
  if (kind === 'fetch') return ITEMS[item!].price * need + 50 * (rankIdx + 1);
  if (kind === 'hunt') return 35 * need + 50 * rankIdx;
  return 10 * need + 50 * rankIdx;
}

/** One slot's offer, deterministic per (rank, slot, that slot's completion
 *  count) — so a hand-in re-rolls ONLY the slot it completed (SIDE.1-FB:
 *  Lyall's playtest call; the v1 board-wide re-roll read as a bug). A rank
 *  change still re-rolls everything, by design — new kinds should appear.
 *  Unrecognised ranks offer as GRUNT (the rankUp corrupt-save stance). */
export function jobOffer(rank: string, slot: number, completions: number): JobContract {
  const rankIdx = Math.max(0, RANKS.indexOf(rank as (typeof RANKS)[number]));
  // slot stride 127 chosen by inspecting first boards: GRUNT sees varied
  // fetches, a fresh AGENT sees hunt contracts immediately (SIDE.1-FB)
  const rng = mulberry32(0xb0a2d + rankIdx * 7 + slot * 127 + completions * 7919);
  const roll = (lo: number, hi: number): number => lo + Math.floor(rng() * (hi - lo + 1));
  const kinds = unlockedKinds(rankIdx);
  const kind = kinds[roll(0, kinds.length - 1)];
  if (kind === 'fetch') {
    const item = FETCH_POOL[roll(0, FETCH_POOL.length - 1)];
    const need = roll(2, 4);
    return { kind, slot, item, need, payout: jobPayout('fetch', need, rankIdx, item), base: 0 };
  }
  if (kind === 'hunt') {
    const need = roll(3, 6);
    return { kind, slot, need, payout: jobPayout('hunt', need, rankIdx), base: 0 };
  }
  const need = roll(5, 10);
  return { kind, slot, need, payout: jobPayout('spin', need, rankIdx), base: 0 };
}

/** The board's list view, always three rows: each slot's derived offer,
 *  with the active contract sitting in the slot it was taken from. */
export function boardRows(): JobContract[] {
  return [0, 1, 2].map((s) =>
    quest.job && quest.job.slot === s
      ? quest.job
      : jobOffer(quest.rank, s, quest.vars['jobSlot' + s] ?? 0),
  );
}

/** Accept a contract: stamp `base` from the live counter so only progress
 *  made AFTER taking counts. One active contract at a time (v1 rule). */
export function takeJob(offer: JobContract): void {
  const base =
    offer.kind === 'hunt' ? (quest.vars.jobKos ?? 0) :
    offer.kind === 'spin' ? (quest.vars.slotSpins ?? 0) : 0;
  quest.job = { ...offer, base };
}

export function jobProgress(): { have: number; need: number } {
  const j = quest.job!;
  const have =
    j.kind === 'fetch' ? (packCounts(quest.items).find((e) => e.id === j.item)?.count ?? 0) :
    j.kind === 'hunt' ? (quest.vars.jobKos ?? 0) - j.base :
    (quest.vars.slotSpins ?? 0) - j.base;
  return { have: Math.max(0, have), need: j.need };
}

export function canHandIn(): boolean {
  const p = jobProgress();
  return p.have >= p.need;
}

/** Pay out a complete contract: fetch consumes exactly `need` items; coins
 *  are added; the contract's SLOT counter advances (re-rolling just that
 *  slot) alongside the jobsDone running total. Returns the coins actually
 *  paid (base payout × the jobs perk — RNK.0: the multiplier applies when
 *  coins land, NEVER at generation, so the seeded board never moves), or
 *  null if the contract isn't complete. */
export function handInJob(): number | null {
  const j = quest.job;
  if (!j || !canHandIn()) return null;
  if (j.kind === 'fetch') {
    for (let k = 0; k < j.need; k++) {
      const i = quest.items.indexOf(j.item!);
      if (i >= 0) quest.items.splice(i, 1);
    }
  }
  const paid = Math.floor(j.payout * (1 + perkPct('jobs')));
  quest.coins += paid;
  quest.vars.jobsDone = (quest.vars.jobsDone ?? 0) + 1;
  quest.vars['jobSlot' + j.slot] = (quest.vars['jobSlot' + j.slot] ?? 0) + 1;
  quest.job = null;
  return paid;
}

/** Walk away: no penalty, no jobsDone bump — the same offers reappear, so
 *  abandoning is never a reroll (deliberate, journaled). */
export function abandonJob(): void {
  quest.job = null;
}

/** Bumped at battle's foeDefeated — a monotonic KO counter, only ever read
 *  as a delta against a contract's base, so counting outside a contract is
 *  harmless. Touches quest only (never battle state or rng — the seeded
 *  battle snapshots stay byte-identical). */
export function jobBattleWon(): void {
  quest.vars.jobKos = (quest.vars.jobKos ?? 0) + 1;
}

// ── Board strings (pure so the lengths lint in Node; ≤17 chars, the box) ──

export function jobLabel(j: JobContract): string {
  if (j.kind === 'fetch') return j.need + 'x ' + j.item;
  if (j.kind === 'hunt') return 'KO ' + j.need + ' MONS';
  return 'SPIN SLOTS ' + j.need;
}

export function jobFooter(j: JobContract): string {
  return 'PAYS ' + j.payout + ' COINS.';
}

export function jobProgressLine(): string {
  const j = quest.job!;
  const p = jobProgress();
  const tag = j.kind === 'fetch' ? j.item! : j.kind === 'hunt' ? 'KOS' : 'SPINS';
  return tag + ': ' + p.have + '/' + p.need;
}
