// Chapter 7 Playwright spec (CH7.4, expansion plan §9): KANTOO POWER PLANT —
// hear the plant rules from Myowth by the door, walk the forced LIVE FLOOR
// strip (3 hp, boots-less), take the RUBBER BOOTS behind it, ride the stairs
// to 2F's cell store, cross the LIVE FLOOR ring for free once booted, trip a
// mine for a wild VOLTORBB, flee it, trip the SAME mine again (it re-arms),
// climb to 3F, pull the ENERGY CELL from the chest, wake VOLTRAWK on the way
// out of the generator hall, flee it clean, ride the two floors and two maps
// home, and hand the CELL in for 1200 coins (no promotion — EXECUTIVE was
// CH6's grant). A second test seeds straight to the VOLTRAWK dive and proves
// a seeded catch: PRO BALL from the ITEM menu, foe pinned to 1 hp, thrown
// until it lands.
//
// Ch.1–6 are seeded via window.__debug (02-dos-and-donts.md); chapter1–6
// specs remain the sole owners of those walkthroughs. Every walk() below
// names the map row/column it depends on staying open — grids pinned in
// .paul/PLAN.md "Frozen grids" and src/data/maps/plant{1,2,3}.ts.
//
// Route (test 1):
//   d.ch7() -> plant1 (9,10) up, Myowth at (8,10) -> face left, talk ->
//   ch7Rules -> walk up the strip (9,10)->(9,3), -3 hp -> left to (4,3),
//   face left: RUBBER BOOTS at (3,3) -> up to (4,2), right to (17,2), up to
//   (17,1): stairs -> plant2 lands (1,10) -> right to (9,10), up to (9,8),
//   up through the ring's one z tile to (9,4): the mine -> wild VOLTORBB ->
//   LEG IT -> down/up over the same tile: it fires again -> down to (9,8),
//   down to (9,10), right to (22,10): stairs -> plant3 lands (1,9) -> right
//   to (7,9), up through the gap (7,8) [no dive yet, no CELL] -> up into the
//   hall, up to (7,5), right to (18,5), up to (18,3), face up: the chest at
//   (18,2) -> ENERGY CELL, tile -> '%' -> back down to (18,5), left to
//   (7,5), down to (7,7), down onto (7,8): the dive -> VOLTRAWK -> LEG IT ->
//   ch7Fled -> down to (7,9), left to (1,9): stairs -> plant2 (22,10) ->
//   left to (1,10): stairs -> plant1 (17,1) -> down to (17,2), left to
//   (9,2), down to (9,11): the door -> dock (9,8) -> d.warp(['hq',9,7,
//   'down']) -> left to (7,7), up to (7,4), face up: Giovanni -> ch7Done,
//   +1200 coins, endScreen straight to 'end' (no rankcard — EXECUTIVE stands).
import { test, expect, type Page } from '@playwright/test';
import { bootToWorld } from './boot';

// Matches chapter1–6.spec.ts's global Window.__debug augmentation exactly —
// TS requires identical merged member types for a property declared across
// multiple files.
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

// Fields this spec needs beyond DebugHandle's minimal shape — read through
// this local cast, the same pattern every other chapter spec uses.
interface DebugFull {
  G: {
    endT: number;
    party: { species: string; hp: number; lv: number; xp: number }[];
    box: { species: string }[];
    battle: { phase: string; sel: number; enc: { trainer?: string }; foe: { species: string; hp: number } } | null;
    map: { grid: string[][]; npcs: { id: string; x: number; y: number }[] };
    heatState: Partial<Record<string, { stage: number; decayAt: number; lockdownAt: number | null }>>;
  };
  quest: {
    rank: string;
    coins: number;
    items: string[];
    flags: Record<string, boolean>;
  };
  noEncounters: () => void;
  warp: (w: [string, number, number, string]) => void;
  setHp: (key: string | number, arg: number) => void;
}

type ArrowKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';

