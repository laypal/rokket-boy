// shop.ts (plan §4.5): vendor buy/sell screen. First unit tests for this
// module (HRD.8) — mock setup follows tests/menu.test.ts's harness idiom:
// shop.ts imports renderer/audio/input (canvas/DOM), all stubbed so the
// module runs in vitest's node environment.
import { describe, it, expect, beforeEach } from 'vitest';
import { vi } from 'vitest';

const keys = { pressed: new Set<string>(), held: new Set<string>() };

vi.mock('../src/engine/renderer', () => ({
  drawWindow: vi.fn(),
  text: vi.fn(),
  miniText: vi.fn(),
  // real metrics, not stubs — shop.ts derives its column budget from them
  miniTextW: (s: string): number => (s.length ? s.length * 4 - 1 : 0),
  MINI_W: 4,
  MINI_BASELINE_DY: 2,
  W: 160,
}));
vi.mock('../src/engine/audio', () => ({
  Audio2: { play: vi.fn(), sfx: vi.fn() },
}));
vi.mock('../src/engine/input', () => ({
  Input: {
    held: (k: string): boolean => keys.held.has(k),
    hit: (k: string): boolean => keys.pressed.has(k),
  },
}));

import {
  openShop,
  shopUpdate,
  shopDraw,
  tickHoldBuy,
  HOLD_BUY_DELAY,
  HOLD_BUY_INTERVAL,
  ROW_X,
  COUNT_EDGE,
  PRICE_EDGE,
  COL_GAP,
  type HoldBuyState,
} from '../src/systems/shop';
import { text, miniText, miniTextW, MINI_BASELINE_DY } from '../src/engine/renderer';
import { quest, resetQuest } from '../src/systems/quest';
import { BG_PAL } from '../src/data/palettes';

/** One shopUpdate() frame with the given key registered as freshly pressed. */
function tap(k: string): void {
  keys.pressed.add(k);
  shopUpdate();
  keys.pressed.clear();
}

type DrawCall = [string, number, number, string];
const textCalls = (): DrawCall[] => (text as ReturnType<typeof vi.fn>).mock.calls as DrawCall[];
const miniCalls = (): DrawCall[] => (miniText as ReturnType<typeof vi.fn>).mock.calls as DrawCall[];

/** Renders the current shop screen and returns every string drawn via text(). */
function drawnText(): string[] {
  (text as ReturnType<typeof vi.fn>).mockClear();
  shopDraw(BG_PAL.green);
  return textCalls().map((c) => c[0]);
}

/** Renders and returns every string drawn via miniText() — the count column. */
function drawnMini(): string[] {
  (miniText as ReturnType<typeof vi.fn>).mockClear();
  shopDraw(BG_PAL.green);
  return miniCalls().map((c) => c[0]);
}

beforeEach(() => {
  resetQuest();
  keys.pressed.clear();
  keys.held.clear();
});

describe('buy (HRD.8)', () => {
  it('refuses a buy below price, leaves coins/items untouched, and flashes NOT ENOUGH COINS', () => {
    quest.coins = 10; // ROKKET BALL is 200
    let done = false;
    openShop('hqStall', () => {
      done = true;
    });
    tap('a'); // ROOT: BUY (sel 0)
    tap('a'); // attempt to buy stock[0] = ROKKET BALL
    expect(quest.coins).toBe(10);
    expect(quest.items).toEqual([]);
    expect(drawnText()).toContain('NOT ENOUGH COINS!');
    expect(done).toBe(false); // the shop stays open — no turn/exit on a refusal
  });

  it('a buy at/above price deducts coins and adds the item', () => {
    quest.coins = 200; // exactly ROKKET BALL's price
    openShop('hqStall', () => {});
    tap('a'); // BUY
    tap('a'); // ROKKET BALL
    expect(quest.coins).toBe(0);
    expect(quest.items).toEqual(['ROKKET BALL']);
    expect(drawnText()).toContain('BOUGHT ROKKET BALL!');
  });
});

