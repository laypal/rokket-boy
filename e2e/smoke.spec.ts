// Phase 0 smoke: boot → title → skip the cold open (ONB.8) → HQ visible (plan §3.4).
// Uses the dev-only window.__debug hook; production builds don't expose it.
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

async function state(page: Page): Promise<string> {
  return page.evaluate(() => window.__debug.G.state);
}

test('boots to title, skips the intro, lands in ROKKET HQ', async ({ page }) => {
  await bootToWorld(page);

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

// PKG.4: a faked beforeinstallprompt lights the title line; SELECT prompts.
test('title screen offers the install and SELECT triggers it', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__debug.G.state === 'title', undefined, { timeout: 10_000 });
  // Chromium fires a REAL beforeinstallprompt on localhost — reset() clears
  // it so this test doesn't depend on whether that already landed.
  await page.evaluate(() => window.__debug.install.reset());
  await page.evaluate(() => window.__debug.install.fake());
  // a frame for the line to draw, then SELECT (Shift in the keymap)
  const f0 = await page.evaluate(() => window.__debug.G.frame);
  await page.waitForFunction(([f]) => window.__debug.G.frame >= f + 2, [f0]);
  await page.keyboard.press('Shift');
  await page.waitForFunction(() => window.__debug.install.prompted, undefined, { timeout: 5_000 });
  expect(await state(page)).toBe('title'); // still on the title — prompt is Chrome's sheet, not a state
});
