// Phase 1c Playwright spec: SHOP buy/sell, MON LOCKER deposit/withdraw, and
// the PARTY-screen heal-item flow (plan §4.3/§4.5). Follows smoke.spec.ts's
// boot sequence and window.__debug pattern, and chapter1.spec.ts's key
// conventions (A=z, B=x, START=Enter, D-pad=Arrow*), but drives the shop and
// locker modals directly via the dev-only __debug.openShop/openLocker openers
// instead of walking the player there — HQ's held-key tile-chain navigation
// (see chapter1.spec.ts's tapDir comment) is fragile and irrelevant here.
import { test, expect, type Page } from '@playwright/test';
import { bootToWorld } from './boot';

// Matches smoke.spec.ts / chapter1.spec.ts's global Window.__debug
// augmentation exactly — TS requires identical merged member types for a
// property declared across multiple files. Fields this spec needs beyond
// this minimal shape (party/box/coins/items/openShop/openLocker) are read
// through the local DebugFull cast below, the same pattern chapter1.spec.ts
// uses for player.moving via its local PlayerMoving cast.
interface DebugHandle {
  G: { state: string; frame: number; map: { id: string; name: string }; player: { x: number; y: number } };
  quest: { flags: Record<string, boolean> };
}
declare global {
  interface Window {
    __debug: DebugHandle;
  }
}

interface MonInstanceLike {
  species: string;
  lv: number;
  hp: number;
  xp: number;
  moves: string[];
}
interface DebugFull {
  G: {
    state: string;
    party: MonInstanceLike[];
    box: MonInstanceLike[];
  };
  quest: {
    coins: number;
    items: string[];
  };
  openShop: (id: string) => void;
  openLocker: () => void;
}

async function state(page: Page): Promise<string> {
  return page.evaluate(() => window.__debug.G.state);
}
async function questCoinsItems(page: Page): Promise<{ coins: number; items: string[] }> {
  return page.evaluate(() => {
    const d = window.__debug as unknown as DebugFull;
    return { coins: d.quest.coins, items: d.quest.items.slice() };
  });
}
async function partyBoxLengths(page: Page): Promise<{ party: number; box: number }> {
  return page.evaluate(() => {
    const d = window.__debug as unknown as DebugFull;
    return { party: d.G.party.length, box: d.G.box.length };
  });
}

// A: 'z', B: 'x', START: 'Enter', D-pad: Arrow* (src/engine/input.ts KEYMAP).
// Every press is followed by a settle wait so the frame loop processes the
// edge-triggered Input.hit() before the next press, matching smoke/chapter1.
async function press(page: Page, key: string): Promise<void> {
  await page.keyboard.press(key);
  await page.waitForTimeout(300);
}

test('boots to title, plays the intro, lands in ROKKET HQ', async ({ page }) => {
  await bootToWorld(page);
  expect(await state(page)).toBe('world');
});

test('SHOP: buy a ROKKET BALL then sell it back', async ({ page }) => {
  await bootToWorld(page);

  await page.evaluate(() => {
    (window.__debug as unknown as DebugFull).quest.coins = 1000;
  });
  await page.evaluate(() => {
    (window.__debug as unknown as DebugFull).openShop('hqStall');
  });
  await page.waitForFunction(() => window.__debug.G.state === 'shop', undefined, { timeout: 5_000 });

  // root menu BUY(0)/SELL(1)/LEAVE(2), cursor starts on BUY: A enters the buy list
  await press(page, 'z');
  // buy list: ROKKET BALL is stock[0]; A buys it
  await press(page, 'z');

  let qi = await questCoinsItems(page);
  expect(qi.coins).toBe(800);
  expect(qi.items).toContain('ROKKET BALL');

  // B back to root, down to SELL, A to enter the sell list
  await press(page, 'x');
  await press(page, 'ArrowDown');
  await press(page, 'z');
  // the ROKKET BALL just bought is the only sellable item, at sel 0: A sells it
  await press(page, 'z');

  qi = await questCoinsItems(page);
  expect(qi.coins).toBe(900); // 800 + floor(200/2)
  expect(qi.items).not.toContain('ROKKET BALL');

  // B back to root, B again to leave
  await press(page, 'x');
  await press(page, 'x');
  await page.waitForFunction(() => window.__debug.G.state === 'world', undefined, { timeout: 5_000 });
  expect(await state(page)).toBe('world');
});

test('MON LOCKER: withdraw a box mon into the party, then deposit it back', async ({ page }) => {
  await bootToWorld(page);

  await page.evaluate(() => {
    (window.__debug as unknown as DebugFull).G.box.push({
      species: 'voltorbb',
      lv: 3,
      hp: 1,
      xp: 0,
      moves: ['tackle'],
    });
  });
  const before = await partyBoxLengths(page);
  expect(before.party).toBe(1); // the starter KOFFINK

  await page.evaluate(() => {
    (window.__debug as unknown as DebugFull).openLocker();
  });
  await page.waitForFunction(() => window.__debug.G.state === 'locker', undefined, { timeout: 5_000 });

  // locker opens on the PARTY column; switch to BOX, then A to WITHDRAW box[0]
  await press(page, 'ArrowRight');
  await press(page, 'z');

  let pb = await partyBoxLengths(page);
  expect(pb.party).toBe(2);
  expect(pb.box).toBe(0);

  // switch back to PARTY (resets cursor to 0), down to the withdrawn mon
  // (party[1], the last slot), A to DEPOSIT it
  await press(page, 'ArrowLeft');
  await press(page, 'ArrowDown');
  await press(page, 'z');

  pb = await partyBoxLengths(page);
  expect(pb.box).toBe(1);
  expect(pb.party).toBe(1);

  // B to exit
  await press(page, 'x');
  await page.waitForFunction(() => window.__debug.G.state === 'world', undefined, { timeout: 5_000 });
  expect(await state(page)).toBe('world');
});

test('PARTY screen: use a SODA on the injured starter', async ({ page }) => {
  await bootToWorld(page);

  await page.evaluate(() => {
    const d = window.__debug as unknown as DebugFull;
    d.quest.items = ['SODA'];
    d.G.party[0].hp = 1;
  });

  // START opens the pause menu: PACK(0)/PARTY(1)/STATUS(2)/SOUND(3)/HELP(4)/CLOSE(5)
  await press(page, 'Enter');
  await page.waitForFunction(() => window.__debug.G.state === 'menu', undefined, { timeout: 5_000 });

  await press(page, 'ArrowDown'); // -> PARTY
  await press(page, 'z'); // enter the party list
  // MNU.3: A now opens the dex-style detail page (no heal action there) —
  // LEFT opens the heal-item list straight from the list instead.
  await press(page, 'ArrowLeft'); // open the heal-item list ([SODA])
  await press(page, 'z'); // use SODA on the selected mon

  const after = await page.evaluate(() => {
    const d = window.__debug as unknown as DebugFull;
    return { hp: d.G.party[0].hp, items: d.quest.items.slice() };
  });
  expect(after.hp).toBeGreaterThan(1);
  expect(after.hp).toBe(19); // maxHp(koffink, lv5) = floor(2*40*5/100) + 5 + 10 = 19; heal(20) clamps to +18
  expect(after.items).not.toContain('SODA');
});
