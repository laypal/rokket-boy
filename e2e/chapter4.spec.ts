// Chapter 4 Playwright spec (CH4.4, expansion plan §9): the S.S. ANN heist —
// suit up at the dock, board disguised, stand in a watch's cone unseen,
// crack the captain's safe, carry the loot off the ship while the zone's
// 5-minute clock runs across two warps, and beat the SECURITY CHIEF's pair
// at the gangway for LIEUTENANT. A second test lets the clock expire.
//
// Ch.1–3 are seeded via window.__debug (02-dos-and-donts.md); chapter1/2/3
// specs remain the sole owners of those walkthroughs. Every walk() below
// names the map row/column it depends on staying open — grids pinned in
// .paul/PLAN.md CH4.0 §6 and src/data/maps/{dock,deck1,deck2,cabin}.ts.
//
// Route (test 1):
//   d.warp -> dock (1,6) -> Jessika (4,6) from (3,6) -> SELECT (Shift) ->
//   row 4 east -> gangway (17,2) -> deck1 lands (2,9) -> (7,4), watch_a's
//   down-cone, 400 frames unseen -> row 8 east -> (21,5) -> aft door (22,5)
//   -> cabin lands (1,3) -> row 5 through cabin_watch's right-cone (covered)
//   -> safe at (14,4) from (13,4) -> heat 3, ~300 s -> out via (6,5) once
//   the gaze is 'up' (its up-cone is column 5, not 6) -> column 6 -> row 1
//   -> door (0,3) -> deck1 (21,5) -> column 21 -> row 9 -> gangway (2,10)
//   -> dock (17,3), clock cleared -> chief (17,4) -> x2 -> rank card -> ride.
import { test, expect, type Page } from '@playwright/test';
import { bootToWorld } from './boot';

// Matches chapter1/2/3.spec.ts's global Window.__debug augmentation exactly —
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
    playSeconds: number;
    party: { hp: number; lv: number }[];
    heatState: Partial<Record<string, { stage: number; decayAt: number; lockdownAt: number | null }>>;
    map: { npcs: { id: string; dir: string; faceDir?: string }[] };
  };
  quest: {
    rank: string;
    coins: number;
    flags: Record<string, boolean>;
  };
  noEncounters: () => void;
  warp: (w: [string, number, number, string]) => void;
  advanceTime: (s: number) => void;
}

type ArrowKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';