async function state(page: Page): Promise<string> {
  return page.evaluate(() => window.__debug.G.state);
}
async function flags(page: Page): Promise<Record<string, boolean>> {
  return page.evaluate(() => window.__debug.quest.flags);
}
async function items(page: Page): Promise<string[]> {
  return page.evaluate(() => (window.__debug as unknown as DebugFull).quest.items);
}
async function hp0(page: Page): Promise<number> {
  return page.evaluate(() => (window.__debug as unknown as DebugFull).G.party[0].hp);
}

// One tile: press, wait for the move to start, release before it finishes —
// see chapter1.spec.ts's tapDir for the full rationale (copied, not
// imported, per this repo's per-spec-file convention).
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

// Drain whatever cascade of dialog/battle follows, mashing A, until the game
// settles into 'world' or 'end'. Only G.state is inspected.
async function settle(page: Page, maxMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const s = await state(page);
    if (s === 'world' || s === 'end') return;
    if (s === 'dialog' || s === 'battle') await page.keyboard.press('z');
    await page.waitForTimeout(50);
  }
}

// Frame-count wait, never wall clock (boot.ts's idiom).
async function waitFrames(page: Page, n: number): Promise<void> {
  const f0 = await page.evaluate(() => window.__debug.G.frame);
  await page.waitForFunction(([f]) => window.__debug.G.frame >= f, [f0 + n], { timeout: n * 40 + 5_000 });
}

async function waitForMap(page: Page, id: string, timeout = 8_000): Promise<void> {
  await page.waitForFunction(
    (mapId) => window.__debug.G.map.id === mapId && window.__debug.G.state === 'world',
    id,
    { timeout },
  );
}

async function drainUntilFlag(page: Page, flag: string, maxMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    if ((await flags(page))[flag]) return;
    const s = await state(page);
    if (s === 'dialog' || s === 'battle') await page.keyboard.press('z');
    await page.waitForTimeout(50);
  }
}

/** Face a blocked tile (an NPC, a ball, a door, a chest) and press A: the
 *  tap only turns, the held-arrow release has to land before A (a press on
 *  the same frame is dropped), and the press is consumed on the NEXT frame
 *  (chapter5's lesson) — so wait a beat on both sides. */
async function faceAndPress(page: Page, key: ArrowKey): Promise<void> {
  await tapDir(page, key);
  await waitFrames(page, 4);
  await page.keyboard.press('z');
  await waitFrames(page, 2);
}

/** Mash A through the battle's opening messages until the root menu is up
 *  (chapter5.spec.ts). */
async function waitForBattleMenu(page: Page, maxMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const phase = await page.evaluate(() => (window.__debug as unknown as DebugFull).G.battle?.phase ?? null);
    if (phase === 'menu') return;
    if ((await state(page)) === 'battle' || (await state(page)) === 'dialog') await page.keyboard.press('z');
    await page.waitForTimeout(50);
  }
  throw new Error('battle root menu never came up');
}

/** Move the battle cursor to `sel` in the current list (menuInput reads a
 *  tap per frame, so one press per row) — chapter5.spec.ts. ROOT_MENU is
 *  ['FIGHT','SWIPE','SWITCH','ITEM','LEG IT'] (battle.ts): ITEM = 3,
 *  LEG IT = 4. */
async function battleCursor(page: Page, sel: number): Promise<void> {
  for (let i = 0; i < sel; i++) {
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(40);
  }
  await page.waitForFunction((s) => (window.__debug as unknown as DebugFull).G.battle?.sel === s, sel, { timeout: 2_000 });
}

/** A `step:` battle can ride behind a `say` first (plant3.ts's VOLTRAWK
 *  dive has one, the mines don't) — mash any dialog out of the way until
 *  G.battle is live. */
async function waitForBattleStart(page: Page, maxMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    if (await page.evaluate(() => (window.__debug as unknown as DebugFull).G.battle !== null)) return;
    if ((await state(page)) === 'dialog') await page.keyboard.press('z');
    await page.waitForTimeout(50);
  }
  throw new Error('battle never started');
}

/** Wild encounters here never refuse a flee (battle.ts's doFlee has no rng
 *  gate for a non-trainer fight) — root ITEM/LEG IT, then mash to 'world'. */
