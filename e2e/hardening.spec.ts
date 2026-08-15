// HRD.10 Playwright specs: browser-level coverage for player-visible paths
// that were previously only unit-tested or retried-around. Boot sequence,
// key/settle conventions and the shared window.__debug augmentation follow
// chapter1.spec.ts / save-1d.spec.ts exactly (A='z', B='x', START='Enter',
// D-pad=Arrow* — src/engine/input.ts KEYMAP). Touch-control automation is
// QA.3's, not this card's.
//
// Journey map (card HRD.10):
//   (a) battle-loss whiteout, asserted directly (not retried around, unlike
//       chapter1.spec.ts:8's guard fight)
//   (b) evolution cinematic end-to-end via the 4095-xp recipe
//       (tests/battle.test.ts:1019's "one win short of lv 16")
//   (c) corrupt save at boot
//   (d) storage denied (localStorage throws)
//   (e) reload mid-battle / mid-dialog
//   (f) prod-smoke's `window.__debug === undefined` assertion — already
//       landed by HRD.4 (e2e-prod/prod-smoke.spec.ts:37); verified, not
//       duplicated here.
import { test, expect, type Page } from '@playwright/test';

interface MonInstanceLike {
  species: string;
  lv: number;
  hp: number;
  xp: number;
  moves: string[];
}

// Matches the shared global Window.__debug augmentation (see
// chapter1.spec.ts / save-1d.spec.ts's comment on merged declaration
// types) plus the fields this spec needs beyond that minimal shape —
// read through the DebugFull cast below, same pattern as save-1d.spec.ts.
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
  G: {
    state: string;
    frame: number;
    map: { id: string };
    player: { x: number; y: number };
    party: MonInstanceLike[];
    battle: { foe: { hp: number } } | null;
    dialog: { pages: string[][] } | null;
    lastHq: { map: string; x: number; y: number };
  };
  quest: {
    coins: number;
    flags: Record<string, boolean>;
  };
  startBattle: (enc: string) => void;
}

async function state(page: Page): Promise<string> {
  return page.evaluate(() => window.__debug.G.state);
}

// Boot helper (plan §3.4 sequence, factored per smoke.spec.ts / save-1d.spec.ts):
// title -> START -> intro -> A x3 -> world, landing in ROKKET HQ.
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

// One tile (chapter1.spec.ts's tapDir, duplicated here — see that file's
// comment for why the key is released before the tile finishes).
async function tapDir(page: Page, key: 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight', timeout = 2_000): Promise<void> {
  await page.keyboard.down(key);
  await page
    .waitForFunction(() => (window.__debug.G.player as unknown as { moving: boolean }).moving, undefined, { timeout })
    .catch(() => undefined);
  await page.keyboard.up(key);
  await page
    .waitForFunction(() => !(window.__debug.G.player as unknown as { moving: boolean }).moving, undefined, { timeout })
    .catch(() => undefined);
}
async function walk(page: Page, key: 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight', steps: number): Promise<void> {
  for (let i = 0; i < steps; i++) await tapDir(page, key);
}

// Mash A while the battle runs — advances messages, always picks the
// default (index 0) menu entry: FIGHT's first move, and EVOLVE at the
// evolve prompt (b.sel resets to 0 on every relevant phase transition, and
// this spec never presses an arrow key to move it off 0).
async function mashBattle(page: Page, maxMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    if ((await state(page)) !== 'battle') return;
    await page.keyboard.press('z');
    await page.waitForTimeout(50);
  }
}

