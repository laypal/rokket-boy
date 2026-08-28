// Chapter 3 Playwright spec (CH3.4, expansion plan §9): drives the CH3
// critical path — the NUGGET SPAN trainer gauntlet, then AGENT KIRA's
// loyalty test and the OPERATIVE promotion — in one test. Ch.1/Ch.2 are
// seeded via window.__debug (02-dos-and-donts.md: "seed preconditions via
// __debug instead of replaying earlier chapters") rather than replayed;
// chapter1.spec.ts/chapter2.spec.ts remain the sole owners of those
// walkthroughs and are re-run alongside this spec by `npm run test:e2e`.
//
// Route (verified tile-by-tile against src/data/maps/{outskirts,bridge}.ts's
// actual grids — every walk() below names the map row/column it depends on
// staying open):
//   d.warp -> outskirts (10,1) -> outskirts north door (10,0) -> bridge (6,18)
//   -> straight up column x=6 (the lane's open tile, tiles.ts's ' ' is
//   walkable, 'B'/'w' rails/water are not) through the five step: triggers
//   at (6,15/12/9/6/3) -> KIRA's step:6,1 -> rank card -> end.
//
// Follows chapter1.spec.ts/chapter2.spec.ts's idioms exactly: per-tile
// tapDir/walk, state()/flags() readers, settle() dialog-and-battle drain,
// waitForMap() for warp landings, the hp-boost escape hatch and the
// rank-card endT>60 dismiss.
import { test, expect, type Page } from '@playwright/test';
import { bootToWorld } from './boot';

// Matches chapter1.spec.ts / chapter2.spec.ts's global Window.__debug
// augmentation exactly — TS requires identical merged member types for a
// property declared across multiple files.
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
// this local cast, the same pattern every other 1x/CH2 spec uses.
interface DebugFull {
  G: {
    endT: number;
    party: { hp: number; lv: number }[];
  };
  quest: {
    rank: string;
    coins: number;
    flags: Record<string, boolean>;
  };
  noEncounters: () => void;
  warp: (w: [string, number, number, string]) => void;
}

type ArrowKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';

async function state(page: Page): Promise<string> {
  return page.evaluate(() => window.__debug.G.state);
}
async function flags(page: Page): Promise<Record<string, boolean>> {
  return page.evaluate(() => window.__debug.quest.flags);
}
async function coins(page: Page): Promise<number> {
  return page.evaluate(() => (window.__debug as unknown as DebugFull).quest.coins);
}

// One tile: press, wait for the move to actually start (clears the engine's
// 6-frame turn-lock), then release *before* the tile finishes — see
// chapter1.spec.ts's tapDir for the full rationale (same helper, copied
// rather than imported per this repo's per-spec-file convention).
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
// leg here was walked against the real map grids (src/data/maps), so exact
// arrival is the real signal.
async function walk(page: Page, key: ArrowKey, steps: number, x: number, y: number): Promise<void> {
  for (let i = 0; i < steps; i++) await tapDir(page, key);
  await page.waitForFunction(
    ([tx, ty]) => window.__debug.G.player.x === tx && window.__debug.G.player.y === ty,
    [x, y],
    { timeout: 3_000 },
  );
}

// Drain whatever cascade of dialog/battle follows an interaction, mashing A
// the whole way, until the game settles into 'world' or 'end'. Never
// inspects battle-menu text or structure, only G.state — identical contract
// to chapter1.spec.ts/chapter2.spec.ts's settle().
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

// Mash A through a mark's dialog/battle cascade (belt-and-braces `step:`/
// `npc:` triggers, same shape as CH2.7's BRAD ambush) until its onWin flag
// flips. onWin sets the flag BEFORE the trailing storm-off `say` (mirrors
// brad_ratikatt's onWin ordering in encounters.ts), so the caller still owes
// a settle() afterwards to clear that trailing page.
async function drainUntilFlag(page: Page, flag: string, maxMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    if ((await flags(page))[flag]) return;
    const s = await state(page);
    if (s === 'dialog' || s === 'battle') await page.keyboard.press('z');
    await page.waitForTimeout(50);
  }
}

