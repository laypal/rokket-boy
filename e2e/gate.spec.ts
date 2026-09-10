// F42 GATE.1 Playwright spec: the CH2 cave mouth is visible but shut until
// the CH1 job is handed in. Walks the real route with NO ch1 flags seeded
// (the one spec that deliberately doesn't), then flips `missionDone` and
// takes the same step again. Helpers copied from chapter2.spec.ts per this
// repo's per-spec-file convention.
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

interface PlayerMoving {
  moving: boolean;
}
interface DebugFull {
  quest: { flags: Record<string, boolean> };
  noEncounters: () => void;
}

type ArrowKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';

async function tapDir(page: Page, key: ArrowKey, timeout = 2_000): Promise<void> {
  await page.keyboard.down(key);
  await page
    .waitForFunction(() => (window.__debug.G.player as unknown as PlayerMoving).moving, undefined, { timeout })
    .catch(() => undefined);
  await page.keyboard.up(key);
  await page
    .waitForFunction(() => !(window.__debug.G.player as unknown as PlayerMoving).moving, undefined, { timeout })
    .catch(() => undefined);
}

async function walk(page: Page, key: ArrowKey, steps: number, x: number, y: number): Promise<void> {
  for (let i = 0; i < steps; i++) await tapDir(page, key);
  await page.waitForFunction(
    ([tx, ty]) => window.__debug.G.player.x === tx && window.__debug.G.player.y === ty,
    [x, y],
    { timeout: 3_000 },
  );
}

async function waitForMap(page: Page, id: string, timeout = 8_000): Promise<void> {
  await page.waitForFunction(
    (mapId) => window.__debug.G.map.id === mapId && window.__debug.G.state === 'world',
    id,
    { timeout },
  );
}

test('F42: the MT. MOON door is seen but shut until CH1 is handed in', async ({ page }) => {
  test.setTimeout(90_000);
  await bootToWorld(page);
  await page.evaluate(() => (window.__debug as unknown as DebugFull).noEncounters());

  // HQ (9,7) → GAMEZ CORNER, then chapter2's validated leg to the cave mouth
  await walk(page, 'ArrowDown', 6, 9, 13);
  await waitForMap(page, 'corner');
  await walk(page, 'ArrowRight', 9, 18, 2);
  await walk(page, 'ArrowDown', 5, 18, 7);

  // the gate: the step lands ON the door tile and goes no further
  await walk(page, 'ArrowRight', 1, 19, 7);
  expect(await page.evaluate(() => window.__debug.G.map.id)).toBe('corner');
  expect(await page.evaluate(() => window.__debug.G.state)).toBe('world');
  expect(await page.evaluate(() => window.__debug.quest.flags.missionDone)).toBeFalsy();

  // hand the job in (flag only — this spec is about the door, not CH1) and
  // take the same step again: off the tile, back onto it, and it warps
  await page.evaluate(() => ((window.__debug as unknown as DebugFull).quest.flags.missionDone = true));
  await walk(page, 'ArrowLeft', 1, 18, 7);
  await tapDir(page, 'ArrowRight');
  await waitForMap(page, 'moon1');
});
