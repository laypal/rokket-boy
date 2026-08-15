import { describe, it, expect } from 'vitest';
import {
  itemDef, sellPrice, packCounts, usableInBattle, usableOutOfBattle, canSell, applyHeal, itemLabel,
} from '../src/systems/inventory';
import { ITEMS, BALL_ITEM } from '../src/data/items';
import { SPECIES } from '../src/data/mons';
import { makeMon, maxHp } from '../src/systems/mon';

describe('itemDef', () => {
  it('returns the registered def for a known id', () => {
    expect(itemDef('SODA')).toEqual(ITEMS.SODA);
  });

  it('falls back to a synthetic quest def for an unknown id', () => {
    expect(itemDef('MYSTERY ITEM')).toEqual({ id: 'MYSTERY ITEM', kind: 'quest', price: 0, desc: '' });
  });
});

describe('itemLabel', () => {
  it('formats id + count (QOL.1)', () => {
    expect(itemLabel({ id: 'SODA', count: 3 })).toBe('SODA x3');
  });

  it('holds for a count of 1 too', () => {
    expect(itemLabel({ id: 'SMOKE BALL', count: 1 })).toBe('SMOKE BALL x1');
  });
});

describe('sellPrice', () => {
  it('is floor(price / 2)', () => {
    expect(sellPrice('SODA')).toBe(30);       // 60 / 2
    expect(sellPrice(BALL_ITEM)).toBe(100);   // 200 / 2
  });

  it('is 0 for non-buyable items', () => {
    expect(sellPrice('SMOKE BALL')).toBe(0);
    expect(sellPrice('CASE OF COINS')).toBe(0);
  });
});

describe('packCounts', () => {
  it('groups by id, preserving first-seen order', () => {
    expect(packCounts(['A', 'B', 'A'])).toEqual([
      { id: 'A', count: 2 },
      { id: 'B', count: 1 },
    ]);
  });

  it('returns [] for an empty pack', () => {
    expect(packCounts([])).toEqual([]);
  });

  it('keeps distinct ids in the order they first appear', () => {
    expect(packCounts(['C', 'B', 'A', 'B', 'C', 'C'])).toEqual([
      { id: 'C', count: 3 },
      { id: 'B', count: 2 },
      { id: 'A', count: 1 },
    ]);
  });
});

describe('usableInBattle / usableOutOfBattle / canSell truth tables', () => {
  it('heal: usable both places, sellable', () => {
    expect(usableInBattle('SODA')).toBe(true);
    expect(usableOutOfBattle('SODA')).toBe(true);
    expect(canSell('SODA')).toBe(true);
  });

  it('ball: not usable from the pack (thrown via SWIPE), sellable', () => {
    expect(usableInBattle(BALL_ITEM)).toBe(false);
    expect(usableOutOfBattle(BALL_ITEM)).toBe(false);
    expect(canSell(BALL_ITEM)).toBe(true);
  });

  it('key: usable in battle only (SMOKE BALL needs HEAT out of battle), never sellable', () => {
    expect(usableInBattle('SMOKE BALL')).toBe(true);
    expect(usableOutOfBattle('SMOKE BALL')).toBe(false);
    expect(canSell('SMOKE BALL')).toBe(false);
  });

  it('SMOKE BALL becomes overworld-usable when the map is hot (1f.7)', () => {
    expect(usableOutOfBattle('SMOKE BALL', 2)).toBe(true);
    expect(usableOutOfBattle('SMOKE BALL', 0)).toBe(false);
    expect(usableOutOfBattle('SODA', 0)).toBe(true); // heals ignore heat
  });

  it('quest: never usable, never sellable', () => {
    expect(usableInBattle('CASE OF COINS')).toBe(false);
    expect(usableOutOfBattle('CASE OF COINS')).toBe(false);
    expect(canSell('CASE OF COINS')).toBe(false);
  });
});

describe('applyHeal', () => {
  it('koffink L5 maxHp is 19 (sanity check for the fixtures below)', () => {
    expect(maxHp(SPECIES.koffink, 5)).toBe(19);
  });

  it('partially heals and returns the amount restored, clamped at max hp', () => {
    const mon = makeMon(SPECIES.koffink, 5); // hp 19
    mon.hp = 5;
    const healed = applyHeal(mon, SPECIES.koffink, ITEMS.SODA); // +20, deficit 14
    expect(healed).toBe(14);
    expect(mon.hp).toBe(19);
  });

  it('is a no-op on a full-hp mon and returns 0', () => {
    const mon = makeMon(SPECIES.koffink, 5); // already at max hp 19
    const healed = applyHeal(mon, SPECIES.koffink, ITEMS.SODA);
    expect(healed).toBe(0);
    expect(mon.hp).toBe(19);
  });

  it('can heal a fainted mon, clamped at max hp', () => {
    const mon = makeMon(SPECIES.koffink, 5); // maxHp 19
    mon.hp = 0;
    const healed = applyHeal(mon, SPECIES.koffink, ITEMS.SODA); // +20, deficit 19
    expect(healed).toBe(19);
    expect(mon.hp).toBe(19);
  });

  it('returns 0 and mutates nothing for a non-heal item', () => {
    const mon = makeMon(SPECIES.koffink, 5);
    mon.hp = 5;
    const healed = applyHeal(mon, SPECIES.koffink, ITEMS[BALL_ITEM]);
    expect(healed).toBe(0);
    expect(mon.hp).toBe(5);
  });
});
