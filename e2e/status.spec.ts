// F43 STA.1 Playwright spec: a party mon rigged with PSN (the real
// tryInflict, via __debug.inflict) takes a poison tick at the end of its own
// battle action — the mechanic reaching the real battle loop, not just the
// pure status.ts module (tests/status.test.ts) or the mocked-IO whole-battle
// tests (tests/status-battle.test.ts).
//
// Route: boot -> HQ -> __debug.party(1, 12) (KOFFINK, tackle/smog/screech at
// lv12) -> __debug.inflict(0, 'PSN') -> __debug.startBattle('ship_hold') (a
// registered trainer encounter — chapter7.spec.ts already drives real fights
// from it, and __debug.startBattle only takes a registered id, not a wild
// roll) -> FIGHT -> the first move (tackle) once.
//
// FB round: an hp-only assertion here can't fail on a poison regression — the
// foe's own hit alone satisfies "hp dropped this turn" whether or not the
// tick ever fires. Instead poll the live battle message queue while draining
// the turn and assert the actual "hurt by poison!" page (STATUS_LINES.poison,
// status.ts) showed up on screen — the mechanic itself, not a number that
// could come from somewhere else.
import { test, expect, type Page } from '@playwright/test';
import { bootToWorld } from './boot';

// Matches every other e2e spec's global Window.__debug augmentation exactly
// — TS requires identical merged member types for a property declared across
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

// Fields this spec needs beyond DebugHandle's minimal shape — read through
// this local cast, the same pattern every other chapter spec uses.
interface DebugFull {
  G: {
    party: { species: string; hp: number; lv: number; status?: string }[];
    battle: { phase: string; sel: number; msg: { lines: string[] } | null } | null;
  };
  party: (n: number, lv: number) => void;
  inflict: (key: number | string, id: 'PSN' | 'PAR' | 'SLP') => void;
  startBattle: (enc: string) => void;
}

async function state(page: Page): Promise<string> {
  return page.evaluate(() => window.__debug.G.state);
}
async function battlePhase(page: Page): Promise<string | null> {
  return page.evaluate(() => (window.__debug as unknown as DebugFull).G.battle?.phase ?? null);
}
async function status0(page: Page): Promise<string | undefined> {
  return page.evaluate(() => (window.__debug as unknown as DebugFull).G.party[0].status);
}

// Frame-count wait, never wall clock (boot.ts's idiom — an A press lands on
// the NEXT rAF tick).
async function waitFrames(page: Page, n: number): Promise<void> {
  const f0 = await page.evaluate(() => window.__debug.G.frame);
  await page.waitForFunction(([f]) => window.__debug.G.frame >= f, [f0 + n], { timeout: n * 40 + 5_000 });
}

/** Mash A through opening messages until the battle root menu is up
 *  (chapter5/7.spec.ts's idiom). */
async function waitForBattleMenu(page: Page, maxMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    if ((await battlePhase(page)) === 'menu') return;
    if ((await state(page)) === 'battle' || (await state(page)) === 'dialog') await page.keyboard.press('z');
    await page.waitForTimeout(50);
  }
  throw new Error('battle root menu never came up');
}

/** Mash A through whatever message cascade follows a turn until the battle
 *  is interactive again (menu) or the game leaves 'battle' entirely —
 *  recording every message page seen along the way (joined lines), so the
 *  caller can assert the actual mechanic fired instead of inferring it from
 *  a number. Frame-polled, never a fixed sleep (an A press lands on the
 *  NEXT rAF tick — boot.ts's idiom). */
async function drainToMenu(page: Page, maxMs: number): Promise<string[]> {
  const seen = new Set<string>();
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const lines = await page.evaluate(() => (window.__debug as unknown as DebugFull).G.battle?.msg?.lines ?? null);
    if (lines) seen.add(lines.join(' '));
    if ((await battlePhase(page)) === 'menu' || (await state(page)) !== 'battle') return [...seen];
    await page.keyboard.press('z');
    await waitFrames(page, 2);
  }
  throw new Error('battle never settled back to the root menu');
}

test('a party mon rigged with PSN takes a poison tick at the end of its own action', async ({ page }) => {
  test.setTimeout(60_000);
  await bootToWorld(page);

  await page.evaluate(() => {
    const d = window.__debug as unknown as DebugFull;
    d.party(1, 12);
    d.inflict(0, 'PSN');
    d.startBattle('ship_hold');
  });
  await page.waitForFunction(() => (window.__debug as unknown as DebugFull).G.battle !== null, undefined, { timeout: 5_000 });
  expect(await status0(page)).toBe('PSN');
  await waitForBattleMenu(page, 15_000);

  // FIGHT -> the first move (tackle) -> whatever message cascade follows
  // (the "used TACKLE!" line, the hit, the "hurt by poison!" tick, the foe's
  // reply) drained until the menu is back up, recording every page shown.
  await page.keyboard.press('z');
  await waitFrames(page, 2);
  await page.keyboard.press('z');
  await waitFrames(page, 2);
  const pages = await drainToMenu(page, 30_000);

  // The mechanic itself, not a number that could come from the foe's own
  // hit alone (STATUS_LINES.poison, src/systems/status.ts).
  expect(pages.some((p) => p.includes('hurt by poison!'))).toBe(true);
  expect(await status0(page)).toBe('PSN'); // no mid-battle cure
});
