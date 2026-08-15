// Phase 0 smoke: boot → title → intro → HQ visible (plan §3.4).
// Uses the dev-only window.__debug hook; production builds don't expose it.
import { test, expect, type Page } from '@playwright/test';

interface DebugHandle {
  G: { state: string; frame: number; map: { id: string; name: string }; player: { x: number; y: number } };
  quest: { flags: Record<string, boolean> };
}
declare global {
  interface Window {
    __debug: DebugHandle;
  }
}

async function state(page: Page): Promise<string> {
  return page.evaluate(() => window.__debug.G.state);
}

test('boots to title, plays the intro, lands in ROKKET HQ', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#screen')).toBeVisible();

  // boot rolls into title after ~90 frames
  await page.waitForFunction(() => window.__debug?.G.state === 'title', undefined, { timeout: 10_000 });

  // START → intro
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__debug.G.state === 'intro', undefined, { timeout: 5_000 });

  // three intro pages, A each
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('z');
    await page.waitForTimeout(300);
  }
  await page.waitForFunction(() => window.__debug.G.state === 'world', undefined, { timeout: 5_000 });

  const g = await page.evaluate(() => ({
    map: window.__debug.G.map.id,
    name: window.__debug.G.map.name,
    x: window.__debug.G.player.x,
    y: window.__debug.G.player.y,
  }));
  expect(g.map).toBe('hq');
  expect(g.name).toBe('ROKKET HQ B1F');
  expect(g).toMatchObject({ x: 9, y: 7 });

  // canvas is non-blank: some pixel differs from black
  const nonBlank = await page.evaluate(() => {
    const c = document.getElementById('screen') as HTMLCanvasElement;
    const d = c.getContext('2d')!.getImageData(0, 0, 160, 144).data;
    for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 30) return true;
    return false;
  });
  expect(nonBlank).toBe(true);

  expect(await state(page)).toBe('world');
});
