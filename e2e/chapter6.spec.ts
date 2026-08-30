// Chapter 6 Playwright spec (CH6.4, expansion plan §9): SYLPHCO TOWER — hear
// the ALARM rules from DJames in the lobby, ride the lift pad to the 2F
// stealth floor, cross a guard's gaze on purpose (ALARM 1) and leave it
// behind on the pad, win the CARD KEY off a RECORDS clerk on 3F, come back
// through 2F's east wing and up to the 4F labs, open a card-key door, take
// the lift to 5F, rest on the HEAL PAD, open the office, beat the bodyguard
// duo back to back, lift the BOSS BALL, ride home and hand it in for
// EXECUTIVE. A second test wipes against bodyguard 2 and proves the duo
// restarts from bodyguard 1.
//
// Ch.1–5 are seeded via window.__debug (02-dos-and-donts.md); chapter1–5
// specs remain the sole owners of those walkthroughs. Every walk() below
// names the map row/column it depends on staying open — grids pinned in
// .paul/plan/ch6-sylphco/maps.md and tests/syl-content.test.ts.
import { test, expect, type Page } from '@playwright/test';
import { bootToWorld } from './boot';

// Matches chapter1–5.spec.ts's global Window.__debug augmentation exactly —
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
    battle: { phase: string; sel: number; enc: { trainer?: string }; foe: { species: string } } | null;
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
async function heat(page: Page, mapId: string): Promise<{ stage: number } | undefined> {
  return page.evaluate((id) => (window.__debug as unknown as DebugFull).G.heatState[id], mapId);
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

/** 1f.15: a posted guard's idle gaze turns every 90 frames through down /
 *  right / up / left. Wait for the sweep to be inside [from, to) frames of
 *  its 360-frame cycle so a crossing is deterministic, not timing luck. */
async function waitForGaze(page: Page, from: number, to: number): Promise<void> {
  await page.waitForFunction(
    ([a, b]) => {
      const f = window.__debug.G.frame % 360;
      return f >= a && f < b;
    },
    [from, to],
    { timeout: 10_000 },
  );
}

// Seed a completed CH1–CH5 (rank LIEUTENANT, the CH6 briefing heard),
// silence wild rolls, and level the starter to 30 outright — chapter3–5's
// escape hatch: gainXp full-heals on every level-up crossed, so a bare hp
// boost would be wiped mid-run by the first ding.
async function seedPostCh5(page: Page, coins: number): Promise<void> {
  await page.evaluate(
    ([c]) => {
      const d = window.__debug as unknown as DebugFull;
      for (const f of [
        'briefed', 'guardBeaten', 'switchFound', 'lootTaken', 'missionDone',
        'fossilsTaken', 'bradBeaten', 'ch2Done',
        'spanCamper', 'spanPicnicker', 'spanHiker', 'spanYoungster', 'spanLass', 'ch3Done',
        'ch4Suit', 'ch4Safe', 'ch4Done', 'ch5Briefed', 'ch5Spirit', 'ch5Mask', 'ch5Done', 'ch6Briefed',
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

test('Chapter 6: the rules, the pads, one deliberate sighting, the CARD KEY, the doors, the HEAL PAD, the duo, the BOSS BALL, EXECUTIVE', async ({ page }) => {
  test.setTimeout(300_000);
  await bootToWorld(page);
  await seedPostCh5(page, 100);

  // ── 1F: the lobby door lands (9,10); DJames stands ON the lift pad (3,4).
  //    Row 10 is open x1..18, column 2 rows 4..10 is open (the P at (3,6)
  //    blocks column 3) — approach from (2,4) facing right ────────────────
  await page.evaluate(() => (window.__debug as unknown as DebugFull).warp(['syl1', 9, 10, 'up']));
  await waitForMap(page, 'syl1');
  expect(await items(page)).not.toContain('SMOKE BALL');
  await walk(page, 'ArrowLeft', 7, 2, 10);
  await walk(page, 'ArrowUp', 6, 2, 4);
  await faceAndPress(page, 'ArrowRight'); // DJames at (3,4) blocks — turn + talk
  await drainUntilFlag(page, 'ch6Rules', 30_000);
  await settle(page, 5_000);
  expect((await flags(page)).ch6Rules).toBe(true);
  expect(await items(page)).toContain('SMOKE BALL');

  // ── the express-lift door (10,7) without the key: LOCKED, the hint says
  //    3F, the tile stays 'd'. Row 5 is open x1..18; (10,6) faces it ──────
  await walk(page, 'ArrowDown', 1, 2, 5);
  await walk(page, 'ArrowRight', 8, 10, 5);
  await walk(page, 'ArrowDown', 1, 10, 6);
  await faceAndPress(page, 'ArrowDown');
  await page.waitForFunction(() => window.__debug.G.state === 'dialog', undefined, { timeout: 5_000 });
  await settle(page, 5_000);
  expect(await page.evaluate(() => (window.__debug as unknown as DebugFull).G.map.grid[7][10])).toBe('d');
  await walk(page, 'ArrowUp', 1, 10, 5);
  await walk(page, 'ArrowLeft', 7, 3, 5);
  await walk(page, 'ArrowUp', 1, 3, 4); // the pad is free now — auto-warps
  await waitForMap(page, 'syl2');

  // ── 2F STEALTH lands ON pad A' (1,1). guard_a (7,2) sees (6..4,2) while
  //    his gaze is 'left' (frames 270..359 of the sweep). Step into (4,2) on
  //    purpose: ALARM 0 -> 1. Then back out and take the cone-free column 1
  //    down to pad B (1,10) ────────────────────────────────────────────────
  expect(await heat(page, 'syl2')).toBeUndefined();
  await walk(page, 'ArrowDown', 1, 1, 2);
  await waitForGaze(page, 270, 300); // ≥60 frames of 'left' left — a 3-tile walk is 48
  await walk(page, 'ArrowRight', 3, 4, 2);
  await page.waitForFunction(() => ((window.__debug as unknown as DebugFull).G.heatState.syl2?.stage ?? 0) >= 1, undefined, { timeout: 5_000 });
  expect((await heat(page, 'syl2'))?.stage).toBe(1);
  await walk(page, 'ArrowLeft', 3, 1, 2);
  await walk(page, 'ArrowDown', 8, 1, 10); // column 1 rows 3..9 open; (1,10) is pad B
  await waitForMap(page, 'syl3');
  expect(await heat(page, 'syl2')).toBeUndefined(); // the pad off the floor cleared it (1f warp escape)

  // ── 3F RECORDS lands (1,1). Column 1 down to row 10, row 10 east to
  //    (16,10); clerk_b holds the alcove mouth at (16,9) ───────────────────
  await walk(page, 'ArrowDown', 9, 1, 10);
  await walk(page, 'ArrowRight', 15, 16, 10);
  const coinsBeforeClerk = await page.evaluate(() => (window.__debug as unknown as DebugFull).quest.coins);
  await faceAndPress(page, 'ArrowUp'); // clerk_b blocks — turn + talk -> battle syl_clerk2
  await drainUntilFlag(page, 'sylClerkB', 90_000);
  await settle(page, 10_000);
  expect((await flags(page)).sylClerkB).toBe(true);
  expect(await page.evaluate(() => (window.__debug as unknown as DebugFull).quest.coins)).toBe(coinsBeforeClerk + 200);
  await walk(page, 'ArrowUp', 2, 16, 8); // he's gone (goneIf) — (16,9) then (16,8)
  await faceAndPress(page, 'ArrowLeft'); // the CARD KEY ball at (15,8) blocks — turn + pick up
  await settle(page, 5_000);
  expect(await items(page)).toContain('CARD KEY');
  await walk(page, 'ArrowRight', 1, 17, 8); // pad C -> 2F east wing
  await waitForMap(page, 'syl2');

  // ── 2F east wing lands ON pad C' (19,10): (19,9), then east to pad D
  //    (21,9) -> 4F. The wing is inside the locked door, so no gaze here ──
  expect(await page.evaluate(() => [window.__debug.G.player.x, window.__debug.G.player.y])).toEqual([19, 10]);
  await walk(page, 'ArrowUp', 1, 19, 9);
  await walk(page, 'ArrowRight', 2, 21, 9);
  await waitForMap(page, 'syl4');

  // ── 4F LABS lands ON pad D' (1,1). Column 1 to row 4, row 4 east to
  //    (12,4) — exposed only at (6,4) while guard_d's gaze is 'down'
  //    (frames 0..89) — then (12,6) facing the card-key door (12,7) ────────
  await walk(page, 'ArrowDown', 3, 1, 4);
  await waitForGaze(page, 90, 300); // 210 frames with guard_d looking anywhere but down
  await walk(page, 'ArrowRight', 11, 12, 4);
  await walk(page, 'ArrowDown', 2, 12, 6);
  // CH6.0 §2 / assumption 4: with the CARD KEY held, the floor's `enter`
  // repair already opened the door on arrival — no A press needed
  expect(await page.evaluate(() => (window.__debug as unknown as DebugFull).G.map.grid[7][12])).toBe('o');
  await walk(page, 'ArrowDown', 2, 12, 8); // through the open door into the lift room
  await walk(page, 'ArrowLeft', 1, 11, 8);
  await walk(page, 'ArrowDown', 1, 11, 9); // pad E -> 5F
  await waitForMap(page, 'syl5');
  expect(await heat(page, 'syl4')).toBeUndefined();

  // ── 5F lands ON pad E' (1,1). Column 1 to row 4, row 4 east to (10,4),
  //    down onto the HEAL PAD (10,5): it asks, YES heals ───────────────────
  await walk(page, 'ArrowDown', 3, 1, 4);
  await walk(page, 'ArrowRight', 9, 10, 4);
  await page.evaluate(() => (window.__debug as unknown as DebugFull).setHp(0, 5));
  await walk(page, 'ArrowDown', 1, 10, 5); // step: fires on arrival
  await page.waitForFunction(() => window.__debug.G.state === 'dialog', undefined, { timeout: 5_000 });
  await settle(page, 10_000); // mash A: the page, then YES (sel 0) -> healParty
  const hpAfterPad = await page.evaluate(() => (window.__debug as unknown as DebugFull).G.party[0].hp);
  expect(hpAfterPad).toBeGreaterThan(5);
  // the pad healed to the REAL max — re-arm the seed's hp cushion so the
  // two back-to-back bodyguard fights can't wipe a solo starter
  await page.evaluate(() => {
    (window.__debug as unknown as DebugFull).G.party[0].hp = 999;
  });

  // ── the office: (10,6), row 6 west to (7,6), the door (7,7) below ──────
  await walk(page, 'ArrowDown', 1, 10, 6);
  await walk(page, 'ArrowLeft', 3, 7, 6);
  expect(await page.evaluate(() => (window.__debug as unknown as DebugFull).G.map.grid[7][7])).toBe('o'); // opened on entry (key held)
  await walk(page, 'ArrowDown', 3, 7, 9);
  await walk(page, 'ArrowRight', 1, 8, 9);

  // ── the duo: guard_a at (9,9). syl_guard1 -> onWin { battle: 'syl_guard2' }
  //    with no world frame between; the party's hp carries over ───────────
  const hpBeforeDuo = await page.evaluate(() => (window.__debug as unknown as DebugFull).G.party[0].hp);
  await faceAndPress(page, 'ArrowRight');
  let sawWorldMidDuo = false;
  let sawGuard2 = false;
  const duoStart = Date.now();
  while (Date.now() - duoStart < 180_000) {
    const d = await page.evaluate(() => {
      const x = window.__debug as unknown as DebugFull;
      return { state: window.__debug.G.state, foe: x.G.battle?.foe.species ?? null, duo: x.quest.flags.ch6Duo };
    });
    if (d.duo) break;
    if (d.foe === 'machoke') sawGuard2 = true;
    if (sawGuard2 && d.state === 'world') sawWorldMidDuo = true;
    if (d.state === 'dialog' || d.state === 'battle') await page.keyboard.press('z');
    await page.waitForTimeout(50);
  }
  expect(sawGuard2).toBe(true);
  expect(sawWorldMidDuo).toBe(false);
  expect((await flags(page)).ch6Duo).toBe(true);
  expect(hpBeforeDuo).toBeGreaterThan(0);
  await settle(page, 10_000);

  // ── the chest (9,8): both bodyguards are gone, (9,9) is free ───────────
  await walk(page, 'ArrowRight', 1, 9, 9);
  await faceAndPress(page, 'ArrowUp');
  await drainUntilFlag(page, 'ch6Ball', 20_000);
  expect(await items(page)).toContain('BOSS BALL');
  // the ride-home choice follows (YES = sel 0)
  const rideStart = Date.now();
  while (Date.now() - rideStart < 15_000) {
    if ((await state(page)) !== 'dialog') break;
    await page.keyboard.press('z');
    await page.waitForTimeout(50);
  }
  await waitForMap(page, 'hq', 15_000);
  expect(await page.evaluate(() => [window.__debug.G.player.x, window.__debug.G.player.y])).toEqual([9, 12]);

  // ── the hand-in: (9,12) -> (7,12) -> column 7 up to (7,4), Giovanni (7,3):
  //    say, setFlag ch6Done, music, rankUp (suspends into 'rankcard'),
  //    endScreen — the CH3/CH4 idiom: mash until the rank card takes over ──
  await settle(page, 5_000);
  await walk(page, 'ArrowLeft', 2, 7, 12);
  await walk(page, 'ArrowUp', 8, 7, 4);
  await waitFrames(page, 4);
  await page.keyboard.press('z');
  const handStart = Date.now();
  while (Date.now() - handStart < 30_000) {
    const s = await state(page);
    if (s === 'rankcard') break;
    if (s === 'dialog' || s === 'battle') await page.keyboard.press('z');
    await page.waitForTimeout(50);
  }
  await page.waitForFunction(() => window.__debug.G.state === 'rankcard', undefined, { timeout: 5_000 });
  await page.waitForFunction(() => (window.__debug as unknown as DebugFull).G.endT > 60, undefined, { timeout: 5_000 });
  await page.keyboard.press('z'); // dismiss the rank card -> endScreen
  await page.waitForFunction(() => window.__debug.G.state === 'end', undefined, { timeout: 10_000 });

  const final = await page.evaluate(() => {
    const d = window.__debug as unknown as DebugFull;
    return { ch6Done: d.quest.flags.ch6Done, rank: d.quest.rank, coins: d.quest.coins };
  });
  expect(final.ch6Done).toBe(true);
  expect(final.rank).toBe('EXECUTIVE'); // CH6.0 assumption 1
  expect(final.coins).toBe(100 + 200 + 1500); // seed + clerk_b's payday + the EXECUTIVE grant; no other payday on this route
});

test('Chapter 6: a wipe against bodyguard 2 is the ordinary whiteout, and the duo restarts from bodyguard 1', async ({ page }) => {
  test.setTimeout(180_000);
  await bootToWorld(page);
  await seedPostCh5(page, 500);
  await page.evaluate(() => {
    const d = window.__debug as unknown as DebugFull;
    d.quest.flags.ch6Rules = true;
    d.quest.items.push('CARD KEY');
    d.warp(['syl5', 8, 9, 'right']);
  });
  await waitForMap(page, 'syl5');
  // the floor's `enter` script (the door repair) runs once the fade has
  // lifted and worldUpdate returns early until then — a press inside that
  // window is dropped, so let the fade and the enter pass go by first
  await waitFrames(page, 16);
  await faceAndPress(page, 'ArrowRight'); // guard_a at (9,9) blocks — turn + talk
  // "Take a number." is a dialog page before the fight — mash through it
  const talkStart = Date.now();
  while (Date.now() - talkStart < 15_000) {
    if ((await page.evaluate(() => (window.__debug as unknown as DebugFull).G.battle?.foe.species ?? null)) === 'machopp') break;
    if ((await state(page)) === 'dialog') await page.keyboard.press('z');
    await page.waitForTimeout(50);
  }
  expect(await page.evaluate(() => (window.__debug as unknown as DebugFull).G.battle?.foe.species)).toBe('machopp');
  // win guard 1 (lv 30 starter), then the moment guard 2 takes the field,
  // drop the starter to 1 hp so his first hit ends it
  await page.waitForFunction(() => (window.__debug as unknown as DebugFull).G.battle?.foe.species === 'machoke', undefined, { timeout: 120_000 }).catch(() => undefined);
  const g2Start = Date.now();
  while (Date.now() - g2Start < 120_000) {
    const foe = await page.evaluate(() => (window.__debug as unknown as DebugFull).G.battle?.foe.species ?? null);
    if (foe === 'machoke') break;
    const s = await state(page);
    if (s === 'dialog' || s === 'battle') await page.keyboard.press('z');
    await page.waitForTimeout(50);
  }
  expect(await page.evaluate(() => (window.__debug as unknown as DebugFull).G.battle?.foe.species)).toBe('machoke');
  await page.evaluate(() => (window.__debug as unknown as DebugFull).setHp(0, 1));
  const wipeStart = Date.now();
  while (Date.now() - wipeStart < 120_000) {
    if ((await page.evaluate(() => window.__debug.G.map.id)) === 'hq') break;
    const s = await state(page);
    if (s === 'dialog' || s === 'battle') await page.keyboard.press('z');
    await page.waitForTimeout(50);
  }
  await waitForMap(page, 'hq', 15_000);
  const after = await page.evaluate(() => {
    const d = window.__debug as unknown as DebugFull;
    return { coins: d.quest.coins, duo: d.quest.flags.ch6Duo, hp: d.G.party[0].hp };
  });
  expect(after.coins).toBe(450); // 10% dropped on the way out
  expect(after.duo).toBe(false); // nothing about bodyguard 1 was recorded
  expect(after.hp).toBeGreaterThan(1); // the whiteout heals

  // back to the office: the duo starts over at bodyguard 1
  await settle(page, 5_000);
  await page.evaluate(() => (window.__debug as unknown as DebugFull).warp(['syl5', 8, 9, 'right']));
  await waitForMap(page, 'syl5');
  await waitFrames(page, 16);
  await faceAndPress(page, 'ArrowRight');
  const retalk = Date.now();
  while (Date.now() - retalk < 15_000) {
    if (await page.evaluate(() => (window.__debug as unknown as DebugFull).G.battle !== null)) break;
    if ((await state(page)) === 'dialog') await page.keyboard.press('z');
    await page.waitForTimeout(50);
  }
  const restart = await page.evaluate(() => {
    const b = (window.__debug as unknown as DebugFull).G.battle!;
    return { trainer: b.enc.trainer, foe: b.foe.species };
  });
  expect(restart).toEqual({ trainer: 'BODYGUARD', foe: 'machopp' });
});
