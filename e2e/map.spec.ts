// F44 Playwright spec: START → MAP opens the world on the player's region;
// A drills into the plant; walking grows the seen count; A cycles floors
// only when more than one is visited; B×2 returns to the menu column.
// State only, never pixels (doc 03 rule #3); the playtester owns the
// pixels. Cursor/mode read through the read-only __debug getters.
import { test, expect, type Page } from '@playwright/test';
import { bootToWorld } from './boot';

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
  G: { state: string; map: { id: string }; menu: { sub: string | null } | null };
  quest: { visited: Set<string>; seen: Record<string, Uint8Array> };
  ch7: () => void;
  mapCursor: () => string | null;
  mapMode: () => string | null;
  mapDetailMap: () => string | null;
}
const D = (page: Page) => page.evaluate(() => {
  const d = window.__debug as unknown as DebugFull;
  return { cursor: d.mapCursor(), mode: d.mapMode(), map: d.mapDetailMap(), sub: d.G.menu?.sub ?? null };
});
const seenBits = (page: Page, id: string) => page.evaluate((m) => {
  const s = (window.__debug as unknown as DebugFull).quest.seen[m];
  let n = 0; for (const b of s ?? []) for (let k = 0; k < 8; k++) if (b & (1 << k)) n++;
  return n;
}, id);
async function press(page: Page, key: string): Promise<void> { await page.keyboard.press(key); await page.waitForTimeout(300); }
async function walk(page: Page, key: string): Promise<void> { await page.keyboard.down(key); await page.waitForTimeout(450); await page.keyboard.up(key); await page.waitForTimeout(200); }

test('world → detail → seen grows → back', async ({ page }) => {
  await bootToWorld(page);
  await page.evaluate(() => (window.__debug as unknown as DebugFull).ch7());
  await page.waitForFunction(() => window.__debug.G.map.id === 'plant1' && window.__debug.G.state === 'world', undefined, { timeout: 10_000 });
  const before = await seenBits(page, 'plant1');
  expect(before).toBeGreaterThan(0); // landAt marked the ring

  await press(page, 'Enter');
  await page.waitForFunction(() => window.__debug.G.state === 'menu', undefined, { timeout: 5_000 });
  for (let i = 0; i < 3; i++) await press(page, 'ArrowDown'); // PACK → PARTY → STATUS → MAP
  await press(page, 'z');
  expect(await D(page)).toMatchObject({ sub: 'map', mode: 'world', cursor: 'plant' });

  await press(page, 'ArrowLeft'); // black regions skipped → HQ
  expect((await D(page)).cursor).toBe('hq');
  await press(page, 'ArrowRight');
  expect((await D(page)).cursor).toBe('plant');

  await press(page, 'z'); // drill in
  expect(await D(page)).toMatchObject({ mode: 'detail', map: 'plant1' });
  await press(page, 'z'); // only plant1 is visited → no floor change
  expect((await D(page)).map).toBe('plant1');
  await press(page, 'x'); // back to the world
  expect((await D(page)).mode).toBe('world');
  await press(page, 'x'); // close the map
  expect((await D(page)).sub).toBeNull();
  await press(page, 'x');
  await page.waitForFunction(() => window.__debug.G.state === 'world', undefined, { timeout: 5_000 });

  // West (8,10) is blocked by Myowth (present until ch7Rules) — east is open
  // floor up to the sign at (11,10).
  await walk(page, 'ArrowRight');
  const after = await seenBits(page, 'plant1');
  expect(after).toBeGreaterThan(before);
});
