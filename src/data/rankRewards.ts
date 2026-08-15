// RNK.1 — the rank reward table (spec 2026-08-10 §2), data-as-leaf like
// items.ts. Five promotions: coins every rung, gear trophies on the odd
// rungs, rank-inherent perks (perks.ts RANK_PERKS) on the even ones.
// Coin amounts are a first pass calibrated against a 200c ball — expect a
// playtest to move them (spec risk list). quest.ts applies the grant
// inside rankUp(); keys are the post-promotion rank.
export const RANK_REWARDS: Record<string, { coins: number; gear?: string }> = {
  AGENT: { coins: 300, gear: 'ROKKET SHADES' },
  OPERATIVE: { coins: 600 }, // rank perk: SHOP -10%
  LIEUTENANT: { coins: 1000, gear: 'ROKKET GLOVES' },
  EXECUTIVE: { coins: 1500 }, // rank perk: JOBS +25%
  "BOSS'S RIVAL": { coins: 2500, gear: 'ROKKET COAT' },
};
