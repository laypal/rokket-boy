// RNK.0 — the perk contract (spec 2026-08-10 §1). One pure function sums
// two sources: rank-inherent perks (permanent — quest.rank never goes down)
// and owned gear (DISTINCT ids in quest.items: hold the piece, get the
// perk; duplicates count once). Both are reads over state that already
// persists, so there is nothing to save and nothing to desync. The caps
// live HERE, not at the call sites — one place to change, impossible to
// forget. Engine-free, same discipline as jobs.ts/quest.ts.
import { quest, RANKS } from './quest';
import { ITEMS, type PerkKind } from '../data/items';

export type { PerkKind };

/** Hard ceilings per surface: shop never reaches free, steal/jobs can't
 *  compound into a broken coin economy no matter what gear ships later. */
export const PERK_CAPS: Record<PerkKind, number> = { steal: 2.0, jobs: 1.0, shop: 0.4 };

/** Rank-inherent perks — the even rungs of the reward ladder (spec §2):
 *  OPERATIVE (idx 2) → SHOP -10%, EXECUTIVE (idx 4) → JOBS +25%. */
const RANK_PERKS: { kind: PerkKind; pct: number; minRankIdx: number }[] = [
  { kind: 'shop', pct: 0.1, minRankIdx: 2 },
  { kind: 'jobs', pct: 0.25, minRankIdx: 4 },
];

/** Additive percent for one perk surface, as a fraction (0.5 = +50%),
 *  capped. An unrecognised rank (corrupt save) contributes rank-perks as
 *  GRUNT — the rankUp/jobOffer corrupt-save stance. */
export function perkPct(kind: PerkKind): number {
  const rankIdx = RANKS.indexOf(quest.rank as (typeof RANKS)[number]);
  let pct = 0;
  for (const p of RANK_PERKS) if (p.kind === kind && rankIdx >= p.minRankIdx) pct += p.pct;
  for (const id of new Set(quest.items)) {
    const perk = ITEMS[id]?.perk;
    if (perk && perk.kind === kind) pct += perk.pct;
  }
  return Math.min(pct, PERK_CAPS[kind]);
}
