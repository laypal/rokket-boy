// Chapter 1 Playwright spec (expansion plan §9): drives the full critical
// path — HQ briefing → Gamez Corner guard fight → poster switch → vault
// heist → hand-in — in one test, asserting quest flags via the dev-only
// window.__debug hook (see smoke.spec.ts for the established pattern).
//
// The battle menu is being rewritten this session, so the guard fight is
// driven by mashing A (always confirms the first menu entry) and never
// inspects menu text, entry names, or menu structure. A bad-RNG loss
// whitesouts back to HQ, so the fight is retried up to 3 times.
import { test, expect, type Page } from '@playwright/test';
import { bootToWorld, skipTour } from './boot';

interface DebugHandle {
  G: { state: string; frame: number; map: { id: string; name: string }; player: { x: number; y: number } };
  quest: { flags: Record<string, boolean> };
}
declare global {
  interface Window {
    __debug: DebugHandle;
  }
}

// `window.__debug` is the same live `{ G, quest }` reference smoke.spec.ts
// types (merged into the same global Window augmentation, so this file's
// DebugHandle must match that shape exactly). G.player also carries
// `moving`, which the walk helpers below need but smoke.spec.ts's typing
// doesn't declare — read it through this local cast instead of widening the
// shared global type.
interface PlayerMoving {
  moving: boolean;
}

type ArrowKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';

async function state(page: Page): Promise<string> {
  return page.evaluate(() => window.__debug.G.state);
}
async function flags(page: Page): Promise<Record<string, boolean>> {
  return page.evaluate(() => window.__debug.quest.flags);
}

// One tile: press, wait for the move to actually start (clears the engine's
// 6-frame turn-lock), then release *before* the tile finishes. worldUpdate()
// only re-checks the held key when a tile completes (to decide whether to
// chain into the next one) — releasing early guarantees that check reads
// "not held" and stops dead on this tile, instead of racing the key-up
// against a same-frame chain into the next tile. If the tile ahead is
// solid, "moving" never flips true; the wait just times out harmlessly and
// the key is released with the player's facing updated but unmoved.
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

// Walk `steps` tiles one at a time, then confirm arrival at (x, y). Every
// leg here was walked against the map data (src/data/maps), so exact
// arrival is the real signal, not a guessed frame count.
async function walk(page: Page, key: ArrowKey, steps: number, x: number, y: number): Promise<void> {
  for (let i = 0; i < steps; i++) await tapDir(page, key);
  await page.waitForFunction(
    ([tx, ty]) => window.__debug.G.player.x === tx && window.__debug.G.player.y === ty,
    [x, y],
    { timeout: 3_000 },
  );
}

// Turn to face a direction without moving. Only used where the tile ahead
// is solid (the poster in the wall), so this can never turn into a walk.
async function face(page: Page, key: ArrowKey): Promise<void> {
  await tapDir(page, key);
}

// Drain whatever cascade of dialog/battle follows an interaction, mashing A
// the whole way, until the game settles back into 'world' or 'end'. One
// call covers a single `say`, a say-then-battle-then-say chain, or a battle
// that whitesouts back to the world — it never inspects battle-menu text or
// structure, only G.state.
async function settle(page: Page, maxMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const s = await state(page);
    if (s === 'world' || s === 'end') return;
    if (s === 'dialog' || s === 'battle') await page.keyboard.press('z');
    await page.waitForTimeout(50);
  }
}

// Tap A to trigger an interaction (NPC/tile), give the game a moment to
// react, then drain the resulting cascade.
async function interactAndSettle(page: Page, maxMs = 10_000): Promise<void> {
  await page.keyboard.press('z');
  await page.waitForTimeout(200);
  await settle(page, maxMs);
}

async function waitForMap(page: Page, id: string, timeout = 8_000): Promise<void> {
  await page.waitForFunction(
    (mapId) => window.__debug.G.map.id === mapId && window.__debug.G.state === 'world',
    id,
    { timeout },
  );
}

test('Chapter 1: HQ briefing, guard fight, poster switch, vault heist, hand-in', async ({ page }) => {
  test.setTimeout(180_000); // up to 3 retry-tolerant battle attempts, generously budgeted

  // ── boot → title → skip the cold open → world (ROKKET HQ) ───────────────
  await bootToWorld(page);

  // ── HQ briefing: walk to Giovanni (7,3), talk from (7,4) facing up ───────
  await walk(page, 'ArrowLeft', 2, 7, 7);
  await walk(page, 'ArrowUp', 3, 7, 4);
  await interactAndSettle(page, 10_000);
  expect((await flags(page)).briefed).toBe(true);

  // back to the HQ spawn tile, then out the south doors to Gamez Corner
  await walk(page, 'ArrowDown', 3, 7, 7);
  await walk(page, 'ArrowRight', 2, 9, 7);

  // ── Guard battle at the poster — retry-tolerant (a whiteout sends us
  //    back to HQ spawn; max 3 attempts) ───────────────────────────────────
  let guardBeaten = false;
  for (let attempt = 1; attempt <= 3 && !guardBeaten; attempt++) {
    await walk(page, 'ArrowDown', 6, 9, 13); // steps onto the door tile, auto-warps
    await waitForMap(page, 'corner');
    await walk(page, 'ArrowLeft', 5, 4, 2);
    await interactAndSettle(page, 30_000); // say x2 -> battle (mash A throughout) -> say
    guardBeaten = (await flags(page)).guardBeaten;
    if (!guardBeaten) {
      // whiteout — confirm we're back at the HQ spawn before retrying
      await page.waitForFunction(
        () => window.__debug.G.map.id === 'hq' && window.__debug.G.state === 'world',
        undefined,
        { timeout: 10_000 },
      );
    }
  }
  expect(guardBeaten).toBe(true);

  // ── Poster switch: the guard's gone, step onto its tile, face the poster ─
  await walk(page, 'ArrowLeft', 1, 3, 2);
  await face(page, 'ArrowUp');
  await interactAndSettle(page, 10_000);
  expect((await flags(page)).switchFound).toBe(true);

  // the stairway opened at (2,2); step onto it to warp into the vault
  await walk(page, 'ArrowLeft', 1, 2, 2);
  await waitForMap(page, 'vault');

  // ── Vault heist: take the loot ────────────────────────────────────────────
  await walk(page, 'ArrowUp', 1, 5, 4);
  await interactAndSettle(page, 10_000);
  expect((await flags(page)).lootTaken).toBe(true);

  // ── Return to HQ and hand in ──────────────────────────────────────────────
  await walk(page, 'ArrowDown', 2, 5, 6); // warps back to Gamez Corner
  await waitForMap(page, 'corner');

  await walk(page, 'ArrowDown', 1, 2, 4);
  await walk(page, 'ArrowRight', 8, 10, 4);
  await walk(page, 'ArrowDown', 6, 10, 10); // warps back to HQ
  await waitForMap(page, 'hq');

  // Giovanni's "you actually did it" line fires automatically on entry
  await page.waitForTimeout(300);
  await settle(page, 8_000);
  // FLW.5: the enter script follows the say with the hand-in pan to his
  // desk (lootTaken && !missionDone). Skip it before walking.
  await skipTour(page);

  await walk(page, 'ArrowLeft', 3, 7, 12);
  await walk(page, 'ArrowUp', 8, 7, 4);
  await interactAndSettle(page, 10_000);

  const final = await flags(page);
  expect(final.missionDone).toBe(true);
  expect(await state(page)).toBe('end');
});