describe('gear vendor gating (RNK.3)', () => {
  it('GRUNT sees only the ungated-below-AGENT piece: NIGHT VISOR', () => {
    quest.rank = 'GRUNT';
    openShop('blackMarket', () => {});
    tap('a'); // ROOT: BUY
    expect(drawnText()).toContain('NIGHT VISOR');
    expect(drawnText()).not.toContain('HAGGLE HAT');
    expect(drawnText()).not.toContain('UTILITY VEST');
  });

  it('AGENT sees NIGHT VISOR + HAGGLE HAT, not UTILITY VEST', () => {
    quest.rank = 'AGENT';
    openShop('blackMarket', () => {});
    tap('a');
    expect(drawnText()).toContain('NIGHT VISOR');
    expect(drawnText()).toContain('HAGGLE HAT');
    expect(drawnText()).not.toContain('UTILITY VEST');
  });

  it('OPERATIVE (and above) sees all three pieces', () => {
    quest.rank = 'OPERATIVE';
    openShop('blackMarket', () => {});
    tap('a');
    const drawn = drawnText();
    expect(drawn).toContain('NIGHT VISOR');
    expect(drawn).toContain('HAGGLE HAT');
    expect(drawn).toContain('UTILITY VEST');
  });

  it('an unrecognised (corrupt) rank reads as GRUNT — only NIGHT VISOR shows', () => {
    quest.rank = 'CORRUPTED';
    openShop('blackMarket', () => {});
    tap('a');
    const drawn = drawnText();
    expect(drawn).toContain('NIGHT VISOR');
    expect(drawn).not.toContain('HAGGLE HAT');
    expect(drawn).not.toContain('UTILITY VEST');
  });

  it('a hidden row can never be selected or bought: cursor input is bounded to the visible list', () => {
    quest.rank = 'GRUNT'; // only 1 visible row, though blackMarket.stock has 3
    quest.coins = 4000;
    openShop('blackMarket', () => {});
    tap('a'); // BUY
    tap('down'); // would move to row 1 if the hidden rows counted
    tap('down');
    tap('a'); // buy whatever the cursor landed on
    // GRUNT can only ever buy NIGHT VISOR — never a hidden HAGGLE HAT/VEST
    expect(quest.items).toEqual(['NIGHT VISOR']);
  });

  it('buying a gated item charges buyPrice, discounted by an active shop perk', () => {
    quest.rank = 'OPERATIVE'; // rank-inherent shop perk: -10% (perks.ts)
    quest.coins = 5000;
    openShop('blackMarket', () => {});
    tap('a'); // BUY
    tap('down'); // NIGHT VISOR -> HAGGLE HAT
    tap('a'); // buy HAGGLE HAT (3500 base)
    expect(quest.coins).toBe(5000 - Math.floor(3500 * 0.9)); // 5000 - 3150 = 1850
    expect(quest.items).toEqual(['HAGGLE HAT']);
  });
});

describe('sell — last item + cursor clamp (HRD.8)', () => {
  it('selling the item at the last cursor row clamps the cursor instead of indexing past the shrunk list', () => {
    quest.items = ['SODA', 'SODA', 'ROKKET BALL']; // sellList(): [SODA x2, ROKKET BALL x1]
    openShop('hqStall', () => {});
    tap('down'); // ROOT: sel 0→1 = SELL
    tap('a'); // enter sell mode (sel resets to 0)
    tap('down'); // sel 0→1 = ROKKET BALL, the LAST row of a 2-row list
    tap('a'); // sell it — the list shrinks to 1 row (SODA only)
    expect(quest.items).toEqual(['SODA', 'SODA']);
    expect(quest.coins).toBe(100); // sellPrice(ROKKET BALL) = floor(200/2)
    // the cursor must have clamped to the new last valid row (0), not stayed
    // at the now out-of-bounds row 1 — proven by a second sell landing on
    // SODA (the only row left) instead of silently no-oping past the end.
    tap('a');
    expect(quest.items).toEqual(['SODA']);
    expect(quest.coins).toBe(100 + 30); // sellPrice(SODA) = floor(60/2)
  });

  it('an empty sell list flashes NOTHING TO SELL and touches nothing', () => {
    quest.items = [];
    openShop('hqStall', () => {});
    tap('down'); // SELL
    tap('a');
    tap('a'); // attempt to sell with nothing sellable
    expect(quest.coins).toBe(0);
    expect(drawnText()).toContain('NOTHING TO SELL.');
  });
});

