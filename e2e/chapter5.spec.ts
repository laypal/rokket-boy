// Chapter 5 Playwright spec (CH5.4, expansion plan §9): LAVENDAR TOWER —
// climb 1F in the fog, find the SILF SCOPE in 2F's mist room (the ghost on
// the stairs lets you past once it's held), take the BONE CHARM on 3F, walk
// into the MAROWL spirit and end the unwinnable fight with the charm, lift
// the BONE MASK off the altar, let Myowth talk you into taking him along,
// ride home and hand the mask in. A second test loses to the spirit cleanly.
//
// Ch.1–4 are seeded via window.__debug (02-dos-and-donts.md); chapter1–4
// specs remain the sole owners of those walkthroughs. Every walk() below
// names the map row/column it depends on staying open — grids pinned in
// .paul/PLAN.md CH5.0 §11 and src/data/maps/{lav1,lav2,lav3}.ts.
//
// Route (test 1):
//   d.warp -> lav1 (9,10) -> (10,8) past the sign -> row 8 east -> stairs (18,7) -> lav2 lands (1,2)
//   -> column 1 down to (1,9) -> row 9 east to (8,9) -> the gap (8,8) ->
//   mist (8,6) -> (9,6), face up: the SCOPE ball at (9,5) -> back to row 9
//   -> east to (18,9) -> stairs (18,10), ghost gone -> lav3 lands (18,9) ->
//   west to (16,9), face west: the CHARM ball at (15,9) -> column 18 up to
//   (18,2) -> row 2 west to (6,2): the spirit -> ITEM -> BONE CHARM -> (2,2),
//   face up: the altar (2,1) -> Myowth runs in -> ride YES -> HQ (9,12) ->
//   (7,4), Giovanni at (7,3): hand-in -> end screen.
import { test, expect, type Page } from '@playwright/test';
import { bootToWorld } from './boot';

// Matches chapter1–4.spec.ts's global Window.__debug augmentation exactly —
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
    battle: { phase: string; sel: number } | null;
    map: { npcs: { id: string; x: number; y: number }[] };
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

/** Mash A through the battle's opening messages until the root menu is up. */
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
 *  tap per frame, so one press per row). */
async function battleCursor(page: Page, sel: number): Promise<void> {
  for (let i = 0; i < sel; i++) {
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(40);
  }
  await page.waitForFunction((s) => (window.__debug as unknown as DebugFull).G.battle?.sel === s, sel, { timeout: 2_000 });
}

// Seed a completed CH1–CH4 (rank LIEUTENANT, the CH5 briefing heard),
// silence wild rolls, and level the starter to 30 outright — chapter3/4's
// escape hatch: gainXp full-heals on every level-up crossed, so a bare hp
// boost would be wiped mid-run by the first ding.
async function seedPostCh4(page: Page, coins: number): Promise<void> {
  await page.evaluate(
    ([c]) => {
      const d = window.__debug as unknown as DebugFull;
      for (const f of [
        'briefed', 'guardBeaten', 'switchFound', 'lootTaken', 'missionDone',
        'fossilsTaken', 'bradBeaten', 'ch2Done',
        'spanCamper', 'spanPicnicker', 'spanHiker', 'spanYoungster', 'spanLass', 'ch3Done',
        'ch4Suit', 'ch4Safe', 'ch4Done', 'ch5Briefed',
      ]) d.quest.flags[f] = true;
      d.quest.rank = 'LIEUTENANT';
      d.quest.coins = c;
      d.noEncounters();
      d.G.party[0].lv = 30;
      d.G.party[0].hp = 999;
    },
    [coins],
  );
}

