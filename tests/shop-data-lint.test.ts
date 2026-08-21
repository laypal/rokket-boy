// Shop data-integrity lints (plan §4.5): every vendor's stock references a real,
// priced item and every header fits the window. Runs over all shops so new
// vendors get linted for free.
import { describe, it, expect } from 'vitest';
import { SHOPS } from '../src/data/shops';
import { ITEMS } from '../src/data/items';
import { RANKS } from '../src/systems/quest';
import { canSell, sellPrice } from '../src/systems/inventory';
import { SHOP_STACK_ROW_CAP, SHOP_GEAR_ROW_CAP, COUNT_EDGE, PRICE_EDGE } from '../src/systems/shop';

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

  it('pins the derived row-budget geometry (FLW.3)', () => {
    // Regression pin on shop.ts's geometry derivation — if drawWindow's
    // border, the mini font's pitch or the reserved digit widths ever
    // change, this fails loud instead of a row silently overlapping again.
    expect(SHOP_STACK_ROW_CAP).toBe(11);
    expect(SHOP_GEAR_ROW_CAP).toBe(12);
    expect(PRICE_EDGE).toBe(155);
    expect(COUNT_EDGE).toBe(119);
  });

  it('FLW.3: every stock row fits its BUY window without overlap — count column for stackables, none for gear', () => {
    for (const [shopId, shop] of Object.entries(SHOPS)) {
      for (const id of shop.stock) {
        const item = ITEMS[id];
        const gear = item.wear !== undefined;
        const cap = gear ? SHOP_GEAR_ROW_CAP : SHOP_STACK_ROW_CAP;
        expect(
          id.length,
          `${shopId}: "${id}" (${gear ? 'gear' : 'stackable'}) row overflows the BUY window — cap ${cap}`,
        ).toBeLessThanOrEqual(cap);
      }
    }
  });

  it('every sellable item fits the stackable row — SELL lists the bag, not a stock list', () => {
    // canSell admits heal/ball kinds whatever shop is open, so the SELL
    // list can show any of them; the row budget has to hold for all, not
    // just the ids some vendor stocks.
    const sellable = Object.keys(ITEMS).filter(canSell);
    expect(sellable.length).toBeGreaterThan(0);
    for (const id of sellable) {
      expect(id.length, `"${id}" overflows the SELL row — cap ${SHOP_STACK_ROW_CAP}`).toBeLessThanOrEqual(
        SHOP_STACK_ROW_CAP,
      );
      expect(ITEMS[id].wear, `"${id}" is sellable but carries a wear slot — gear rows have no count column`).toBeUndefined();
    }
  });

  it('prices stay inside the digit budget each row shape reserves: $999 stackable, $9999 gear', () => {
    // The caps above reserve '$' + 3 digits on a stackable row and '$' + 4
    // on a gear row. buyPrice only ever discounts and sellPrice halves, so
    // the base price is the ceiling for both columns.
    for (const [id, item] of Object.entries(ITEMS)) {
      if (item.price <= 0) continue;
      const gear = item.wear !== undefined;
      const max = gear ? 9999 : 999;
      expect(item.price, `"${id}" price $${item.price} overflows its ${gear ? 'gear' : 'stackable'} row`).toBeLessThanOrEqual(max);
      if (!gear) expect(sellPrice(id)).toBeLessThanOrEqual(999);
    }
  });
});
