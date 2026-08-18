// ONB.8: the single boot path every spec uses. Before this, twelve files
// each hard-coded "press A three times" and the intro's card count was a
// shared secret. START skips the whole cinematic, so the sequence is one
// keypress regardless of how long the cold open gets.
import { expect, type Page } from '@playwright/test';

// Same shape as every spec's local DebugHandle — TS requires identical
// merged member types for a property declared across files.
interface DebugHandle {
  G: { state: string; frame: number; map: { id: string; name: string }; player: { x: number; y: number } };
  quest: { flags: Record<string, boolean> };
}
declare global {
  interface Window {
    __debug: DebugHandle;
  }
}

/** title → skip the cold open → world at HQ, with any opening dialog closed.
 *  Assumes the page is already sitting on the title screen — callers that
 *  are booting fresh use bootToWorld below; callers resuming after their own
 *  `page.reload()` call this directly once title is back up. Needs NO save
 *  in storage: with one, START opens the CONTINUE/NEW GAME chooser instead
 *  of the intro and the first wait times out. */
export async function startNewGame(page: Page): Promise<void> {
  await page.keyboard.press('Enter'); // START → intro
  await page.waitForFunction(() => window.__debug.G.state === 'intro', undefined, { timeout: 5_000 });
  await page.keyboard.press('Enter'); // START → skip
  await page.waitForFunction(() => window.__debug.G.state === 'world', undefined, { timeout: 10_000 });
  await page.waitForFunction(() => window.__debug.G.map.id === 'hq', undefined, { timeout: 5_000 });

  // endIntro() (scenes.ts) flips G.state to 'world' from inside the fade's
  // afterFade callback, at the frame the screen-covering shutter (renderer.ts
  // drawFade) is at its darkest — it then takes ~9 more frames to lift.
  // Settle by frame count, not wall clock, so this never races real load.
  const f0 = await page.evaluate(() => window.__debug.G.frame);
  await page.waitForFunction(([f]) => window.__debug.G.frame >= f + 12, [f0], { timeout: 5_000 });

  // The HQ enter script opens Giovanni's opening line (src/data/dialog/hq.ts).
  // Close it, bounded, so a spec never starts mid-dialog and a hang never
  // looks like a pass. Ten presses is far more pages than that script has.
  const dialogOpen = (): Promise<boolean> =>
    page.evaluate(() => !!(window.__debug as unknown as { G: { dialog: unknown } }).G.dialog);
  for (let i = 0; i < 10 && (await dialogOpen()); i++) {
    await page.keyboard.press('z');
    await page.waitForTimeout(120);
  }
  await page.waitForFunction(
    () => !(window.__debug as unknown as { G: { dialog: unknown } }).G.dialog,
    undefined,
    { timeout: 5_000 },
  );
}

/** boot → title → skip the cold open → world at HQ, with any opening dialog
 *  closed. */
export async function bootToWorld(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('#screen')).toBeVisible();

  await page.waitForFunction(() => window.__debug?.G.state === 'title', undefined, { timeout: 10_000 });
  await startNewGame(page);
}
