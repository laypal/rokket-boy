// SIDE.2 Playwright spec: PICKPOCKET at the GAMEZ CORNER's DEALER. Follows
// jobs.spec.ts's conventions: boot via the title/intro sequence, drive the
// modal through the dev-only __debug.openCardFlip opener, assert state
// through __debug (never pixels). State asserts only — the exact seeded
// board (card 0's value) is pinned in the unit suite, not here.
import { test, expect, type Page } from '@playwright/test';

// Matches the shared global Window.__debug augmentation (see
// inventory-1c.spec.ts's comment on merged declaration types).
interface DebugHandle {
  G: { state: string; frame: number; map: { id: string; name: string }; player: { x: number; y: number } };
  quest: { flags: Record<string, boolean> };
}
declare global {
  interface Window {
    __debug: DebugHandle;
  }
}

interface DebugFull {
  G: { state: string };
  quest: { coins: number };
  openCardFlip: (seed?: number) => void;
}

async function press(page: Page, key: string): Promise<void> {
  await page.keyboard.press(key);
  await page.waitForTimeout(300);
}

async function bootToHQ(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('#screen')).toBeVisible();
  await page.waitForFunction(() => window.__debug?.G.state === 'title', undefined, { timeout: 10_000 });
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__debug.G.state === 'intro', undefined, { timeout: 5_000 });
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('z');
    await page.waitForTimeout(300);
  }
  await page.waitForFunction(() => window.__debug.G.state === 'world', undefined, { timeout: 5_000 });
  await page.waitForFunction(() => window.__debug.G.map.id === 'hq', undefined, { timeout: 5_000 });
}

test('PICKPOCKET: deal a hand, flip a card, bag the haul, leave', async ({ page }) => {
  await bootToHQ(page);

  await page.evaluate(() => {
    (window.__debug as unknown as DebugFull).quest.coins = 100;
  });
  await page.evaluate(() => {
    (window.__debug as unknown as DebugFull).openCardFlip(7);
  });
  await page.waitForFunction(() => window.__debug.G.state === 'cardflip', undefined, { timeout: 5_000 });

  // DEAL: stake leaves the wallet, the table opens.
  await press(page, 'z');
  const afterDeal = await page.evaluate(() => (window.__debug as unknown as DebugFull).quest.coins);
  expect(afterDeal).toBe(70);

  // Flip card 0 (the pinned seed's board), then bag whatever haul it left.
  await press(page, 'z');
  await press(page, 'x');
  const afterBag = await page.evaluate(() => (window.__debug as unknown as DebugFull).quest.coins);
  expect(afterBag).toBeGreaterThan(70);

  // Result view: any button returns to the deal screen; from there B leaves.
  await press(page, 'z');
  await press(page, 'x');
  await page.waitForFunction(() => window.__debug.G.state === 'world', undefined, { timeout: 5_000 });
});