describe('FLW.3: hold-to-buy repeat timer (pure state)', () => {
  it('pins the frozen cadence constants', () => {
    expect(HOLD_BUY_DELAY).toBe(30);
    expect(HOLD_BUY_INTERVAL).toBe(8);
  });

  it('never fires while released, and touching it while released keeps heldT at 0', () => {
    const s: HoldBuyState = { heldT: 0, blocked: false };
    expect(tickHoldBuy(s, false)).toBe(false);
    expect(s.heldT).toBe(0);
  });

  it('does not fire before the initial delay', () => {
    const s: HoldBuyState = { heldT: 0, blocked: false };
    for (let f = 0; f < HOLD_BUY_DELAY - 1; f++) {
      expect(tickHoldBuy(s, true)).toBe(false);
    }
    expect(s.heldT).toBe(HOLD_BUY_DELAY - 1);
  });

  it('fires on the delay frame, then every interval after — held N frames = the documented count', () => {
    const s: HoldBuyState = { heldT: 0, blocked: false };
    const fires: number[] = [];
    for (let f = 1; f <= HOLD_BUY_DELAY + HOLD_BUY_INTERVAL * 3; f++) {
      if (tickHoldBuy(s, true)) fires.push(f);
    }
    expect(fires).toEqual([
      HOLD_BUY_DELAY,
      HOLD_BUY_DELAY + HOLD_BUY_INTERVAL,
      HOLD_BUY_DELAY + HOLD_BUY_INTERVAL * 2,
      HOLD_BUY_DELAY + HOLD_BUY_INTERVAL * 3,
    ]);
  });

  it('release resets heldT completely — no partial credit toward the next hold', () => {
    const s: HoldBuyState = { heldT: 0, blocked: false };
    for (let f = 0; f < HOLD_BUY_DELAY; f++) tickHoldBuy(s, true);
    expect(s.heldT).toBe(HOLD_BUY_DELAY);
    tickHoldBuy(s, false); // release
    expect(s.heldT).toBe(0);
    // held again from scratch — needs the FULL delay again, not a shortcut
    for (let f = 0; f < HOLD_BUY_DELAY - 1; f++) {
      expect(tickHoldBuy(s, true)).toBe(false);
    }
    expect(tickHoldBuy(s, true)).toBe(true);
  });

  it('once blocked, stays inert every subsequent tick until release (a refusal blocks further repeats)', () => {
    const s: HoldBuyState = { heldT: 0, blocked: false };
    for (let f = 0; f < HOLD_BUY_DELAY; f++) tickHoldBuy(s, true); // fires on frame 30
    s.blocked = true; // the caller sets this when its own afford check fails
    for (let f = 0; f < HOLD_BUY_INTERVAL * 3; f++) {
      expect(tickHoldBuy(s, true)).toBe(false); // never fires again while blocked
    }
    tickHoldBuy(s, false); // release clears the block
    expect(s.blocked).toBe(false);
  });

  it('a hold carried through the BUY confirm never repeats — only a hold begun on an item row buys', () => {
    quest.coins = 10000;
    openShop('hqStall', () => {});
    // Press A on the root BUY row and KEEP it down through the confirm.
    keys.held.add('a');
    keys.pressed.add('a');
    shopUpdate(); // enters buy mode; the entering press must not seed a hold
    keys.pressed.delete('a');
    for (let f = 0; f < HOLD_BUY_DELAY + HOLD_BUY_INTERVAL * 3; f++) shopUpdate();
    expect(quest.items).toEqual([]); // nothing auto-bought without a press on an item

    // Release, then a genuine press-and-hold on the item row works normally.
    keys.held.delete('a');
    shopUpdate(); // the release frame clears the block
    keys.held.add('a');
    keys.pressed.add('a');
    shopUpdate(); // plain press: buys exactly one
    keys.pressed.delete('a');
    expect(quest.items).toHaveLength(1);
    for (let f = 2; f <= HOLD_BUY_DELAY; f++) shopUpdate();
    expect(quest.items).toHaveLength(2); // the armed hold repeats on schedule
  });
});

