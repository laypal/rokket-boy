// Chapter 8 Playwright spec (CH8.3, expansion plan §9): SAFARI ZOON — the
// first branching chapter. Both tests seed straight to THE PENS via
// __debug.ch8pens() (lands (9,10) facing up on safari3, rules already
// taught, both branch flags cleared) and drive ONE of the two mutually
// exclusive points of no return: the PRIZE CRATE 'X' (4,5), faced from
// (4,6) facing up (the LOYAL act), or the PEN LEVER 'C' (15,7), faced from
// (15,8) facing up (the BETRAYAL act). Each opens two say pages then a
// YES/NO choice defaulting to YES (dialog.ts: sel starts at 0 — mashing A
// through an armed choice confirms YES, so no cursor move is needed for
// either test here). src/data/dialog/safari3.ts pins the contract: either
// YES sets `heat: 2` on the shared 'park' zone, and the OTHER interactable
// collapses to a single locked-off say page once CHOSEN is true.
//
// currentObjective() (quest.ts) is a pure function of the flags this spec
// already reads and is pinned against these exact CH8 flag states by
// tests/ch8-contracts.test.ts; it is not exposed on window.__debug (menu.ts
// calls it directly from the STATUS sub-screen's draw step, so nothing
// stores its string in reachable state) and no accessor should be added to
// src/ for one e2e spec, so the "STATUS reads ..." assertions below check
// the flags that drive it rather than opening START -> STATUS to OCR a
// canvas.
//
// Route (test 1, loyal): d.ch8pens() -> safari3 (9,10) up -> west to (4,10),
// north to (4,6): all floor -> face up, A through both say pages, YES ->
// ch8Poached, PRIZE CRATE, heat 2 -> down to (4,8), east to (15,8): all
// floor -> face up: the lever, now CHOSEN -> one locked say page, no choice
// -> d.warp(['safari1',5,9,'up']) -> warden present (goneIf false), petrelle
// gone.
//
// Route (test 2, betrayal): d.ch8pens() -> safari3 (9,10) up -> east to
// (15,10), north to (15,8): all floor -> face up, A through both say pages,
// YES -> ch8Freed, the six pen fronts open (setTile ' ') -> d.warp(['safari1',
// 5,9,'up']) -> petrelle present, warden gone.
import { test, expect, type Page } from '@playwright/test';
import { bootToWorld } from './boot';

