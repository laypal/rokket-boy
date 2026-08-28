// Phase 1f Playwright spec (card 1f.8, plan §4.8): the HEAT alarm system
// driven entirely through the dev-only window.__debug hook — setHeat(n) runs
// `[{ heat: n }]` through the real script interpreter + worldHooks (same
// precedent as __debug.rankUp in quest-1e.spec.ts), and advanceTime(s) only
// bumps G.playSeconds; the running loop's next worldUpdate tick applies decay
// and lockdown expiry (src/systems/world.ts's heatTick). No wall-clock
// sleeps — advanceTime exists precisely so this spec never waits real
// seconds, and no assertion reads rendered pixels (the countdown/`!` overlay
// are draw-only, left to manual playtest per the 1f.6 card).
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

// Fields this spec needs beyond the shared minimal DebugHandle shape (heat
// runtime, playSeconds, coins, and the two 1f.8 debug entries) — read
// through this local cast, same pattern as quest-1e.spec.ts's DebugFull.
interface DebugFull {
  G: {
    state: string;
    map: { id: string };
    playSeconds: number;
    heatState: Partial<Record<string, { stage: number; decayAt: number; lockdownAt: number | null }>>;
  };
  quest: { coins: number };
  setHeat: (n: number) => void;
  advanceTime: (s: number) => void;
}

// One tile: press, wait for the move to start, release before it finishes —
// avoids the held-key tile-chain race (doc 03), same tapDir/walk approach as
// chapter1.spec.ts.
async function tapDir(page: Page, key: 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight', timeout = 2_000): Promise<void> {
  await page.keyboard.down(key);
  await page
    .waitForFunction(() => (window.__debug.G.player as unknown as { moving: boolean }).moving, undefined, {
      timeout,
    })
    .catch(() => undefined);
  await page.keyboard.up(key);
  await page
    .waitForFunction(() => !(window.__debug.G.player as unknown as { moving: boolean }).moving, undefined, {
      timeout,
    })
    .catch(() => undefined);
}

async function walk(
  page: Page,
  key: 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight',
  steps: number,
): Promise<void> {
  for (let i = 0; i < steps; i++) await tapDir(page, key);
}

test('setHeat(3) arms the lockdown and warp escape clears it', async ({ page }) => {
  await bootToWorld(page);

  await page.evaluate(() => (window.__debug as unknown as DebugFull).setHeat(3));

  const armed = await page.evaluate(() => {
    const d = window.__debug as unknown as DebugFull;
    return d.G.heatState[d.G.map.id] ?? null;
  });
  expect(armed).not.toBeNull();
  expect(armed?.stage).toBe(3);
  expect(armed?.lockdownAt).not.toBeNull();

  // spawn (9,7) -> HQ exit doors at (9,13)/(10,13), 6 tiles down (chapter1.spec.ts).
  await walk(page, 'ArrowDown', 6);

  await page.waitForFunction(
    () => window.__debug.G.map.id !== 'hq' && window.__debug.G.state === 'world',
    undefined,
    { timeout: 8_000 },
  );

  const afterWarp = await page.evaluate(() => (window.__debug as unknown as DebugFull).G.heatState.hq);
  expect(afterWarp).toBeUndefined();
});

test('expired lockdown whites out to HQ with the 10% coin cut', async ({ page }) => {
  await bootToWorld(page);

  await page.evaluate(() => {
    (window.__debug as unknown as DebugFull).quest.coins = 100;
  });

  await page.evaluate(() => (window.__debug as unknown as DebugFull).setHeat(3));
  await page.evaluate(() => (window.__debug as unknown as DebugFull).advanceTime(21));

  // The player starts (and ends) in HQ, so the map id never changes — the
  // coin cut (deducted synchronously inside sharedWhiteout, before its fade
  // even resolves) is the reliable completion signal, not G.map.id.
  await page.waitForFunction(() => (window.__debug as unknown as DebugFull).quest.coins === 90, undefined, {
    timeout: 8_000,
  });

  // 1f.14: the bust now explains itself — the caught dialog opens once the
  // fade resolves at HQ (waiting for 'world' would race the dialog open)
  await page.waitForFunction(() => window.__debug.G.state === 'dialog', undefined, { timeout: 8_000 });

  const final = await page.evaluate(() => {
    const d = window.__debug as unknown as DebugFull;
    return { mapId: d.G.map.id, heat: d.G.heatState.hq };
  });
  expect(final.mapId).toBe('hq');
  expect(final.heat).toBeUndefined();
});