describe('FLW.3: owned-count column (stackables only, gear excluded)', () => {
  it('gear rows never draw anything in the count column — blackMarket stock is all gear', () => {
    quest.rank = 'OPERATIVE'; // see every gated row
    quest.items = ['NIGHT VISOR']; // owned already, to prove omission isn't just "count is 0"
    openShop('blackMarket', () => {});
    tap('a'); // BUY
    expect(drawnMini()).toEqual([]);
  });

  it('a stackable row draws "x" + owned count in mini numerals, right-aligned at COUNT_EDGE on the cap baseline', () => {
    quest.items = ['SODA'];
    openShop('hqStall', () => {}); // stock: [ROKKET BALL, SODA]
    tap('a'); // BUY
    drawnMini();
    const sodaRowY = 34 + 1 * 18; // SODA is stock[1]
    const countCall = miniCalls().find((c) => c[2] === sodaRowY + MINI_BASELINE_DY);
    expect(countCall?.[0]).toBe('x1');
    expect(countCall?.[1]).toBe(COUNT_EDGE - miniTextW('x1'));
  });

  it('a successful stackable buy flashes +1 in the count column (mini font)', () => {
    quest.coins = 10000;
    openShop('hqStall', () => {});
    tap('a'); // BUY, ROKKET BALL selected
    tap('a'); // buy it
    expect(drawnMini()).toContain('+1');
    expect(drawnText()).not.toContain('+1'); // never in the main font — it would not fit the column
  });

  it('a gear buy never flashes +1 — there is no count column to flash', () => {
    quest.coins = 10000;
    openShop('blackMarket', () => {});
    tap('a'); // BUY, NIGHT VISOR selected
    tap('a'); // buy it
    expect(drawnMini()).not.toContain('+1');
    expect(drawnText()).not.toContain('+1');
  });
});