// Matches every other chapter spec's global Window.__debug augmentation
// exactly — TS requires identical merged member types for a property
// declared across multiple files.
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
    map: { grid: string[][]; npcs: { id: string; x: number; y: number }[] };
    heatState: Partial<Record<string, { stage: number; decayAt: number; lockdownAt: number | null }>>;
  };
  quest: {
    flags: Record<string, boolean>;
    items: string[];
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
async function items(page: Page): Promise<string[]> {
  return page.evaluate(() => (window.__debug as unknown as DebugFull).quest.items);
}

// One tile: press, wait for the move to start, release before it finishes —
// chapter1.spec.ts's tapDir (copied, not imported, per this repo's
// per-spec-file convention).
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

// Frame-count wait, never wall clock (boot.ts's idiom — an A press lands on
// the NEXT rAF tick).
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

// Drain whatever dialog cascade follows, mashing A, until the game settles
// back into 'world'. A choice's last page arms once fully typed and then
// confirms YES on the very next A (dialog.ts: sel defaults to 0) — so this
// same mash both pages through the say lines and answers YES.
async function settle(page: Page, maxMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const s = await state(page);
    if (s === 'world') return;
    if (s === 'dialog' || s === 'battle') await page.keyboard.press('z');
    await page.waitForTimeout(50);
  }
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

/** Face a blocked tile (an `at:` interactable) and press A: the tap only
 *  turns, the held-arrow release has to land before A (a press on the same
 *  frame is dropped), and the press is consumed on the NEXT frame
 *  (chapter5's lesson) — so wait a beat on both sides. */
async function faceAndPress(page: Page, key: ArrowKey): Promise<void> {
  await tapDir(page, key);
  await waitFrames(page, 4);
  await page.keyboard.press('z');
  await waitFrames(page, 2);
}

// Seed CH1-7 done, EXECUTIVE, SAFARI PASS, rules taught, both branch flags
// cleared, landed at THE PENS (9,10) facing up — the REAL __debug.ch8pens()
// (main.ts), not a hand-rolled flag list.
async function seedCh8Pens(page: Page): Promise<void> {
  await page.evaluate(() => {
    const d = window.__debug as unknown as DebugFull;
    (d as unknown as { ch8pens: () => void }).ch8pens();
    (d as unknown as { party: (n: number, lv: number) => void }).party(4, 30);
    d.noEncounters();
  });
}

const PEN_GATES: [number, number][] = [[2, 3], [3, 3], [8, 3], [9, 3], [14, 3], [15, 3]];

// G.map.npcs is the static MapDef list (world.ts: `G.map = MAPS[mapId]`),
// never filtered — npcGone(n) (quest.ts) is what the game applies at
// draw/interact time, and neither it nor currentObjective() is exposed on
// __debug. A npc's `goneIf` is plain flag/notFlag/any data (safari1.ts uses
// only those three shapes for `warden`/`petrelle`), so evaluate it in-page
// against the live flags instead of adding a new accessor for one spec.
type Cond = { flag?: string; notFlag?: string; any?: Cond[] };
async function npcGoneNow(page: Page, id: string): Promise<boolean> {
  return page.evaluate((npcId) => {
    const d = window.__debug as unknown as { G: { map: { npcs: { id: string; goneIf?: Cond }[] } }; quest: { flags: Record<string, boolean> } };
    const n = d.G.map.npcs.find((m) => m.id === npcId);
    if (!n?.goneIf) return false;
    const evalC = (c: Cond): boolean => {
      if (c.flag) return !!d.quest.flags[c.flag];
      if (c.notFlag) return !d.quest.flags[c.notFlag];
      if (c.any) return c.any.some(evalC);
      return false;
    };
    return evalC(n.goneIf);
  }, id);
}

test('Chapter 8: the PRIZE CRATE (loyal) — the lever locks, the warden waits, Petrelle is gone', async ({ page }) => {
  test.setTimeout(120_000);
  await bootToWorld(page);
  await seedCh8Pens(page);
  await waitForMap(page, 'safari3');

  // ── the PRIZE CRATE at (4,5), faced from (4,6): row 10 west, then north
  //    up column 4 — all floor ──────────────────────────────────────────
  await walk(page, 'ArrowLeft', 5, 4, 10);
  await walk(page, 'ArrowUp', 4, 4, 6);
  await faceAndPress(page, 'ArrowUp');
  await drainUntilFlag(page, 'ch8Poached', 20_000);
  await settle(page, 5_000);

  expect((await flags(page)).ch8Poached).toBe(true);
  expect((await flags(page)).ch8Freed).toBe(false);
  expect(await items(page)).toContain('PRIZE CRATE');
  expect(await page.evaluate(() => (window.__debug as unknown as DebugFull).G.heatState.park?.stage)).toBe(2);

  // ── the PEN LEVER at (15,7), faced from (15,8): down to row 8, east —
  //    CHOSEN is true now, so this is one locked-off say page, no choice ──
  await walk(page, 'ArrowDown', 2, 4, 8);
  await walk(page, 'ArrowRight', 11, 15, 8);
  await faceAndPress(page, 'ArrowUp');
  await settle(page, 5_000);
  expect((await flags(page)).ch8Freed).toBe(false); // the locked page never fires the choice

  // ── the STATUS objective: REACH THE PENS/BEAT PETRELLE are met by
  //    ch8Poached alone (quest.ts's `any` steps); BEAT THE WARDEN is the
  //    first unmet step — "reads BEAT THE WARDEN" (currentObjective() has
  //    no __debug accessor; see file header) ──────────────────────────────
  const f1 = await flags(page);
  expect(f1.ch8Warden).toBe(false);
  expect(f1.ch8Freed).toBe(false); // BEAT THE WARDEN's `any` alt is unmet too -> not auto-satisfied

  // ── home: the warden holds the exit tile (goneIf: notFlag ch8Poached OR
  //    flag ch8Warden — both false here, so present); Petrelle's goneIf
  //    (notFlag ch8Freed) is true, so he's gone ───────────────────────────
  await page.evaluate(() => (window.__debug as unknown as DebugFull).warp(['safari1', 5, 9, 'up']));
  await waitForMap(page, 'safari1');
  expect(await npcGoneNow(page, 'warden')).toBe(false);
  expect(await npcGoneNow(page, 'petrelle')).toBe(true);
});

test('Chapter 8: the PEN LEVER (betrayal) — the pens open, Petrelle waits, the warden is gone', async ({ page }) => {
  test.setTimeout(120_000);
  await bootToWorld(page);
  await seedCh8Pens(page);
  await waitForMap(page, 'safari3');

  // ── the PEN LEVER at (15,7), faced from (15,8): row 10 east, then north
  //    up column 15 — all floor ─────────────────────────────────────────
  await walk(page, 'ArrowRight', 6, 15, 10);
  await walk(page, 'ArrowUp', 2, 15, 8);
  await faceAndPress(page, 'ArrowUp');
  await drainUntilFlag(page, 'ch8Freed', 20_000);
  await settle(page, 5_000);

  expect((await flags(page)).ch8Freed).toBe(true);
  expect((await flags(page)).ch8Poached).toBe(false);
  expect(await items(page)).not.toContain('PRIZE CRATE');

  // ── the six pen fronts (dialog/safari3.ts's PEN_GATES): live grid reads
  //    ' ' at every gate — grid[y][x] (chapter7.spec.ts's idiom) ──────────
  const grid = await page.evaluate(() => (window.__debug as unknown as DebugFull).G.map.grid);
  for (const [x, y] of PEN_GATES) expect(grid[y][x]).toBe(' ');

  // ── STATUS: BEAT THE WARDEN is auto-met by ch8Freed (quest.ts's `any`
  //    alt), so BEAT PETRELLE is the first unmet step — currentObjective()
  //    has no __debug accessor (see file header) ──────────────────────────
  const f1 = await flags(page);
  expect(f1.ch8Petrelle).toBe(false);
  expect(f1.ch8Poached).toBe(false); // BEAT PETRELLE's `any` alt is unmet too -> not auto-satisfied

  // ── home: Petrelle holds the exit tile now, the warden is gone ─────────
  await page.evaluate(() => (window.__debug as unknown as DebugFull).warp(['safari1', 5, 9, 'up']));
  await waitForMap(page, 'safari1');
  expect(await npcGoneNow(page, 'petrelle')).toBe(false);
  expect(await npcGoneNow(page, 'warden')).toBe(true);
});