test('Chapter 5: SCOPE, CHARM, the spirit ended with the charm, the mask, Myowth joins, hand-in', async ({ page }) => {
  test.setTimeout(240_000);
  await bootToWorld(page);
  await seedPostCh4(page, 100);

  // ── 1F: the fog is on (no SCOPE), the stairs are at (18,7) ─────────────
  await page.evaluate(() => {
    (window.__debug as unknown as DebugFull).warp(['lav1', 9, 10, 'up']);
  });
  await waitForMap(page, 'lav1');
  expect(await items(page)).not.toContain('SILF SCOPE');
  await walk(page, 'ArrowRight', 1, 10, 10); // the sign sits at (9,9) — sidestep to column 10
  await walk(page, 'ArrowUp', 2, 10, 8); // column 10 rows 8–10 open
  await walk(page, 'ArrowRight', 8, 18, 8); // row 8 is clear floor x1..18
  await walk(page, 'ArrowUp', 1, 18, 7); // steps onto '>', auto-warps
  await waitForMap(page, 'lav2');

  // ── 2F lands (1,2): the ghost holds the stairs (18,10) until the SCOPE.
  //    Column 1 down to row 9, east to the gap under the mist room ───────
  const ghostBefore = await page.evaluate(() => {
    const d = window.__debug as unknown as DebugFull;
    return d.G.map.npcs.find((n) => n.id === 'stair_ghost');
  });
  expect(ghostBefore).toMatchObject({ x: 18, y: 10 });
  await walk(page, 'ArrowDown', 7, 1, 9);
  await walk(page, 'ArrowRight', 7, 8, 9); // row 9 clear x1..18
  await walk(page, 'ArrowUp', 3, 8, 6); // (8,8) is the gap, (8,7)/(8,6) mist
  await walk(page, 'ArrowRight', 1, 9, 6);
  await tapDir(page, 'ArrowUp'); // the ball at (9,5) blocks — this only turns
  await waitFrames(page, 4); // let the held-arrow release land before A (a press on the same frame is dropped)
  await page.keyboard.press('z');
  await waitFrames(page, 2); // the press is consumed on the NEXT frame — settle() would read a stale 'world'
  await settle(page, 5_000); // "Found a SILF SCOPE!"
  expect(await items(page)).toContain('SILF SCOPE');

  // ── back down through the gap, east along row 9, onto the stairs ───────
  await walk(page, 'ArrowDown', 3, 9, 9); // (9,8) is the other gap cell
  await walk(page, 'ArrowRight', 9, 18, 9);
  await walk(page, 'ArrowDown', 1, 18, 10); // the ghost is goneIf hasItem — steps onto '>'
  await waitForMap(page, 'lav3');

  // ── 3F lands (18,9): the CHARM ball at (15,9), two tiles west ──────────
  await walk(page, 'ArrowLeft', 2, 16, 9);
  await tapDir(page, 'ArrowLeft'); // the ball blocks — turns only
  await waitFrames(page, 4);
  await page.keyboard.press('z');
  await waitFrames(page, 2);
  await settle(page, 5_000);
  expect(await items(page)).toContain('BONE CHARM');

  // ── column 18 up to row 2, west along row 2 to the spirit at (6,2) ─────
  await walk(page, 'ArrowRight', 2, 18, 9);
  await walk(page, 'ArrowUp', 7, 18, 2);
  await walk(page, 'ArrowLeft', 12, 6, 2); // step:6,2 fires on arrival
  const xpBefore = await page.evaluate(() => (window.__debug as unknown as DebugFull).G.party[0].xp);
  await waitForBattleMenu(page, 30_000);

  // ── the unwinnable fight: ITEM (root index 3) -> BONE CHARM (only entry,
  //    SMOKE BALL is off the list here) -> onWin sets ch5Spirit ───────────
  await battleCursor(page, 3);
  await page.keyboard.press('z');
  await page.waitForFunction(() => (window.__debug as unknown as DebugFull).G.battle?.phase === 'item', undefined, { timeout: 3_000 });
  await page.keyboard.press('z');
  await drainUntilFlag(page, 'ch5Spirit', 30_000);
  await settle(page, 10_000);
  expect((await flags(page)).ch5Spirit).toBe(true);
  expect(await items(page)).not.toContain('BONE CHARM'); // consumed
  const xpAfter = await page.evaluate(() => (window.__debug as unknown as DebugFull).G.party[0].xp);
  expect(xpAfter).toBe(xpBefore); // nothing was defeated
  expect(await page.evaluate(() => window.__debug.G.map.id)).toBe('lav3');

  // ── the altar at (2,1), faced from (2,2) ────────────────────────────────
  await walk(page, 'ArrowLeft', 4, 2, 2);
  await tapDir(page, 'ArrowUp'); // the K/$/K row blocks — turns only
  await waitFrames(page, 4);
  await page.keyboard.press('z');
  await drainUntilFlag(page, 'ch5Mask', 20_000);
  expect(await items(page)).toContain('BONE MASK');

  // ── Myowth runs in (npcRun holds 'world' with input frozen), then talks;
  //    the join sets ch5Myowth; the ride-home choice follows (YES = sel 0) ─
  await page.waitForFunction(() => window.__debug.G.state === 'dialog', undefined, { timeout: 15_000 });
  await drainUntilFlag(page, 'ch5Myowth', 30_000);
  const party = await page.evaluate(() => (window.__debug as unknown as DebugFull).G.party.map((m) => m.species));
  expect(party).toHaveLength(2);
  expect(party[1]).toBe('myowth');
  const rideStart = Date.now();
  while (Date.now() - rideStart < 15_000) {
    if ((await state(page)) !== 'dialog') break;
    await page.keyboard.press('z');
    await page.waitForTimeout(50);
  }
  await waitForMap(page, 'hq', 15_000);
  expect(await page.evaluate(() => [window.__debug.G.player.x, window.__debug.G.player.y])).toEqual([9, 12]);

  // ── the hand-in: (9,12) -> (7,12) -> column 7 up to (7,4), Giovanni (7,3)
  await settle(page, 5_000);
  await walk(page, 'ArrowLeft', 2, 7, 12);
  await walk(page, 'ArrowUp', 8, 7, 4);
  await waitFrames(page, 4);
  await page.keyboard.press('z');
  await drainUntilFlag(page, 'ch5Done', 20_000);
  await page.waitForFunction(() => window.__debug.G.state === 'end', undefined, { timeout: 10_000 });

  const final = await page.evaluate(() => {
    const d = window.__debug as unknown as DebugFull;
    return { ch5Done: d.quest.flags.ch5Done, rank: d.quest.rank, coins: d.quest.coins };
  });
  expect(final.ch5Done).toBe(true);
  expect(final.rank).toBe('LIEUTENANT'); // CH5.0 assumption 1: no promotion this chapter
  expect(final.coins).toBe(900); // 100 seeded + the 800 hand-in; no other payday on this route
});