async function flee(page: Page): Promise<void> {
  await waitForBattleMenu(page, 30_000);
  await battleCursor(page, 4); // LEG IT
  await page.keyboard.press('z');
  await settle(page, 10_000);
}

// Seed a completed CH1–CH6 (rank EXECUTIVE, the CH7 briefing heard with its
// 3 PRO BALLs), silence wild rolls, and land at the plant's 1F door — the
// REAL __debug.ch7() (main.ts), not a hand-rolled flag list.
async function seedCh7(page: Page): Promise<void> {
  await page.evaluate(() => {
    const d = window.__debug as unknown as DebugFull;
    (d as unknown as { ch7: () => void }).ch7();
    (d as unknown as { party: (n: number, lv: number) => void }).party(4, 28);
    d.noEncounters();
  });
}

test('Chapter 7: the rules, the LIVE FLOOR, the boots, the mine (twice), the CELL, VOLTRAWK fled, and the hand-in', async ({ page }) => {
  test.setTimeout(300_000);
  await bootToWorld(page);
  await seedCh7(page);
  await waitForMap(page, 'plant1');
  const coinsBefore = await page.evaluate(() => (window.__debug as unknown as DebugFull).quest.coins);
  await page.waitForFunction(() => (window.__debug as unknown as DebugFull).G.heatState.plant1?.stage === 1, undefined, { timeout: 3_000 });

  // ── the rules gate: Myowth at (8,10), the player lands (9,10) facing up ──
  await faceAndPress(page, 'ArrowLeft');
  await drainUntilFlag(page, 'ch7Rules', 30_000);
  await settle(page, 5_000);
  expect((await flags(page)).ch7Rules).toBe(true);

  // ── the forced LIVE FLOOR strip: column 9, rows 4–6 are 'z' — 3 hp, no
  //    boots yet (hazard.ts SHOCK_DAMAGE=1, floored at 1 hp) ───────────────
  const hpBeforeStrip = await hp0(page);
  await walk(page, 'ArrowUp', 7, 9, 3);
  expect(hpBeforeStrip - (await hp0(page))).toBe(3);

  // ── the RUBBER BOOTS at (3,3), faced from (4,3) ─────────────────────────
  await walk(page, 'ArrowLeft', 5, 4, 3);
  await faceAndPress(page, 'ArrowLeft');
  await settle(page, 5_000);
  expect(await items(page)).toContain('RUBBER BOOTS');

  // ── the stairs (17,1) -> 2F: up to row 2, east along it, up onto '>' ────
  await walk(page, 'ArrowUp', 1, 4, 2);
  await walk(page, 'ArrowRight', 13, 17, 2);
  await walk(page, 'ArrowUp', 1, 17, 1);
  await waitForMap(page, 'plant2');

  // ── the CELL STORE ring: (1,10) -> east to (9,10), up to (9,8), then one
  //    'z' tile (9,7) into the ring — boots on, no hp lost ────────────────
  await walk(page, 'ArrowRight', 8, 9, 10);
  await walk(page, 'ArrowUp', 2, 9, 8);
  const hpBeforeRing = await hp0(page);
  await walk(page, 'ArrowUp', 1, 9, 7);
  expect(await hp0(page)).toBe(hpBeforeRing); // RUBBER BOOTS silences the ring

  // ── the mine at (9,4): step on -> wild VOLTORBB -> LEG IT ───────────────
  await walk(page, 'ArrowUp', 1, 9, 6);
  await walk(page, 'ArrowUp', 1, 9, 5);
  await walk(page, 'ArrowUp', 1, 9, 4);
  await page.waitForFunction(() => (window.__debug as unknown as DebugFull).G.battle !== null, undefined, { timeout: 5_000 });
  expect(await page.evaluate(() => (window.__debug as unknown as DebugFull).G.battle?.foe.species)).toBe('voltorbb');
  await flee(page);

  // ── step off and back on: a flee never spends the mine's var, so it
  //    fires again (dialog/plant.ts mine(), plant.ts's re-arm contract) ───
  await walk(page, 'ArrowDown', 1, 9, 5);
  await walk(page, 'ArrowUp', 1, 9, 4);
  await page.waitForFunction(() => (window.__debug as unknown as DebugFull).G.battle !== null, undefined, { timeout: 5_000 });
  expect(await page.evaluate(() => (window.__debug as unknown as DebugFull).G.battle?.foe.species)).toBe('voltorbb');
  await flee(page);

  // ── out of the ring, down and east to the 3F stairs (22,10) ─────────────
  await walk(page, 'ArrowDown', 4, 9, 8);
  await walk(page, 'ArrowDown', 2, 9, 10);
  await walk(page, 'ArrowRight', 13, 22, 10);
  await waitForMap(page, 'plant3');

  // ── the gap (7,8) BEFORE the CELL: no dive yet ───────────────────────────
  await walk(page, 'ArrowRight', 6, 7, 9);
  await walk(page, 'ArrowUp', 1, 7, 8);
  expect(await page.evaluate(() => (window.__debug as unknown as DebugFull).G.battle)).toBeNull();

  // ── the ENERGY CELL chest at (18,2), faced from (18,3) ──────────────────
  await walk(page, 'ArrowUp', 1, 7, 7);
  await walk(page, 'ArrowUp', 2, 7, 5);
  await walk(page, 'ArrowRight', 11, 18, 5);
  await walk(page, 'ArrowUp', 2, 18, 3);
  await faceAndPress(page, 'ArrowUp');
  await drainUntilFlag(page, 'ch7Cell', 20_000);
  await settle(page, 5_000);
  expect(await items(page)).toContain('ENERGY CELL');
  expect(await page.evaluate(() => (window.__debug as unknown as DebugFull).G.map.grid[2][18])).toBe('%');

  // ── back down to the gap: the CELL is out, so (7,8) wakes VOLTRAWK on the
  //    way OUT (dialog/plant3.ts's step:7,8) ──────────────────────────────
  await walk(page, 'ArrowDown', 2, 18, 5);
  await walk(page, 'ArrowLeft', 11, 7, 5);
  await walk(page, 'ArrowDown', 2, 7, 7);
  await walk(page, 'ArrowDown', 1, 7, 8);
  await waitForBattleStart(page, 10_000); // the "A SHRIEK..." say rides in front of the battle
  expect(await page.evaluate(() => (window.__debug as unknown as DebugFull).G.battle?.foe.species)).toBe('voltrawk');
  await flee(page);
  expect((await flags(page)).ch7Fled).toBe(true);
  expect((await flags(page)).ch7Caught).toBeFalsy();
  expect((await flags(page)).ch7Beaten).toBeFalsy();

  // ── home: the stairs pocket (1,9) -> plant2 (22,10) -> west to (1,10) ->
  //    plant1 (17,1) -> south to the door (9,11) -> the dock (9,8) ────────
  await walk(page, 'ArrowDown', 1, 7, 9);
  await walk(page, 'ArrowLeft', 6, 1, 9);
  await waitForMap(page, 'plant2');
  await walk(page, 'ArrowLeft', 21, 1, 10);
  await waitForMap(page, 'plant1');
  await walk(page, 'ArrowDown', 1, 17, 2);
  await walk(page, 'ArrowLeft', 8, 9, 2);
  await walk(page, 'ArrowDown', 9, 9, 11);
  await waitForMap(page, 'dock');

  // ── the fade-warp home (task-pinned: __debug.warp, not the dock's own
  //    walk to HQ — that route belongs to no chapter spec here) ──────────
  await page.evaluate(() => (window.__debug as unknown as DebugFull).warp(['hq', 9, 7, 'down']));
  await waitForMap(page, 'hq');

  // ── Giovanni at (7,3): (9,7) -> west to (7,7) -> north to (7,4), face up ─
  await walk(page, 'ArrowLeft', 2, 7, 7);
  await walk(page, 'ArrowUp', 3, 7, 4);
  await faceAndPress(page, 'ArrowUp');
  await drainUntilFlag(page, 'ch7Done', 30_000);
  // no rankUp on this hand-in (hq.ts: setFlag, addCoins, sfx, music,
  // endScreen straight to 'end' — EXECUTIVE was CH6's grant) — mash to 'end'
  const handStart = Date.now();
  while (Date.now() - handStart < 30_000) {
    if ((await state(page)) === 'end') break;
    if ((await state(page)) === 'dialog' || (await state(page)) === 'battle') await page.keyboard.press('z');
    await page.waitForTimeout(50);
  }
  await page.waitForFunction(() => window.__debug.G.state === 'end', undefined, { timeout: 10_000 });

  const final = await page.evaluate(() => {
    const d = window.__debug as unknown as DebugFull;
    return { ch7Done: d.quest.flags.ch7Done, rank: d.quest.rank, coins: d.quest.coins };
  });
  expect(final.ch7Done).toBe(true);
  expect(final.rank).toBe('EXECUTIVE'); // no promotion this chapter
  expect(final.coins).toBe(coinsBefore + 1200);
});

