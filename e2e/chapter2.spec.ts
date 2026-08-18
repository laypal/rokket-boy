// Chapter 2 Playwright spec (CH2.6, expansion plan §9): drives the CH2
// critical path — MT. MOON dig site raid, BRAD boss fight, fossil hand-in —
// in one test. Ch.1 is seeded via window.__debug (per 02-dos-and-donts.md:
// "seed preconditions via __debug instead of replaying earlier chapters")
// rather than replayed; e2e/chapter1.spec.ts remains the sole owner of the
// ch1 walkthrough and is re-run alongside this spec by `npm run test:e2e`.
//
// Route (verified tile-by-tile against src/data/maps/{corner,moon1,moon2,
// moonDig}.ts's actual grids — every walk() below names the map row/column
// it depends on staying open):
//   HQ (9,7) -> corner (9,2) -> cave mouth (19,7) -> moon1 (1,5)
//   -> moon1 stairs (18,9) -> moon2 (2,2) -> moon2 stairs (17,9)
//   -> moonDig (3,2) -> fossil chest (8,4) -> BRAD (8,5)
//   -> moonDig up-stairs (2,2) -> moon2 (18,9) -> moon2 up-stairs (3,2)
//   -> moon1 (17,9) -> moon1 door (0,5) -> corner (18,7) -> HQ doors (10,10)
//   -> HQ (10,12) -> Giovanni (7,4) hand-in.
//
// Follows chapter1.spec.ts's idioms exactly: per-tile tapDir/walk/face,
// state()/flags() readers, settle() dialog-and-battle drain, waitForMap()
// for warp landings. CH2.7 replaced the talk-to-BRAD leg with the ambush
// cascade (chest interact -> npcRun cutscene -> forced battle).
import { test, expect, type Page } from '@playwright/test';
import { bootToWorld } from './boot';

// Matches chapter1.spec.ts / smoke.spec.ts / quest-1e.spec.ts's global
// Window.__debug augmentation exactly — TS requires identical merged member
// types for a property declared across multiple files.
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
    flags: Record<string, boolean>;
  };
  noEncounters: () => void;
}

type ArrowKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';

