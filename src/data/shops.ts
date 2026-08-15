// Shop stock lists (plan §4.5). One vendor per town map; the buy list is item
// ids resolved against ITEMS in systems/shop.ts. Sell prices are derived
// (floor(price/2)) — a shop never needs its own sell table.
export interface ShopDef {
  name: string;   // header label, ≤ box width
  stock: string[]; // buyable item ids (must exist in ITEMS and be priced)
  // RNK.3: item id → minimum rank index (into quest.ts's RANKS) required to
  // SEE that row. Absent = visible to everyone (the pre-RNK.3 shops keep
  // this behaviour with zero changes). Hidden until earned — there is no
  // locked-row UI state, the row simply isn't in the filtered stock.
  gate?: Record<string, number>;
}

export const SHOPS: Record<string, ShopDef> = {
  // HQ black-market grunt — gives coins a sink and makes SWIPE's ball economy
  // real before Ch.2's proper vendor cart lands.
  hqStall: { name: 'ROKKET STASH', stock: ['ROKKET BALL', 'SODA'] },
  // CH2.4: the canonical first shop — a grunt's cart wheeled into MT. MOON.
  // Same stock as the stall; the cart supersedes it narratively, not in code.
  moonCart: { name: 'MOON CART', stock: ['ROKKET BALL', 'SODA'] },
  // RNK.3: the back-room vendor at HQ — this IS F32's FLD.1 vendor, opened
  // early (FLD.1 adds moves to it later). Gated one rung below the
  // promotion that grants the matching perk (PLAN "Frozen contracts —
  // RNK.3"), so a rank-appropriate stock always feels earned, not random.
  blackMarket: {
    name: 'BACK ROOM',
    stock: ['NIGHT VISOR', 'HAGGLE HAT', 'UTILITY VEST'],
    gate: { 'NIGHT VISOR': 0, 'HAGGLE HAT': 1, 'UTILITY VEST': 2 },
  },
};
