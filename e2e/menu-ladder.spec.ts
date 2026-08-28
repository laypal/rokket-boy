// RNK.2 Playwright spec (closes F16's MNU.5): the rank ladder window opened
// from the STATUS sub-screen's RANK row. Follows quest-1e.spec.ts's boot +
// openStatus helpers and its key/settle conventions — A='z', B='x',
// START='Enter', D-pad=Arrow* (src/engine/input.ts KEYMAP).
//
// State-assertion note (doc 03 rule #3 — no pixel/canvas-text assertions):
// the ladder's own open/closed flag and cursor position are internal to
// src/systems/rankLadder.ts and are NOT threaded onto window.__debug (that
// hook lives in src/main.ts, out of this card's file scope — see the
// worker report). Per the frozen contract, m.sub stays 'status' the whole
// time the ladder is open, so "ladder open" is asserted the same way the
// contract itself defines it: it costs one extra B press to leave STATUS
// while the ladder is in the way. Without the ladder, STATUS -> world is
// exactly 2 B presses (quest-1e.spec.ts); with the ladder opened once, it
// is 3 — the first B closes the ladder and lands back on STATUS (m.sub
// still 'status', not the world), the second leaves the sub-screen, the
// third closes the pause menu. That count IS the "B returns to STATUS not
// the world" acceptance criterion, proven through real state, not pixels.
// Row content (tags/footer per rung) is unit-tested in tests/rankLadder.
// test.ts via mocked text() calls, which pixel-free e2e cannot check anyway.
import { test, expect, type Page } from '@playwright/test';
import { bootToWorld } from './boot';

interface DebugHandle {
  G: { state: string; frame: number; map: { id: string; name: string }; player: { x: number; y: number } };
  quest: { flags: Record<string, boolean> };
  install: { prompted: boolean; fake(): void; reset(): void };
}
declare global {
  interface Window {
    __debug: DebugHandle;
  }
}

interface DebugFull {
  G: {
    state: string;
    endT: number;
    rankCard: { rank: string } | null;
    menu: { sub: string | null; sel: number; items: string[] } | null;
  };
  quest: { rank: string };
  rankUp: () => void;
}

async function press(page: Page, key: string): Promise<void> {
  await page.keyboard.press(key);
  await page.waitForTimeout(300);
}

// Open the pause menu and land on the STATUS sub-screen, statusNav.sel reset
// to 0 (the RANK row) — same helper/order as quest-1e.spec.ts's openStatus.
async function openStatus(page: Page): Promise<void> {
  await press(page, 'Enter');
  await page.waitForFunction(() => window.__debug.G.state === 'menu', undefined, { timeout: 5_000 });
  await press(page, 'ArrowDown');
  await press(page, 'ArrowDown');
  await press(page, 'z'); // -> STATUS sub-screen
}

async function menuSub(page: Page): Promise<string | null> {
  return page.evaluate(() => (window.__debug as unknown as DebugFull).G.menu?.sub ?? null);
}

test('A on the RANK row opens the ladder; B returns to STATUS, not the world', async ({ page }) => {
  await bootToWorld(page);
  await openStatus(page);
  expect(await page.evaluate(() => window.__debug.G.state)).toBe('menu');
  expect(await menuSub(page)).toBe('status');

  await press(page, 'z'); // A on RANK row (sel 0) -> opens the ladder
  expect(await page.evaluate(() => window.__debug.G.state)).toBe('menu');
  expect(await menuSub(page)).toBe('status'); // frozen contract: m.sub stays 'status'

  await press(page, 'ArrowDown'); // the ladder's own cursor nav must not crash the state machine
  expect(await page.evaluate(() => window.__debug.G.state)).toBe('menu');
  expect(await menuSub(page)).toBe('status');

  await press(page, 'x'); // B #1: closes the ladder, lands on STATUS (not the world)
  expect(await page.evaluate(() => window.__debug.G.state)).toBe('menu');
  expect(await menuSub(page)).toBe('status');

  await press(page, 'x'); // B #2: now the plain STATUS B — leaves the sub-screen
  expect(await menuSub(page)).toBeNull();
  expect(await page.evaluate(() => window.__debug.G.state)).toBe('menu');

  await press(page, 'x'); // B #3: closes the pause menu entirely
  await page.waitForFunction(() => window.__debug.G.state === 'world', undefined, { timeout: 5_000 });
});

test('A on a different STATUS row does not open the ladder (sel !== 0)', async ({ page }) => {
  await bootToWorld(page);
  await openStatus(page); // sel 0 = RANK row
  await press(page, 'ArrowDown'); // RANK -> JOB, sel 1
  await press(page, 'z'); // A on JOB row -> no-op (unchanged pre-RNK.2 behaviour)

  // With no ladder in the way, STATUS -> world is exactly 2 B presses,
  // matching quest-1e.spec.ts's baseline — proving the ladder never opened.
  await press(page, 'x');
  expect(await menuSub(page)).toBeNull();
  await press(page, 'x');
  await page.waitForFunction(() => window.__debug.G.state === 'world', undefined, { timeout: 5_000 });
});

test('the ladder still opens cleanly after a real rankUp() promotion', async ({ page }) => {
  await bootToWorld(page);

  // Promote via the real script-interpreter path (same __debug.rankUp()
  // precedent as quest-1e.spec.ts), dismiss the rank card, then re-open
  // STATUS and the ladder at the new rank.
  await page.evaluate(() => (window.__debug as unknown as DebugFull).rankUp());
  await page.waitForFunction(() => window.__debug.G.state === 'rankcard', undefined, { timeout: 5_000 });
  await page.waitForFunction(() => (window.__debug as unknown as DebugFull).G.endT > 60, undefined, {
    timeout: 5_000,
  });
  await press(page, 'z'); // dismiss the rank card
  await page.waitForFunction(() => window.__debug.G.state === 'world', undefined, { timeout: 5_000 });
  expect(await page.evaluate(() => (window.__debug as unknown as DebugFull).quest.rank)).toBe('AGENT');

  await openStatus(page);
  await press(page, 'z'); // A on RANK row -> opens the ladder at rank AGENT
  expect(await menuSub(page)).toBe('status');

  await press(page, 'x'); // B #1: closes the ladder, back on STATUS
  expect(await menuSub(page)).toBe('status');
  await press(page, 'x'); // B #2: leaves the sub-screen
  expect(await menuSub(page)).toBeNull();
});
