// Integrity lints for the item registry — mirrors mon-data-lint.test.ts so
// every entry added by later item/shop cards gets checked automatically.
import { describe, it, expect } from 'vitest';
import { ITEMS, type ItemKind, BALL_ITEM } from '../src/data/items';
import { PACK_DESC_CAP, PACK_ROW_CAP } from '../src/systems/menu';

const KINDS: ItemKind[] = ['heal', 'ball', 'key', 'quest', 'gear', 'candy'];

describe('item registry', () => {
  it('every item is well-formed', () => {
    for (const [key, item] of Object.entries(ITEMS)) {
      expect(item.id, `key ${key}`).toBe(key);
      expect(item.id.length, `${key} id fits the PACK/shop window`).toBeLessThanOrEqual(15);
      expect(item.desc.length, `${key} desc fits the box width`).toBeLessThanOrEqual(17);
      expect(KINDS, `${key} kind`).toContain(item.kind);
      expect(item.price, `${key} price`).toBeGreaterThanOrEqual(0);
      if (item.kind === 'heal') {
        expect(item.heal, `${key} heal amount`).toBeGreaterThan(0);
      }
    }
  });

  it('every desc fits the PACK footer it actually draws in (MNU.2)', () => {
    // The ≤17 authoring bound above is the items.ts contract; this lint is
    // the DRAW contract — capacity derived in menu.ts from the real footer
    // geometry, so moving/shrinking that box re-fails this test instead of
    // silently clipping.
    for (const [key, item] of Object.entries(ITEMS)) {
      expect(item.desc.length, `${key} desc overflows the PACK footer`).toBeLessThanOrEqual(
        PACK_DESC_CAP,
      );
    }
  });

  it("every row label ('ID xN') fits the PACK window (MNU.2)", () => {
    // ' x99' = 4 glyphs of count budget — a stack deeper than 99 is a design
    // question, not a draw bug. Cap derived from the real row geometry.
    for (const [key, item] of Object.entries(ITEMS)) {
      expect(item.id.length + 4, `${key} row overflows the PACK window`).toBeLessThanOrEqual(
        PACK_ROW_CAP,
      );
    }
  });

  it('ball items are buyable', () => {
    for (const [key, item] of Object.entries(ITEMS)) {
      if (item.kind === 'ball') expect(item.price, `${key} price`).toBeGreaterThan(0);
    }
  });

  it('key/quest items are never buyable', () => {
    for (const [key, item] of Object.entries(ITEMS)) {
      if (item.kind === 'key' || item.kind === 'quest') {
        expect(item.price, `${key} price`).toBe(0);
      }
    }
  });

  it('ROKKET BALL matches BALL_ITEM from data/items.ts', () => {
    expect(ITEMS[BALL_ITEM]).toBeDefined();
    expect(ITEMS[BALL_ITEM].kind).toBe('ball');
    expect(ITEMS[BALL_ITEM].id).toBe(BALL_ITEM);
  });

  it('seeds the Ch.1 items with the ids used by existing content', () => {
    expect(ITEMS['SMOKE BALL'].kind).toBe('key');
    expect(ITEMS['CASE OF COINS'].kind).toBe('quest');
    expect(ITEMS.SODA.kind).toBe('heal');
    expect(ITEMS.SODA.heal).toBe(20);
  });

  it('gear kind and the wear def always agree (FLW.3: shop.ts gates the owned-count column on wear, not kind)', () => {
    for (const [key, item] of Object.entries(ITEMS)) {
      if (item.kind === 'gear') {
        expect(item.wear, `${key} is kind 'gear' but carries no wear def`).toBeDefined();
      } else {
        expect(item.wear, `${key} carries a wear def but isn't kind 'gear'`).toBeUndefined();
      }
    }
  });

  it('RNK.3: the three BACK ROOM gear pieces are buyable, tier 0, one per perk kind', () => {
    const NIGHT_VISOR = ITEMS['NIGHT VISOR'];
    const HAGGLE_HAT = ITEMS['HAGGLE HAT'];
    const UTILITY_VEST = ITEMS['UTILITY VEST'];
    expect(NIGHT_VISOR.price).toBe(4000);
    expect(NIGHT_VISOR.perk).toEqual({ kind: 'steal', pct: 0.5 });
    expect(NIGHT_VISOR.wear).toEqual({ slot: 'head', tier: 0 });
    expect(HAGGLE_HAT.price).toBe(3500);
    expect(HAGGLE_HAT.perk).toEqual({ kind: 'shop', pct: 0.15 });
    expect(HAGGLE_HAT.wear).toEqual({ slot: 'head', tier: 0 });
    expect(UTILITY_VEST.price).toBe(3000);
    expect(UTILITY_VEST.perk).toEqual({ kind: 'jobs', pct: 0.25 });
    expect(UTILITY_VEST.wear).toEqual({ slot: 'body', tier: 0 });
    // trophy gear (ROKKET SHADES/GLOVES/COAT) must stay unbuyable and never
    // appear in a stock list — proven by the shop-data-lint "gated item must
    // be priced > 0" assertion; here just pin the trophies stay price 0.
    expect(ITEMS['ROKKET SHADES'].price).toBe(0);
    expect(ITEMS['ROKKET GLOVES'].price).toBe(0);
    expect(ITEMS['ROKKET COAT'].price).toBe(0);
  });
});
