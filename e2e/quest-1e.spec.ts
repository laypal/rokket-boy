// Phase 1e Playwright spec: the §4.7 rank-up card (dev-only __debug.rankUp()
// running `[{ rankUp: true }]` through the real script interpreter +
// worldHooks) and the STATUS pause-menu screen it feeds (plan §4.7's
// "promote GRUNT->AGENT" and "objective line reflects chapter progress"
// criteria). Follows smoke.spec.ts's boot sequence and window.__debug
// pattern, and save-1d.spec.ts's/inventory-1c.spec.ts's key/settle
// conventions — A='z', B='x', START='Enter', D-pad=Arrow* (src/engine/
// input.ts KEYMAP).
import { test, expect, type Page } from '@playwright/test';
import { bootToWorld } from './boot';

// Matches smoke.spec.ts / save-1d.spec.ts / inventory-1c.spec.ts's global
// Window.__debug augmentation exactly — TS requires identical merged member
// types for a property declared across multiple files. Fields this spec
// needs beyond this minimal shape (quest.rank, G.menu.sub, G.rankCard,
// G.endT, rankUp()) are read through the local DebugFull cast below, the
// same pattern the other 1x specs use.
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
  quest: {
    rank: string;
    flags: Record<string, boolean>;
  };
  rankUp: () => void;
}

// A: 'z', B: 'x', START: 'Enter', D-pad: Arrow* (src/engine/input.ts KEYMAP).
// Every press is followed by a settle wait so the frame loop processes the
// edge-triggered Input.hit() before the next press, matching smoke/1c/1d.
async function press(page: Page, key: string): Promise<void> {
  await page.keyboard.press(key);
  await page.waitForTimeout(300);
}

// Open the pause menu and move the cursor onto STATUS. Pause-menu order
// (src/systems/menu.ts openMenu): PACK(0)/PARTY(1)/STATUS(2)/SAVE(3)/
// SOUND(4)/HELP(5)/CLOSE(6) — openMenu() always resets sel to 0, so 2 Downs
// from the default PACK cursor lands on STATUS every time this is called.
async function openStatus(page: Page): Promise<void> {
  await press(page, 'Enter');
  await page.waitForFunction(() => window.__debug.G.state === 'menu', undefined, { timeout: 5_000 });
  await press(page, 'ArrowDown');
  await press(page, 'ArrowDown');
  await press(page, 'z'); // -> STATUS sub-screen
}

test('rankUp shows the rank card and promotes to AGENT', async ({ page }) => {
  await bootToWorld(page);

  const rankBefore = await page.evaluate(() => (window.__debug as unknown as DebugFull).quest.rank);
  expect(rankBefore).toBe('GRUNT');

  await page.evaluate(() => (window.__debug as unknown as DebugFull).rankUp());
  await page.waitForFunction(() => window.__debug.G.state === 'rankcard', undefined, { timeout: 5_000 });

  // the card ignores input for its first 60 frames (G.endT > 60 guard,
  // shared with endUpdate() — see scenes.ts's rankCardUpdate() comment) —
  // wait it out before pressing A, or the press is a no-op.
  await page.waitForFunction(() => (window.__debug as unknown as DebugFull).G.endT > 60, undefined, {
    timeout: 5_000,
  });
  await press(page, 'z'); // A dismisses the card

  await page.waitForFunction(() => window.__debug.G.state === 'world', undefined, { timeout: 5_000 });

  const after = await page.evaluate(() => {
    const d = window.__debug as unknown as DebugFull;
    return { rank: d.quest.rank, rankCard: d.G.rankCard };
  });
  expect(after.rank).toBe('AGENT');
  expect(after.rankCard).toBeNull();
});

test('STATUS shows the current chapter objective', async ({ page }) => {
  await bootToWorld(page);

  await openStatus(page);
  expect(await page.evaluate(() => window.__debug.G.state)).toBe('menu');
  expect(await page.evaluate(() => (window.__debug as unknown as DebugFull).G.menu?.sub ?? null)).toBe('status');

  // B out of the sub-screen, then B again to close the pause menu entirely
  // (menu.ts's m.sub -> null -> closeMenu() two-step, same as save-1d's
  // closeMenu()).
  await press(page, 'x');
  await press(page, 'x');
  await page.waitForFunction(() => window.__debug.G.state === 'world', undefined, { timeout: 5_000 });

  // Advance the ch1 objective (briefed flips the first unmet step from "SEE
  // THE BOSS" to "BEAT THE GUARD" per quest.ts's currentObjective()) and
  // reopen STATUS. The objective text itself is pinned by quest.test.ts's
  // unit tests — this only proves the screen drives cleanly through the
  // real input path a second time under a different flag state.
  await page.evaluate(() => {
    (window.__debug as unknown as DebugFull).quest.flags.briefed = true;
  });

  await openStatus(page);
  expect(await page.evaluate(() => window.__debug.G.state)).toBe('menu');
  expect(await page.evaluate(() => (window.__debug as unknown as DebugFull).G.menu?.sub ?? null)).toBe('status');
});