test('Chapter 5: losing to the spirit is the clean loss — no coins lost, party healed, still on 3F', async ({ page }) => {
  test.setTimeout(120_000);
  await bootToWorld(page);
  await seedPostCh4(page, 500);
  await page.evaluate(() => {
    const d = window.__debug as unknown as DebugFull;
    d.warp(['lav3', 7, 2, 'left']);
  });
  await waitForMap(page, 'lav3');
  await page.evaluate(() => (window.__debug as unknown as DebugFull).setHp(0, 1)); // one hit ends it
  expect(await items(page)).not.toContain('BONE CHARM');
  await walk(page, 'ArrowLeft', 1, 6, 2); // step:6,2
  await waitForBattleMenu(page, 30_000);

  // FIGHT (sel 0) -> first move: it passes through, the spirit hits back,
  // the 1-hp starter drops -> "Overwhelmed..." -> onLose's whisper.
  await page.keyboard.press('z');
  await page.waitForFunction(() => (window.__debug as unknown as DebugFull).G.battle?.phase === 'moves', undefined, { timeout: 3_000 });
  await page.keyboard.press('z');
  await settle(page, 60_000);
  await page.waitForFunction(() => window.__debug.G.state === 'world', undefined, { timeout: 10_000 });

  const after = await page.evaluate(() => {
    const d = window.__debug as unknown as DebugFull;
    return { coins: d.quest.coins, hp: d.G.party[0].hp, map: window.__debug.G.map.id, spirit: d.quest.flags.ch5Spirit };
  });
  expect(after.coins).toBe(500);
  expect(after.hp).toBeGreaterThan(1); // healed in place, not the whiteout
  expect(after.map).toBe('lav3');
  expect(after.spirit).toBe(false);
});
