// Shop data-integrity lints (plan §4.5): every vendor's stock references a real,
// priced item and every header fits the window. Runs over all shops so new
// vendors get linted for free.
import { describe, it, expect } from 'vitest';
import { SHOPS } from '../src/data/shops';
import { ITEMS } from '../src/data/items';
import { RANKS } from '../src/systems/quest';

describe('shop data lints', () => {
  it('every stock id is a real, buyable item', () => {
    for (const [shopId, shop] of Object.entries(SHOPS)) {
      for (const id of shop.stock) {
        const def = ITEMS[id];
        expect(def, `${shopId} sells unknown item "${id}"`).toBeDefined();
        expect(def.price, `${shopId}: "${id}" must be priced > 0`).toBeGreaterThan(0);
      }
    }
  });

  it('shop names fit the header box', () => {
    for (const [shopId, shop] of Object.entries(SHOPS)) {
      expect(shop.name.length, `${shopId} name too long: "${shop.name}"`).toBeLessThanOrEqual(15);
    }
  });

  it('the HQ stall stocks ROKKET BALLs and SODA', () => {
    expect(SHOPS.hqStall.stock).toContain('ROKKET BALL');
    expect(SHOPS.hqStall.stock).toContain('SODA');
  });

  it('RNK.3: every gated id is real gear, appears in its own stock, and gates within RANKS', () => {
    for (const [shopId, shop] of Object.entries(SHOPS)) {
      if (!shop.gate) continue;
      for (const [id, minRankIdx] of Object.entries(shop.gate)) {
        expect(shop.stock, `${shopId} gate references "${id}" but it is not in stock`).toContain(id);
        expect(ITEMS[id], `${shopId} gate references unknown item "${id}"`).toBeDefined();
        expect(ITEMS[id].kind, `${shopId}: gated item "${id}" must be gear`).toBe('gear');
        expect(
          minRankIdx,
          `${shopId}: "${id}" gate ${minRankIdx} is outside RANKS bounds`,
        ).toBeGreaterThanOrEqual(0);
        expect(minRankIdx).toBeLessThan(RANKS.length);
      }
    }
  });

  it('the BACK ROOM stocks the three RNK.3 gear pieces, gated one rung apart', () => {
    expect(SHOPS.blackMarket.stock).toEqual(['NIGHT VISOR', 'HAGGLE HAT', 'UTILITY VEST']);
    expect(SHOPS.blackMarket.gate).toEqual({ 'NIGHT VISOR': 0, 'HAGGLE HAT': 1, 'UTILITY VEST': 2 });
  });

  it('shops with no gate leave every stock row unconditionally visible (no-gate path unchanged)', () => {
    expect(SHOPS.hqStall.gate).toBeUndefined();
    expect(SHOPS.moonCart.gate).toBeUndefined();
  });
});
