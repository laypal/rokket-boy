// SIDE.1 Playwright spec: the HQ job board — take a contract, complete it,
// hand it in. Follows inventory-1c.spec.ts's conventions exactly: boot via
// the title/intro sequence, drive the modal through the dev-only
// __debug.openJobs opener (never the held-key tile-chain walk), assert state
// through __debug (never pixels). The offer list is seeded from
// (rank, jobsDone) so a fresh GRUNT game always sees the same board — but
// this spec deliberately reads the taken contract back from __debug instead
// of pinning offer contents (the unit suite owns the pin).
import { test, expect, type Page } from '@playwright/test';
import { bootToWorld } from './boot';

// Matches the shared global Window.__debug augmentation (see
// inventory-1c.spec.ts's comment on merged declaration types).
interface DebugHandle {
  G: { state: string; frame: number; map: { id: string; name: string }; player: { x: number; y: number } };
  quest: { flags: Record<string, boolean> };
}
declare global {
  interface Window {
    __debug: DebugHandle;
  }
}

interface JobLike {
  kind: string;
  item?: string;
  need: number;
  payout: number;
  base: number;
}
interface DebugFull {
  G: { state: string };
  quest: { coins: number; items: string[]; job: JobLike | null };
  openJobs: () => void;
}

async function press(page: Page, key: string): Promise<void> {
  await page.keyboard.press(key);
  await page.waitForTimeout(300);
}

async function openBoard(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window.__debug as unknown as DebugFull).openJobs();
  });
  await page.waitForFunction(() => window.__debug.G.state === 'jobs', undefined, { timeout: 5_000 });
}

test('JOB BOARD: take a fetch contract, fulfil it, hand it in for the payout', async ({ page }) => {
  await bootToWorld(page);

  // Given a fresh GRUNT game: every offer is a fetch contract (rank gating —
  // the unit suite pins the exact set). A takes slot 0's offer; the list
  // stays the root view (SIDE.1-FB).
  await openBoard(page);
  await press(page, 'z');
  const taken = await page.evaluate(() => {
    const d = window.__debug as unknown as DebugFull;
    return d.quest.job;
  });
  expect(taken).not.toBeNull();
  expect(taken!.kind).toBe('fetch');

  // A on the active slot opens its submenu; HAND IN (row 0) refuses while
  // empty-handed: job survives, no coins paid.
  await press(page, 'z');
  await press(page, 'z');
  const refused = await page.evaluate(() => {
    const d = window.__debug as unknown as DebugFull;
    return { job: d.quest.job, coins: d.quest.coins };
  });
  expect(refused.job).not.toBeNull();
  expect(refused.coins).toBe(0);

  // B steps back to the list (not out of the board — the SIDE.1-FB fix),
  // then B again leaves. Fulfil the contract and reopen — it persisted.
  await press(page, 'x');
  const midState = await page.evaluate(() => window.__debug.G.state);
  expect(midState).toBe('jobs'); // still on the board after one B
  await press(page, 'x');
  await page.waitForFunction(() => window.__debug.G.state === 'world', undefined, { timeout: 5_000 });
  await page.evaluate(() => {
    const d = window.__debug as unknown as DebugFull;
    for (let i = 0; i < d.quest.job!.need; i++) d.quest.items.push(d.quest.job!.item!);
  });
  await openBoard(page);

  // Active slot → submenu → HAND IN pays out and clears the job.
  await press(page, 'z');
  await press(page, 'z');
  const after = await page.evaluate(() => {
    const d = window.__debug as unknown as DebugFull;
    return { job: d.quest.job, coins: d.quest.coins, items: d.quest.items.slice() };
  });
  expect(after.job).toBeNull();
  expect(after.coins).toBe(taken!.payout);
  expect(after.items).toEqual([]); // exactly `need` consumed

  // And a new contract can be taken straight away — the completed slot
  // re-rolled (only that slot; the unit suite pins the others unchanged).
  await press(page, 'z');
  const next = await page.evaluate(() => {
    const d = window.__debug as unknown as DebugFull;
    return d.quest.job;
  });
  expect(next).not.toBeNull();

  // B leaves cleanly back to the world.
  await press(page, 'x');
  await page.waitForFunction(() => window.__debug.G.state === 'world', undefined, { timeout: 5_000 });
});
