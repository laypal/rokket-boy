// shop.ts (plan §4.5): vendor buy/sell screen. First unit tests for this
// module (HRD.8) — mock setup follows tests/menu.test.ts's harness idiom:
// shop.ts imports renderer/audio/input (canvas/DOM), all stubbed so the
// module runs in vitest's node environment.
import { describe, it, expect, beforeEach } from 'vitest';
import { vi } from 'vitest';

const keys = { pressed: new Set<string>() };

vi.mock('../src/engine/renderer', () => ({
  drawWindow: vi.fn(),
  text: vi.fn(),
  W: 160,
}));
vi.mock('../src/engine/audio', () => ({
  Audio2: { play: vi.fn(), sfx: vi.fn() },
}));
vi.mock('../src/engine/input', () => ({
  Input: {
    held: (): boolean => false,
    hit: (k: string): boolean => keys.pressed.has(k),
  },
}));

import { openShop, shopUpdate, shopDraw } from '../src/systems/shop';
import { text } from '../src/engine/renderer';
import { quest, resetQuest } from '../src/systems/quest';
import { BG_PAL } from '../src/data/palettes';

/** One shopUpdate() frame with the given key registered as freshly pressed. */
function tap(k: string): void {
  keys.pressed.add(k);
  shopUpdate();
  keys.pressed.clear();
}

/** Renders the current shop screen and returns every string drawn via text(). */
function drawnText(): string[] {
  (text as ReturnType<typeof vi.fn>).mockClear();
  shopDraw(BG_PAL.green);
  return (text as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0] as string);
}

beforeEach(() => {
  resetQuest();
  keys.pressed.clear();
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