test('Chapter 3: NUGGET SPAN gauntlet, KIRA loyalty test, OPERATIVE promotion', async ({ page }) => {
  test.setTimeout(200_000);

  // ── boot → title → skip the cold open → world (ROKKET HQ) ───────────────
  await bootToWorld(page);

  // ── seed a completed CH1+CH2 (02-dos-and-donts.md: seed via __debug
  //    instead of replaying — chapter1.spec.ts/chapter2.spec.ts remain the
  //    sole owners of those walkthroughs) and silence wild rolls; the span
  //    itself has none (bridge.ts's own comment), but outskirts is an open
  //    room this spec crosses on the way in ───────────────────────────────
  //    Escape hatch: the marks run lv 7-11 and KIRA's arbok is lv 12. A flat
  //    G.party[0].hp = 999 alone isn't enough — mon.ts's gainXp() full-heals
  //    to the NEW max on every level-up crossed (`mon.hp = maxHp(species,
  //    mon.lv)`), and with the starter's real starting level (5) the xp from
  //    six straight wins crosses several level thresholds mid-run, wiping a
  //    999 hp boost the moment the first one fires. Levelling the starter to
  //    30 up front (real maxHp at that level is far below 999, so the boost
  //    stays intact) means the xp gained this run can never push mon.lv past
  //    its already-seeded level, so gainXp's `while (mon.lv < target)` loop
  //    never runs and hp never resets.
  await page.evaluate(() => {
    const d = window.__debug as unknown as DebugFull;
    d.quest.flags.briefed = true;
    d.quest.flags.guardBeaten = true;
    d.quest.flags.switchFound = true;
    d.quest.flags.lootTaken = true;
    d.quest.flags.missionDone = true;
    d.quest.flags.fossilsTaken = true;
    d.quest.flags.bradBeaten = true;
    d.quest.flags.ch2Done = true;
    d.quest.rank = 'AGENT';
    d.noEncounters();
    d.G.party[0].lv = 30;
    d.G.party[0].hp = 999;
  });

  // ── warp straight to the span's front door instead of walking HQ ->
  //    corner -> moon1 -> moon2 -> moonDig -> back out to outskirts; CH3.4's
  //    whole point is that this hook exists so specs don't replay chapters
  //    to reach a mid-campaign map ────────────────────────────────────────
  await page.evaluate(() => {
    (window.__debug as unknown as DebugFull).warp(['outskirts', 10, 1, 'down']);
  });
  await waitForMap(page, 'outskirts');

  // ── outskirts (10,1) -> north door (10,0): one step, auto-warps ─────────
  await walk(page, 'ArrowUp', 1, 10, 0);
  await waitForMap(page, 'bridge');

  // ── bridge lands at (6,18) (outskirts.ts's warp: ['bridge', 6, 18, 'up']).
  //    The lane is x=5/6 (bridge.ts's grid: 'wwwwB  Bwwww', WALKABLE has ' '
  //    but not 'B'/'w'); the five marks stand at x=5, their `step:` triggers
  //    at x=6 beside them (not in front), so a straight climb up column 6
  //    fires every trigger without an NPC ever blocking the tile ──────────
  await walk(page, 'ArrowUp', 3, 6, 15);
  await drainUntilFlag(page, 'spanCamper', 90_000);
  await settle(page, 5_000); // clear the trailing storm-off page + coin sysMsg (world only; sysMsg is non-suspending — world.ts's sysMsg hook just sets a toast, no state change)
  expect(await coins(page)).toBe(40);

  await walk(page, 'ArrowUp', 3, 6, 12);
  await drainUntilFlag(page, 'spanPicnicker', 90_000);
  await settle(page, 5_000);
  expect(await coins(page)).toBe(90);

  await walk(page, 'ArrowUp', 3, 6, 9);
  await drainUntilFlag(page, 'spanHiker', 90_000);
  await settle(page, 5_000);
  expect(await coins(page)).toBe(150);

  await walk(page, 'ArrowUp', 3, 6, 6);
  await drainUntilFlag(page, 'spanYoungster', 90_000);
  await settle(page, 5_000);
  expect(await coins(page)).toBe(230);

  await walk(page, 'ArrowUp', 3, 6, 3);
  await drainUntilFlag(page, 'spanLass', 90_000);
  await settle(page, 5_000);
  expect(await coins(page)).toBe(330);

  // ── the top of the span: KIRA (5,1), trigger at (6,1) — her step: script
  //    checks notFlag:spanLass is now false, so this fires the challenge
  //    directly (kiraScript in dialog/bridge.ts) ───────────────────────────
  await walk(page, 'ArrowUp', 2, 6, 1);

  // KIRA's onWin: setFlag(ch3Done) -> say -> music -> rankUp (suspends into
  // 'rankcard') -> endScreen resumes the script, which now (FLW.4) hits the
  // ride-home { choice } before endScreen (1e rule: rank card FIRST,
  // endScreen LAST — docs/tasks/02-dos-and-donts.md — the choice sits
  // between rankUp and endScreen, still ahead of it). Mash through
  // dialog/battle until the rank card itself takes over, same as
  // chapter2.spec.ts's hq hand-in.
  const kiraStart = Date.now();
  while (Date.now() - kiraStart < 90_000) {
    const s = await state(page);
    if (s === 'rankcard') break;
    if (s === 'dialog' || s === 'battle') await page.keyboard.press('z');
    await page.waitForTimeout(50);
  }
  await page.waitForFunction(() => window.__debug.G.state === 'rankcard', undefined, { timeout: 5_000 });
  await page.waitForFunction(() => (window.__debug as unknown as DebugFull).G.endT > 60, undefined, {
    timeout: 5_000,
  });
  await page.keyboard.press('z'); // dismiss the rank card -> resumes the script -> the ride-home choice

  // FLW.4: this spec takes the ride — mash A through the choice's typewriter
  // (the same "mash while dialog" idiom used above) so it types out and then
  // confirms YES (the default selection), which warps to HQ (9,12) facing up
  // before endScreen.
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
      ch3Done: d.quest.flags.ch3Done,
      rank: d.quest.rank,
      coins: d.quest.coins,
      mapId: window.__debug.G.map.id,
      x: window.__debug.G.player.x,
      y: window.__debug.G.player.y,
    };
  });
  expect(final.ch3Done).toBe(true);
  expect(final.rank).toBe('OPERATIVE');
  // rankRewards.ts pins OPERATIVE at 600 flat coins, no gear — the five
  // marks' payouts (330 total) plus the promotion grant.
  expect(final.coins).toBe(930);
  // FLW.4: proves the ride branch end-to-end — the choice warped the player
  // to HQ's landing cell (9,12) facing up, not just to state 'end'.
  expect(final.mapId).toBe('hq');
  expect(final.x).toBe(9);
  expect(final.y).toBe(12);
  expect(await state(page)).toBe('end');
});