async function state(page: Page): Promise<string> {
  return page.evaluate(() => window.__debug.G.state);
}
async function flags(page: Page): Promise<Record<string, boolean>> {
  return page.evaluate(() => window.__debug.quest.flags);
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
// to chapter1.spec.ts's settle().
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

test('Chapter 2: MT. MOON raid, BRAD boss fight, fossil hand-in', async ({ page }) => {
  test.setTimeout(150_000);

  // ── boot → title → skip the cold open → world (ROKKET HQ) ───────────────
  await bootToWorld(page);

  // ── seed a completed CH1 (02-dos-and-donts.md: seed via __debug instead
  //    of replaying — chapter1.spec.ts is the standing regression for the
  //    walkthrough itself) and silence wild rolls before touching any `~`
  //    rubble in the cave maps ─────────────────────────────────────────────
  await page.evaluate(() => {
    const d = window.__debug as unknown as DebugFull;
    d.quest.flags.briefed = true;
    d.quest.flags.guardBeaten = true;
    d.quest.flags.switchFound = true;
    d.quest.flags.lootTaken = true;
    d.quest.flags.missionDone = true;
    d.noEncounters();
  });

  // ── HQ (9,7) -> Gamez Corner: reuses chapter1's exact validated leg ──────
  await walk(page, 'ArrowDown', 6, 9, 13);
  await waitForMap(page, 'corner');

  // ── Corner (9,2) -> cave mouth (19,7): column x=18 is clear top-to-bottom
  //    of the arcade-machine rows (verified against corner.ts's grid) ──────
  await walk(page, 'ArrowRight', 9, 18, 2);
  await walk(page, 'ArrowDown', 5, 18, 7);
  await walk(page, 'ArrowRight', 1, 19, 7); // steps onto the 'o' door, auto-warps
  await waitForMap(page, 'moon1');

  // ── moon1 (1,5) -> stairs (18,9): row 5 is fully open corner-to-corner,
  //    then down column x=17 (clear of moon1's `~`/R obstacles) to the
  //    stairs at (18,9) ─────────────────────────────────────────────────────
  await walk(page, 'ArrowRight', 16, 17, 5);
  await walk(page, 'ArrowDown', 4, 17, 9);
  await walk(page, 'ArrowRight', 1, 18, 9); // steps onto '>', auto-warps
  await waitForMap(page, 'moon2');

  // ── moon2 (2,2) -> stairs (17,9): row 1 is clear of moon2's rubble/walls
  //    (row 2 isn't — x3 is the up-stairs back to moon1), then down column
  //    x=17 to the down-stairs ──────────────────────────────────────────────
  await walk(page, 'ArrowUp', 1, 2, 1);
  await walk(page, 'ArrowRight', 15, 17, 1);
  await walk(page, 'ArrowDown', 8, 17, 9); // steps onto '>', auto-warps
  await waitForMap(page, 'moonDig');

  // ── DIG SITE (3,2) -> fossil chest (8,4): the chest at (8,4) is solid
  //    ($ isn't in WALKABLE), so approach from its open west face (7,4) and
  //    interact facing right. CH2.7: the chest set piece now cascades
  //    straight into the BRAD ambush — he runs to the player (a `world`
  //    interlude with input frozen, so plain settle() would bail early),
  //    taunts, and forces the battle. The hp boost therefore happens
  //    BEFORE the chest interact (rationale unchanged from CH2.6: koffink
  //    lv5 and ratikatt lv6 are a 19-vs-19 hp coinflip, and a loss
  //    whitesouts past the whole dungeon — the card's escape hatch; TACKLE
  //    still has to land real hits to win) ─────────────────────────────────
  await page.evaluate(() => {
    (window.__debug as unknown as DebugFull).G.party[0].hp = 999;
  });
  await walk(page, 'ArrowDown', 2, 3, 4);
  await walk(page, 'ArrowRight', 4, 7, 4);
  await page.keyboard.press('z'); // open the chest — the whole ambush follows
  await page.waitForTimeout(200);
  // drain the cascade until BRAD falls: dialog/battle get mashed, the
  // npcRun 'world' interlude just waits (input is frozen by the cutscene)
  const ambushStart = Date.now();
  while (Date.now() - ambushStart < 90_000) {
    if ((await flags(page)).bradBeaten) break;
    const s = await state(page);
    if (s === 'dialog' || s === 'battle') await page.keyboard.press('z');
    await page.waitForTimeout(50);
  }
  expect((await flags(page)).fossilsTaken).toBe(true);
  expect((await flags(page)).bradBeaten).toBe(true);
  await settle(page, 5_000); // clear the trailing storm-off dialog

  // ── Return: DIG SITE -> moon2 -> moon1 -> corner -> HQ (from (7,4) —
  //    the ambush fought us at the chest, no walk to (7,5) anymore) ────────
  await walk(page, 'ArrowLeft', 5, 2, 4);
  await walk(page, 'ArrowUp', 2, 2, 2); // steps onto '>', auto-warps
  await waitForMap(page, 'moon2');

  await walk(page, 'ArrowUp', 8, 18, 1);
  await walk(page, 'ArrowLeft', 15, 3, 1);
  await walk(page, 'ArrowDown', 1, 3, 2); // steps onto '>', auto-warps
  await waitForMap(page, 'moon1');

  await walk(page, 'ArrowUp', 4, 17, 5);
  await walk(page, 'ArrowLeft', 17, 0, 5); // steps onto the door, auto-warps
  await waitForMap(page, 'corner');

  // corner (18,7) -> HQ doors (10,10): down to the fully-open row 8, left to
  // x=10, then straight down (row 9 is only blocked at x=1/18, clear at x=10)
  await walk(page, 'ArrowDown', 1, 18, 8);
  await walk(page, 'ArrowLeft', 8, 10, 8);
  await walk(page, 'ArrowDown', 2, 10, 10); // steps onto the door, auto-warps
  await waitForMap(page, 'hq');

  // ── Hand-in: Giovanni (7,3), approached from (7,4) facing up — reuses
  //    chapter1's exact validated final leg. With ch1's flags seeded (not
  //    replayed), hq.ts's `enter` "you actually did it" line never fires
  //    here (it's gated on notFlag missionDone), so no extra dialog to
  //    drain before this ────────────────────────────────────────────────────
  await walk(page, 'ArrowLeft', 3, 7, 12);
  await walk(page, 'ArrowUp', 8, 7, 4);

  // hq.ts's ch2 hand-in branch: two-page say -> setFlag ch2Done -> music
  // -> rankUp (suspends into 'rankcard') -> endScreen (1e rule: rank card
  // FIRST, endScreen LAST — docs/tasks/02-dos-and-donts.md). settle() only
  // drains 'dialog'/'battle', so it idles harmlessly once state flips to
  // 'rankcard'; the rank card itself needs the explicit endT>60 wait and
  // dismiss quest-1e.spec.ts's rankUp test uses.
  await page.keyboard.press('z');
  await page.waitForTimeout(200);
  await settle(page, 5_000);
  await page.waitForFunction(() => window.__debug.G.state === 'rankcard', undefined, { timeout: 5_000 });
  await page.waitForFunction(() => (window.__debug as unknown as DebugFull).G.endT > 60, undefined, {
    timeout: 5_000,
  });
  await page.keyboard.press('z'); // dismiss the rank card -> resumes the script -> endScreen
  await page.waitForFunction(() => window.__debug.G.state === 'end', undefined, { timeout: 5_000 });

  const final = await page.evaluate(() => {
    const d = window.__debug as unknown as DebugFull;
    return { ch2Done: d.quest.flags.ch2Done, rank: d.quest.rank };
  });
  expect(final.ch2Done).toBe(true);
  expect(final.rank).toBe('AGENT');
  expect(await state(page)).toBe('end');
});