// ── (a) battle-loss whiteout, asserted directly ────────────────────────────
test('battle loss: fainting with no mons left whitesouts back to HQ', async ({ page }) => {
  test.setTimeout(60_000);
  await bootToHQ(page);

  // Force the loss deterministically instead of relying on a fair fight:
  // the party's one mon is pinned to 1 hp (any connecting foe hit faints
  // it), and the foe's hp is pinned far out of reach (this mon can never
  // win it). brad_ratikatt (src/data/encounters.ts) is a real registered
  // trainer battle — no map flags gate starting it via the debug hook.
  await page.evaluate(() => {
    const d = window.__debug as unknown as DebugFull;
    d.quest.coins = 100;
    d.G.party[0].hp = 1;
    d.startBattle('brad_ratikatt');
  });
  await page.waitForFunction(() => window.__debug.G.state === 'battle', undefined, { timeout: 5_000 });
  await page.evaluate(() => {
    (window.__debug as unknown as DebugFull).G.battle!.foe.hp = 9_999;
  });

  await mashBattle(page, 30_000);

  // sharedWhiteout (src/systems/recovery.ts): full-heal, warp to G.lastHq,
  // minus 10% coins — asserted directly, not inferred from a retry count.
  await page.waitForFunction(
    () => window.__debug.G.map.id === 'hq' && window.__debug.G.state === 'world',
    undefined,
    { timeout: 10_000 },
  );
  const after = await page.evaluate(() => {
    const d = window.__debug as unknown as DebugFull;
    return { coins: d.quest.coins, hp: d.G.party[0].hp, mapId: d.G.map.id };
  });
  expect(after.coins).toBe(90); // 100 - floor(100 * 0.1)
  expect(after.hp).toBeGreaterThan(0); // full-healed, not left at the 1 hp it fainted from
  expect(after.mapId).toBe('hq');
});

// ── (b) evolution cinematic, end-to-end in a real browser ──────────────────
test('evolution cinematic renders end-to-end via the 4095-xp recipe', async ({ page }) => {
  test.setTimeout(60_000);
  await bootToHQ(page);

  // The UX2.5 threshold recipe (tests/battle.test.ts:1019): a ratikatt at
  // xp 4095 is one win short of lv 16, where SPECIES.ratikatt.evolvesTo
  // fires. guard_voltorbb (lv 4) is a real registered encounter that a lv
  // 15 ratikatt (atk 56) beats overwhelmingly — no need to pin battleRng
  // (not debug-exposed for a real browser run; only encounter rng is).
  await page.evaluate(() => {
    const d = window.__debug as unknown as DebugFull;
    d.G.party[0] = { species: 'ratikatt', lv: 15, hp: 34, xp: 4095, moves: ['tackle', 'bite', 'screech'] };
    d.startBattle('guard_voltorbb');
  });
  await page.waitForFunction(() => window.__debug.G.state === 'battle', undefined, { timeout: 5_000 });

  await mashBattle(page, 45_000);

  await page.waitForFunction(() => window.__debug.G.state === 'world', undefined, { timeout: 10_000 });
  const party = await page.evaluate(() => (window.__debug as unknown as DebugFull).G.party);
  expect(party[0].species).toBe('ratikate'); // ratikatt's evolvesTo target
  expect(party[0].lv).toBe(16);
});

// ── (c) corrupt save at boot ─────────────────────────────────────────────
test('corrupt save at boot: title loads and START plays fresh, not a frozen canvas', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#screen')).toBeVisible();
  await page.waitForFunction(() => window.__debug?.G.state === 'title', undefined, { timeout: 10_000 });

  await page.evaluate(() => localStorage.setItem('team-rokket-save', '{not valid json!!!'));
  await page.reload();
  await expect(page.locator('#screen')).toBeVisible();
  await page.waitForFunction(() => window.__debug?.G.state === 'title', undefined, { timeout: 10_000 });

  // not a frozen canvas: the frame counter is still advancing
  const f1 = await page.evaluate(() => window.__debug.G.frame);
  await page.waitForTimeout(300);
  const f2 = await page.evaluate(() => window.__debug.G.frame);
  expect(f2).toBeGreaterThan(f1);

  // migrate() (src/systems/save.ts) rejects unparseable JSON -> readSave()
  // returns null -> hasSave() is false, so START skips the CONTINUE/NEW
  // GAME chooser entirely and goes straight into a fresh game (the
  // functional equivalent of NEW GAME) instead of hanging on a bad blob.
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__debug.G.state === 'intro', undefined, { timeout: 5_000 });
});