async function state(page: Page): Promise<string> {
  return page.evaluate(() => window.__debug.G.state);
}
async function flags(page: Page): Promise<Record<string, boolean>> {
  return page.evaluate(() => window.__debug.quest.flags);
}
async function shipHeat(page: Page): Promise<{ stage: number; lockdownAt: number | null } | undefined> {
  return page.evaluate(() => (window.__debug as unknown as DebugFull).G.heatState.ship);
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

// Frame-count wait, never wall clock (boot.ts's idiom).
async function waitFrames(page: Page, n: number): Promise<void> {
  const f0 = await page.evaluate(() => window.__debug.G.frame);
  await page.waitForFunction(([f]) => window.__debug.G.frame >= f, [f0 + n], { timeout: n * 40 + 5_000 });
}

// Seed a completed CH1–CH3 (rank OPERATIVE), silence wild rolls, and level
// the starter to 30 outright — chapter3.spec.ts's escape hatch: gainXp
// full-heals on every level-up crossed, so a bare hp boost would be wiped
// mid-run by the first ding.
async function seedPostCh3(page: Page, coins: number): Promise<void> {
  await page.evaluate(
    ([c]) => {
      const d = window.__debug as unknown as DebugFull;
      for (const f of [
        'briefed', 'guardBeaten', 'switchFound', 'lootTaken', 'missionDone',
        'fossilsTaken', 'bradBeaten', 'ch2Done',
        'spanCamper', 'spanPicnicker', 'spanHiker', 'spanYoungster', 'spanLass', 'ch3Done',
      ]) d.quest.flags[f] = true;
      d.quest.rank = 'OPERATIVE';
      d.quest.coins = c;
      d.noEncounters();
      d.G.party[0].lv = 30;
      d.G.party[0].hp = 999;
    },
    [coins],
  );
}

test('Chapter 4: suit up, board unseen, crack the safe, carry the loot off under the clock, beat the chief', async ({ page }) => {
  test.setTimeout(240_000);
  await bootToWorld(page);
  await seedPostCh3(page, 0);

  // ── the dock: Jessika hands over the suit ─────────────────────────────
  await page.evaluate(() => {
    (window.__debug as unknown as DebugFull).warp(['dock', 1, 6, 'right']);
  });
  await waitForMap(page, 'dock');
  await walk(page, 'ArrowRight', 2, 3, 6); // row 6 open; Jessika at (4,6)
  await page.keyboard.press('z');
  await drainUntilFlag(page, 'ch4Suit', 20_000);
  await settle(page, 5_000);
  expect((await flags(page)).ch4Suit).toBe(true);

  // ── SELECT: the suit goes on (CH4.1 — Shift is 'select' in input.ts) ──
  expect((await flags(page)).disguised).toBe(false);
  await page.keyboard.press('Shift');
  await page.waitForFunction(() => window.__debug.quest.flags.disguised === true, undefined, { timeout: 3_000 });

  // ── around Jessika via row 4 to the gangway (17,2) ─────────────────────
  await walk(page, 'ArrowUp', 2, 3, 4);
  await walk(page, 'ArrowRight', 14, 17, 4);
  await walk(page, 'ArrowUp', 2, 17, 2);
  await waitForMap(page, 'deck1');
  expect((await flags(page)).disguised).toBe(true); // deck1 declares the disguise — it stays on

  // ── deck1 lands (2,9). Column 2 up to row 4, then east to (7,4): inside
  //    watch_a's (7,3) down-cone. A watch map scans at stage 0 (CH4.0 §1b),
  //    so 400 frames here is four full gaze sweeps — unseen means the suit
  //    works, not that the guard was looking elsewhere ──────────────────
  await walk(page, 'ArrowUp', 5, 2, 4);
  await walk(page, 'ArrowRight', 5, 7, 4);
  await waitFrames(page, 400);
  expect(await shipHeat(page)).toBeUndefined();
  expect((await flags(page)).disguised).toBe(true);

  // ── to the aft door (22,5): down to row 6, one east, down to row 8 (the
  //    pillar sits at (7,7)), east along row 8 to (21,8), up to (21,5) ────
  await walk(page, 'ArrowDown', 2, 7, 6);
  await walk(page, 'ArrowRight', 1, 8, 6);
  await walk(page, 'ArrowDown', 2, 8, 8);
  await walk(page, 'ArrowRight', 13, 21, 8);
  await walk(page, 'ArrowUp', 3, 21, 5);
  await walk(page, 'ArrowRight', 1, 22, 5);
  await waitForMap(page, 'cabin');

  // ── cabin lands (1,3). East to (6,3), down to row 5, east through
  //    cabin_watch's right-cone (covered — no loot yet) to (13,5), up to
  //    (13,4), face the safe at (14,4) ────────────────────────────────────
  await walk(page, 'ArrowRight', 5, 6, 3);
  await walk(page, 'ArrowDown', 2, 6, 5);
  await walk(page, 'ArrowRight', 7, 13, 5);
  await walk(page, 'ArrowUp', 1, 13, 4);
  await tapDir(page, 'ArrowRight'); // turns to face the V tile; it never moves
  expect(await shipHeat(page)).toBeUndefined();
  const t0 = await page.evaluate(() => (window.__debug as unknown as DebugFull).G.playSeconds);
  await page.keyboard.press('z');
  await drainUntilFlag(page, 'ch4Safe', 20_000);
  await settle(page, 5_000);

  // ── the clock: stage 3 on the ZONE key, ~300 s out, not the 1f 20 s ────
  const armed = await shipHeat(page);
  expect(armed?.stage).toBe(3);
  expect(armed?.lockdownAt).not.toBeNull();
  // t0 was read BEFORE the safe's two dialogue pages; the clock arms when
  // { heat: 3 } fires after them, so the deadline is 300 s past a later
  // "now" — at least 300 from t0, and well under the 1f 20 s + any drift.
  expect(armed!.lockdownAt! - t0).toBeGreaterThanOrEqual(300);
  expect(armed!.lockdownAt! - t0).toBeLessThan(330);

  // ── out. (6,5) is the one cone cell on the way (cabin_watch's right-cone
  //    is (6..8,5)); with the loot the suit no longer covers, so cross it
  //    while his gaze is 'up' — that cone is column 5, and column 6 north
  //    of row 5 is outside every facing. Wait for the START of the 'up'
  //    window (gaze turns every 90 frames) so two taps fit inside it ─────
  //    Row 6 is the approach: (8,5) is INSIDE the right-cone, and a guard who
  //    locks on freezes his gaze — the 'up' window would never come ──────
  await walk(page, 'ArrowDown', 2, 13, 6);
  await walk(page, 'ArrowLeft', 7, 6, 6);
  await page.waitForFunction(
    () => {
      const d = window.__debug as unknown as DebugFull;
      const g = d.G.map.npcs.find((n) => n.id === 'cabin_watch');
      return !!g && (g.faceDir ?? g.dir) === 'up' && window.__debug.G.frame % 90 < 12;
    },
    undefined,
    { timeout: 15_000 },
  );
  await walk(page, 'ArrowUp', 4, 6, 2);
  await walk(page, 'ArrowUp', 1, 6, 1);
  await walk(page, 'ArrowLeft', 5, 1, 1);
  await walk(page, 'ArrowDown', 2, 1, 3);
  await walk(page, 'ArrowLeft', 1, 0, 3);
  await waitForMap(page, 'deck1');

  // ── the clock survived a deck-to-deck warp (CH4.0 §1: same zone) ───────
  const carried = await shipHeat(page);
  expect(carried?.stage).toBe(3);
  expect(carried?.lockdownAt).toBe(armed!.lockdownAt);

  // ── deck1 lands (21,5): column 21 down to row 9 (clear of both cones),
  //    west along row 9 to (2,9), down onto the gangway (2,10) ───────────
  await walk(page, 'ArrowDown', 4, 21, 9);
  await walk(page, 'ArrowLeft', 19, 2, 9);
  await walk(page, 'ArrowDown', 1, 2, 10);
  await waitForMap(page, 'dock');

  // ── off the ship: the zone's record is gone, the suit is still declared
  //    here (the dock has `disguise`), and the chief stands at (17,4) ─────
  expect(await shipHeat(page)).toBeUndefined();
  expect((await flags(page)).ch4Safe).toBe(true);
  expect((await flags(page)).ch4Done).toBe(false);
  await page.keyboard.press('z'); // landed at (17,3) facing down, the chief at (17,4)

  // ss_chief1 -> onWin { battle: 'ss_chief2' } -> onWin: setFlag ch4Done,
  // say, music, rankUp (suspends into 'rankcard'), RIDE_HOME choice,
  // endScreen — the CH3 idiom: mash until the rank card takes over.
  const chiefStart = Date.now();
  while (Date.now() - chiefStart < 120_000) {
    const s = await state(page);
    if (s === 'rankcard') break;
    if (s === 'dialog' || s === 'battle') await page.keyboard.press('z');
    await page.waitForTimeout(50);
  }
  await page.waitForFunction(() => window.__debug.G.state === 'rankcard', undefined, { timeout: 5_000 });
  await page.waitForFunction(() => (window.__debug as unknown as DebugFull).G.endT > 60, undefined, {
    timeout: 5_000,
  });
  await page.keyboard.press('z'); // dismiss the rank card -> the ride-home choice

  await page.waitForFunction(() => window.__debug.G.state === 'dialog', undefined, { timeout: 5_000 });
  const rideStart = Date.now();
  while (Date.now() - rideStart < 10_000) {
    if ((await state(page)) !== 'dialog') break;
    await page.keyboard.press('z');
    await page.waitForTimeout(50);
  }
  await page.waitForFunction(() => window.__debug.G.state === 'end', undefined, { timeout: 10_000 });

  const final = await page.evaluate(() => {
    const d = window.__debug as unknown as DebugFull;
    return {
      ch4Done: d.quest.flags.ch4Done,
      disguised: d.quest.flags.disguised,
      rank: d.quest.rank,
      coins: d.quest.coins,
      mapId: window.__debug.G.map.id,
      x: window.__debug.G.player.x,
      y: window.__debug.G.player.y,
    };
  });
  expect(final.ch4Done).toBe(true);
  expect(final.rank).toBe('LIEUTENANT');
  expect(final.coins).toBe(1000); // rankRewards.ts: LIEUTENANT 1000c (+ ROKKET GLOVES); nothing else paid this run
  expect(final.mapId).toBe('hq'); // FLW.4 ride branch
  expect(final.x).toBe(9);
  expect(final.y).toBe(12);
  expect(final.disguised).toBe(false); // HQ declares no disguise — landAt dropped it
});

test('Chapter 4: the clock runs out — whiteout to HQ, 10% coins, the safe stays cracked', async ({ page }) => {
  test.setTimeout(120_000);
  await bootToWorld(page);
  await seedPostCh3(page, 500);
  await page.evaluate(() => {
    const d = window.__debug as unknown as DebugFull;
    d.quest.flags.ch4Suit = true;
    d.warp(['cabin', 13, 4, 'right']); // facing the safe; cabin_watch is 8 tiles off, outside cone and leash
  });
  await waitForMap(page, 'cabin');
  await page.keyboard.press('z');
  await drainUntilFlag(page, 'ch4Safe', 20_000);
  await settle(page, 5_000);
  expect((await shipHeat(page))?.stage).toBe(3);

  // advanceTime only bumps playSeconds; the next worldUpdate tick's heatTick
  // sees the deadline passed and fires the 1f whiteout (heat-1f.spec.ts idiom)
  await page.evaluate(() => (window.__debug as unknown as DebugFull).advanceTime(301));
  await waitForMap(page, 'hq', 15_000);
  await settle(page, 10_000); // "THE GUARDS CAUGHT YOU" + the coin line

  const after = await page.evaluate(() => {
    const d = window.__debug as unknown as DebugFull;
    return { ch4Safe: d.quest.flags.ch4Safe, ch4Done: d.quest.flags.ch4Done, coins: d.quest.coins, ship: d.G.heatState.ship };
  });
  expect(after.ch4Safe).toBe(true); // resumable — walk back to the dock, the chief is waiting
  expect(after.ch4Done).toBe(false);
  expect(after.coins).toBe(450);
  expect(after.ship).toBeUndefined();
});