describe('FLW.3 follow-up: three real columns — label / owned / price — at the worst row', () => {
  // The row Lyall's screenshots caught: ROKKET BALL is the longest stackable
  // label (11 chars = the cap), so every column gap is at its minimum here.
  // Both lists must lay it out identically: label at ROW_X, count mini and
  // right-aligned at COUNT_EDGE, price right-aligned at PRICE_EDGE, with at
  // least COL_GAP ink-free pixels between neighbours.
  function rowAt(y: number): { label?: DrawCall; count?: DrawCall; price?: DrawCall } {
    const row = textCalls().filter((c) => c[2] === y);
    return {
      label: row.find((c) => c[0] === 'ROKKET BALL'),
      price: row.find((c) => c[0].startsWith('$')),
      count: miniCalls().find((c) => c[2] === y + MINI_BASELINE_DY),
    };
  }

  function expectThreeColumns(y: number, count: string, price: string): void {
    const r = rowAt(y);
    expect(r.label?.[1]).toBe(ROW_X);
    expect(r.count?.[0]).toBe(count);
    expect(r.count?.[1]).toBe(COUNT_EDGE - miniTextW(count));
    expect(r.price?.[0]).toBe(price);
    expect(r.price?.[1]).toBe(PRICE_EDGE - price.length * 8);
    // gaps: label cell end -> count start, count end -> price start
    const labelEnd = ROW_X + 'ROKKET BALL'.length * 8;
    expect(r.count![1] - labelEnd).toBeGreaterThanOrEqual(COL_GAP);
    expect(r.price![1] - COUNT_EDGE).toBeGreaterThanOrEqual(COL_GAP);
  }

  it('BUY: ROKKET BALL x17 $200', () => {
    quest.items = Array(17).fill('ROKKET BALL');
    openShop('hqStall', () => {}); // stock[0] = ROKKET BALL
    tap('a'); // BUY
    (text as ReturnType<typeof vi.fn>).mockClear();
    (miniText as ReturnType<typeof vi.fn>).mockClear();
    shopDraw(BG_PAL.green);
    expectThreeColumns(34, 'x17', '$200');
  });

  it('SELL: ROKKET BALL x16 $100 — the count no longer sits on top of the label or the price', () => {
    quest.items = Array(16).fill('ROKKET BALL');
    openShop('hqStall', () => {});
    tap('down'); // SELL
    tap('a');
    (text as ReturnType<typeof vi.fn>).mockClear();
    (miniText as ReturnType<typeof vi.fn>).mockClear();
    shopDraw(BG_PAL.green);
    expectThreeColumns(34, 'x16', '$100');
  });

  it('a 2-digit count at the cap still clears both neighbours: x99', () => {
    quest.items = Array(99).fill('ROKKET BALL');
    openShop('hqStall', () => {});
    tap('a');
    (text as ReturnType<typeof vi.fn>).mockClear();
    (miniText as ReturnType<typeof vi.fn>).mockClear();
    shopDraw(BG_PAL.green);
    expectThreeColumns(34, 'x99', '$200');
  });
});

describe('FLW.3: BDD — 200 coins and one SODA', () => {
  it('shows the owned count on open; holding A repeats the buy at the documented rate and stops the instant coins run out', () => {
    quest.coins = 200;
    quest.items = ['SODA']; // 1 already held; SODA costs 60
    openShop('hqStall', () => {});
    tap('a'); // ROOT -> BUY
    tap('down'); // ROKKET BALL -> SODA row
    expect(drawnMini()).toContain('x1'); // owned count shown before any purchase

    // Press and hold A.
    keys.held.add('a');
    keys.pressed.add('a');
    shopUpdate(); // frame 1: the plain press — buys exactly one (SODA #2)
    keys.pressed.delete('a');
    expect(quest.items.filter((i) => i === 'SODA').length).toBe(2);
    expect(quest.coins).toBe(140);

    for (let f = 2; f <= HOLD_BUY_DELAY; f++) shopUpdate(); // hold through the initial delay
    // first repeat fires exactly on frame HOLD_BUY_DELAY (SODA #3)
    expect(quest.items.filter((i) => i === 'SODA').length).toBe(3);
    expect(quest.coins).toBe(80);

    for (let f = 1; f <= HOLD_BUY_INTERVAL; f++) shopUpdate(); // next interval (SODA #4)
    expect(quest.items.filter((i) => i === 'SODA').length).toBe(4);
    expect(quest.coins).toBe(20);

    for (let f = 1; f <= HOLD_BUY_INTERVAL; f++) shopUpdate(); // next interval refuses — 20 coins can't cover 60
    expect(quest.items.filter((i) => i === 'SODA').length).toBe(4); // unchanged
    expect(quest.coins).toBe(20);
    expect(drawnText()).toContain('NOT ENOUGH COINS!');

    // still held — further frames must NOT keep re-attempting (refusal blocks repeats)
    for (let f = 1; f <= HOLD_BUY_INTERVAL * 2; f++) shopUpdate();
    expect(quest.coins).toBe(20);
    expect(quest.items.filter((i) => i === 'SODA').length).toBe(4);

    keys.held.delete('a');
    shopUpdate(); // release
  });
});