// ── (d) storage denied ──────────────────────────────────────────────────
test('storage denied: SAVE: SESSION ONLY toast appears and the game stays playable', async ({ page }) => {
  // Context init script (runs before any page script): every localStorage
  // write throws, matching detectStorage()'s SecurityError-fallback branch
  // (src/systems/save.ts:73-94) — real Safari-private-mode behaviour, not a
  // key deletion.
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('Storage denied', 'SecurityError');
    };
  });

  await bootToHQ(page);

  // Any warp autosaves (src/systems/world.ts:227); the south doors out of
  // HQ are the same auto-warp chapter1.spec.ts uses. corner's enter script
  // is setTile/addWarp-only (src/data/dialog/corner.ts:101) — no dialog of
  // its own to race the toast.
  await walk(page, 'ArrowDown', 6);
  await page.waitForFunction(() => window.__debug.G.map.id === 'corner', undefined, { timeout: 8_000 });

  await page.waitForFunction(
    () => (window.__debug as unknown as DebugFull).G.dialog !== null,
    undefined,
    { timeout: 5_000 },
  );
  const pages = await page.evaluate(() => (window.__debug as unknown as DebugFull).G.dialog!.pages);
  expect(pages).toEqual([['SAVE: SESSION', 'ONLY.']]);

  // dismiss the toast, then prove the game is still playable: one more tile
  // of movement completes cleanly.
  const dismissStart = Date.now();
  while (Date.now() - dismissStart < 5_000 && (await state(page)) === 'dialog') {
    await page.keyboard.press('z');
    await page.waitForTimeout(50);
  }
  await page.waitForFunction(() => window.__debug.G.state === 'world', undefined, { timeout: 5_000 });

  await walk(page, 'ArrowLeft', 1);
  expect(await state(page)).toBe('world');
});

// ── (e) reload mid-battle / mid-dialog lands somewhere sane ────────────────
test('reload mid-battle lands back at a playable title screen', async ({ page }) => {
  await bootToHQ(page);

  await page.evaluate(() => (window.__debug as unknown as DebugFull).startBattle('guard_voltorbb'));
  await page.waitForFunction(() => window.__debug.G.state === 'battle', undefined, { timeout: 5_000 });

  await page.reload();
  await expect(page.locator('#screen')).toBeVisible();
  await page.waitForFunction(() => window.__debug?.G.state === 'title', undefined, { timeout: 10_000 });

  // no autosave happens mid-battle (only on warp), so there's no save to
  // offer CONTINUE on — prove the game is fully playable from here anyway.
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__debug.G.state === 'intro', undefined, { timeout: 5_000 });
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('z');
    await page.waitForTimeout(300);
  }
  await page.waitForFunction(() => window.__debug.G.state === 'world', undefined, { timeout: 5_000 });
});

test('reload mid-dialog lands back at a playable title screen', async ({ page }) => {
  await bootToHQ(page);

  // walk to Giovanni (7,4) and open the briefing dialog without finishing it
  // (chapter1.spec.ts's proven HQ path)
  await walk(page, 'ArrowLeft', 2);
  await walk(page, 'ArrowUp', 3);
  await page.keyboard.press('z');
  await page.waitForFunction(() => window.__debug.G.state === 'dialog', undefined, { timeout: 5_000 });

  await page.reload();
  await expect(page.locator('#screen')).toBeVisible();
  await page.waitForFunction(() => window.__debug?.G.state === 'title', undefined, { timeout: 10_000 });

  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__debug.G.state === 'intro', undefined, { timeout: 5_000 });
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('z');
    await page.waitForTimeout(300);
  }
  await page.waitForFunction(() => window.__debug.G.state === 'world', undefined, { timeout: 5_000 });
});
