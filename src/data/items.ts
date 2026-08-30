// Item registry (Phase 1c §5). Keyed by id, which doubles as the display
// label used in PACK/shop windows — hence the length caps enforced by the
// lint. items.ts owns BALL_ITEM as data; systems (battle.ts) import it, so
// the two still can never drift apart.

/** Item a wild-battle SWIPE consumes (plan §4.4; buyable from Ch.2). */
export const BALL_ITEM = 'ROKKET BALL';
/** CH5.0 §1: the key item that lifts the LAVENDAR TOWER's fog (systems/fog.ts). */
export const SCOPE_ITEM = 'SILF SCOPE';

export type ItemKind = 'heal' | 'ball' | 'key' | 'quest' | 'gear' | 'candy';

/** Perk surfaces a piece of gear (or a rank) may touch — never XP (spec
 *  2026-08-10 §1). Lives here so data stays the leaf: perks.ts imports this,
 *  not the other way round. */
export type PerkKind = 'steal' | 'jobs' | 'shop';

export interface ItemDef {
  id: string;      // canonical id AND display label; must be ≤ 15 chars (fits the PACK/shop window)
  kind: ItemKind;
  price: number;   // shop buy price in coins; 0 for non-buyable (key/quest and promotion trophies)
  heal?: number;   // hp restored, only for kind 'heal'
  desc: string;    // one-line flavour, ≤ 17 chars (box width)
  perk?: { kind: PerkKind; pct: number }; // gear only — additive fraction (0.5 = +50%), summed in perks.ts
  wear?: { slot: 'head' | 'hands' | 'body'; tier: number }; // gear only — worn overlay slot; highest tier draws (rows live in chars.ts)
}

export const ITEMS: Record<string, ItemDef> = {
  [BALL_ITEM]: { id: BALL_ITEM, kind: 'ball', price: 200, desc: 'SWIPES WILD MONS.' },
  SODA: { id: 'SODA', kind: 'heal', price: 60, heal: 20, desc: 'RESTORES 20 HP.' },
  'SMOKE BALL': { id: 'SMOKE BALL', kind: 'key', price: 0, desc: 'GUARANTEED FLEE.' },
  'CASE OF COINS': { id: 'CASE OF COINS', kind: 'quest', price: 0, desc: 'THE HEIST PRIZE.' },
  // CH5 LAVENDAR TOWER — the SCOPE lifts the fog (a 2F pickup), the CHARM is
  // the only thing the spirit fight answers to (consumed there), the MASK is
  // the prize. None buyable, none sellable (canSell excludes key/quest).
  [SCOPE_ITEM]: { id: SCOPE_ITEM, kind: 'key', price: 0, desc: 'SEES THROUGH FOG.' },
  'BONE CHARM': { id: 'BONE CHARM', kind: 'key', price: 0, desc: 'CALMS A SPIRIT.' },
  'BONE MASK': { id: 'BONE MASK', kind: 'quest', price: 0, desc: 'THE HEIST PRIZE.' },
  // CH6 SYLPHCO TOWER — the CARD KEY opens every 'd' door (a 3F pickup,
  // CH6.0 §2/§8), the BOSS BALL is the prize. Neither buyable nor sellable.
  'CARD KEY': { id: 'CARD KEY', kind: 'key', price: 0, desc: 'OPENS THE DOORS.' },
  'BOSS BALL': { id: 'BOSS BALL', kind: 'quest', price: 0, desc: 'THE HEIST PRIZE.' },
  // SIDE.7: the Gamez Corner jackpot prize — never stocked, never bought;
  // only the special machine's tile script grants it (dialog/corner.ts).
  'LEVEL CANDY': { id: 'LEVEL CANDY', kind: 'candy', price: 0, desc: 'UP ONE LEVEL.' },
  // RNK.1 promotion trophies (rankRewards.ts) — price 0 = unbuyable, and
  // canSell excludes gear, so a perk once earned can never be lost. Wear
  // tiers are the ladder rungs; the three deliberately occupy three
  // different slots so no trophy ever hides another (spec §2b).
  'ROKKET SHADES': { id: 'ROKKET SHADES', kind: 'gear', price: 0, desc: 'STEAL +50%.', perk: { kind: 'steal', pct: 0.5 }, wear: { slot: 'head', tier: 1 } },
  'ROKKET GLOVES': { id: 'ROKKET GLOVES', kind: 'gear', price: 0, desc: 'JOB PAY +25%.', perk: { kind: 'jobs', pct: 0.25 }, wear: { slot: 'hands', tier: 3 } },
  'ROKKET COAT': { id: 'ROKKET COAT', kind: 'gear', price: 0, desc: 'STEAL +100%.', perk: { kind: 'steal', pct: 1.0 }, wear: { slot: 'body', tier: 5 } },
  // RNK.3 BACK ROOM gear vendor (blackMarket, data/shops.ts) — one buyable
  // piece per perk kind, all tier 0 so they never outrank the trophies
  // above (highest tier wins a slot; trophies stay the visible upgrade).
  'NIGHT VISOR': { id: 'NIGHT VISOR', kind: 'gear', price: 4000, desc: 'STEAL +50%.', perk: { kind: 'steal', pct: 0.5 }, wear: { slot: 'head', tier: 0 } },
  'HAGGLE HAT': { id: 'HAGGLE HAT', kind: 'gear', price: 3500, desc: 'SHOP -15%.', perk: { kind: 'shop', pct: 0.15 }, wear: { slot: 'head', tier: 0 } },
  'UTILITY VEST': { id: 'UTILITY VEST', kind: 'gear', price: 3000, desc: 'JOB PAY +25%.', perk: { kind: 'jobs', pct: 0.25 }, wear: { slot: 'body', tier: 0 } },
};