test('Chapter 7: a seeded catch — PRO BALL from the ITEM menu lands VOLTRAWK', async ({ page }) => {
  test.setTimeout(180_000);
  await bootToWorld(page);
  await seedCh7(page);
  await waitForMap(page, 'plant1');

  // rig straight past the 1F/2F leg: the CELL is out, plenty of PRO BALLs so
  // a ~12%-per-throw catch chance (foe pinned to 1 hp) can't stall the test
  await page.evaluate(() => {
    const d = window.__debug as unknown as DebugFull;
    d.quest.flags.ch7Cell = true;
    d.quest.items.push('ENERGY CELL');
    for (let i = 0; i < 40; i++) d.quest.items.push('PRO BALL');
    d.warp(['plant3', 1, 9, 'down']);
  });
  await waitForMap(page, 'plant3');

  // ── the dive: (1,9) -> east to (7,9), up onto (7,8) — the CELL is out ───
  await walk(page, 'ArrowRight', 6, 7, 9);
  await walk(page, 'ArrowUp', 1, 7, 8);
  await waitForBattleStart(page, 10_000); // the "A SHRIEK..." say rides in front of the battle
  expect(await page.evaluate(() => (window.__debug as unknown as DebugFull).G.battle?.foe.species)).toBe('voltrawk');
  await waitForBattleMenu(page, 30_000);

  // ── ITEM (root index 3): the only usable ball in the pack is PRO BALL —
  //    battleItems() (battle.ts) lists it at index 0 ──────────────────────
  await battleCursor(page, 3);
  await page.keyboard.press('z');
  await page.waitForFunction(() => (window.__debug as unknown as DebugFull).G.battle?.phase === 'item', undefined, { timeout: 3_000 });
  expect(await items(page)).toContain('PRO BALL');

  // ── pin the foe at 1 hp and throw until it lands. No __debug hook seeds
  //    battleRng directly (only setEncounterSeed, a different rng stream —
  //    src/main.ts), so this is a bounded retry loop, not a single throw;
  //    the lead's hp is repinned every iteration so a stray enemy hit before
  //    the catch can't derail the run into a wipe. ────────────────────────
  await page.evaluate(() => {
    const d = window.__debug as unknown as DebugFull;
    d.G.battle!.foe.hp = 1;
  });
  const catchStart = Date.now();
  while (Date.now() - catchStart < 120_000) {
    if ((await flags(page)).ch7Caught) break;
    await page.evaluate(() => {
      const d = window.__debug as unknown as DebugFull;
      if (d.G.battle) d.G.battle.foe.hp = 1;
      d.setHp(0, 999);
    });
    const s = await state(page);
    if (s === 'dialog' || s === 'battle') await page.keyboard.press('z');
    await page.waitForTimeout(50);
  }
  await settle(page, 10_000);

  expect((await flags(page)).ch7Caught).toBe(true);
  expect((await flags(page)).ch7Beaten).toBeFalsy();
  expect((await flags(page)).ch7Fled).toBeFalsy();
  const mons = await page.evaluate(() => {
    const d = window.__debug as unknown as DebugFull;
    return [...d.G.party.map((m) => m.species), ...d.G.box.map((m) => m.species)];
  });
  expect(mons).toContain('voltrawk');
});
