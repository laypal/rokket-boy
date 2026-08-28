// Phase 1d Playwright spec: manual SAVE from the pause menu, title-screen
// CONTINUE (load + warp to the saved position), and NEW GAME (keeps any
// existing save, plays the intro as before) (plan §4.6/§4.9's "save,
// reload, assert party persists" criterion). Follows smoke.spec.ts's boot
// sequence and window.__debug pattern, and inventory-1c.spec.ts's key/settle
// conventions — A='z', B='x', START='Enter', D-pad=Arrow* (src/engine/
// input.ts KEYMAP). Every Playwright test gets a fresh browser context (no
// localStorage leakage), so any test needing a pre-existing save creates it
// inline before reloading.
import { test, expect, type Page } from '@playwright/test';
import { bootToWorld } from './boot';

// Matches smoke.spec.ts / inventory-1c.spec.ts / chapter1.spec.ts's global
// Window.__debug augmentation exactly — TS requires identical merged member
// types for a property declared across multiple files. Fields this spec
// needs beyond this minimal shape (party species, quest.coins, map id) are
// read through the local DebugFull cast below, the same pattern
// inventory-1c.spec.ts uses for party/box/coins/items.
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
    map: { id: string };
    player: { x: number; y: number };
    party: MonInstanceLike[];
  };
  quest: {
    coins: number;
    flags: Record<string, boolean>;
  };
}

// Shape of the JSON blob src/systems/save.ts's SaveV1 serializes to — only
// the fields this spec asserts on.
interface SaveV1Like {
  version: number;
  coins: number;
  party: MonInstanceLike[];
}

// A: 'z', B: 'x', START: 'Enter', D-pad: Arrow* (src/engine/input.ts KEYMAP).
// Every press is followed by a settle wait so the frame loop processes the
// edge-triggered Input.hit() before the next press, matching smoke/1c.
async function press(page: Page, key: string): Promise<void> {
  await page.keyboard.press(key);
  await page.waitForTimeout(300);
}

// Open the pause menu and select SAVE. Pause-menu order (src/systems/
// menu.ts openMenu): PACK(0)/PARTY(1)/STATUS(2)/SAVE(3)/SOUND(4)/HELP(5)/
// CLOSE(6) — 3 Downs from the default PACK cursor lands on SAVE. Selecting
// it calls writeSave() immediately and opens a "SAVED!" sub-window.
async function saveViaMenu(page: Page): Promise<void> {
  await press(page, 'Enter');
  await page.waitForFunction(() => window.__debug.G.state === 'menu', undefined, { timeout: 5_000 });
  for (let i = 0; i < 3; i++) await press(page, 'ArrowDown');
  await press(page, 'z'); // SAVE -> writeSave() + "SAVED!" window
}

// Back out of the SAVE sub-window (first B) and then the pause menu itself
// (second B), landing back in 'world' — mirrors menu.ts's m.sub -> null ->
// closeMenu() two-step.
async function closeMenu(page: Page): Promise<void> {
  await press(page, 'x');
  await press(page, 'x');
  await page.waitForFunction(() => window.__debug.G.state === 'world', undefined, { timeout: 5_000 });
}

async function readSaveFromStorage(page: Page): Promise<SaveV1Like | null> {
  const raw = await page.evaluate(() => localStorage.getItem('team-rokket-save'));
  return raw ? (JSON.parse(raw) as SaveV1Like) : null;
}

test('manual SAVE writes a current-version save', async ({ page }) => {
  await bootToWorld(page);

  await page.evaluate(() => {
    const d = window.__debug as unknown as DebugFull;
    d.quest.coins = 321;
    d.quest.flags.briefed = true;
  });

  await saveViaMenu(page);

  const save = await readSaveFromStorage(page);
  expect(save).not.toBeNull();
  expect(save!.version).toBe(4); // SaveV2 since 1f.2; SaveV3 since SIDE.1; SaveV4 since SIDE.6
  expect(save!.coins).toBe(321);
  expect(save!.party.length).toBe(1);
  expect(save!.party[0].species).toBe('koffink');
});

test('reload + CONTINUE restores the game', async ({ page }) => {
  await bootToWorld(page);

  await page.evaluate(() => {
    const d = window.__debug as unknown as DebugFull;
    d.quest.coins = 321;
    d.quest.flags.briefed = true;
  });
  const before = await page.evaluate(() => {
    const d = window.__debug as unknown as DebugFull;
    return { x: d.G.player.x, y: d.G.player.y, mapId: d.G.map.id };
  });

  await saveViaMenu(page);
  await closeMenu(page);

  await page.reload();
  await expect(page.locator('#screen')).toBeVisible();
  await page.waitForFunction(() => window.__debug?.G.state === 'title', undefined, { timeout: 10_000 });

  // START opens the CONTINUE/NEW GAME window (a save exists); A confirms
  // CONTINUE, the default (index 0) selection.
  await press(page, 'Enter');
  await press(page, 'z');

  await page.waitForFunction(() => window.__debug.G.state === 'world', undefined, { timeout: 5_000 });

  const after = await page.evaluate(() => {
    const d = window.__debug as unknown as DebugFull;
    return {
      coins: d.quest.coins,
      briefed: d.quest.flags.briefed,
      species: d.G.party[0].species,
      x: d.G.player.x,
      y: d.G.player.y,
      mapId: d.G.map.id,
    };
  });
  expect(after.coins).toBe(321);
  expect(after.briefed).toBe(true);
  expect(after.species).toBe('koffink');
  expect(after.x).toBe(before.x);
  expect(after.y).toBe(before.y);
  expect(after.mapId).toBe(before.mapId);
});

test('NEW GAME keeps the save and plays the intro', async ({ page }) => {
  await bootToWorld(page);

  await saveViaMenu(page);
  await closeMenu(page);

  await page.reload();
  await expect(page.locator('#screen')).toBeVisible();
  await page.waitForFunction(() => window.__debug?.G.state === 'title', undefined, { timeout: 10_000 });

  await press(page, 'Enter'); // opens the CONTINUE/NEW GAME window
  await press(page, 'ArrowDown'); // toggle off CONTINUE -> NEW GAME (index 1)
  await press(page, 'z'); // confirm

  await page.waitForFunction(() => window.__debug.G.state === 'intro', undefined, { timeout: 5_000 });

  const save = await readSaveFromStorage(page);
  expect(save).not.toBeNull();
});
