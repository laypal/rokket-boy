// LEVEL CANDY scene (SIDE.7): the level-up pipeline run OUTSIDE a battle.
// Move-learn and evolution offers were battle-phase UI until 2026-08-22;
// a candy used from the PARTY screen needs somewhere to show them, so this
// state hosts the same levelUp.ts pipeline over the world view with the
// battle's own bottom window and cinematic drawing (battleDraw exports).
// The host is a bare LevelUpHost — no foe, no fx, no rng.
import { G } from '../state';
import type { MonInstance } from '../types';
import { BG_PAL } from '../data/palettes';
import { drawWindow, W } from '../engine/renderer';
import { Audio2 } from '../engine/audio';
import { drawEvolveScene, drawMessage, drawLevelUpPrompt } from './battleDraw';
import { pumpMessages, levelUpInput, announceLevelUps, afterQueue, type LevelUpHost } from './levelUp';
import { gainXp, xpForLevel, LEVEL_CAP, type LevelUpEvent } from './mon';
import { SPECIES } from '../data/mons';

let H: (LevelUpHost & { done: () => void }) | null = null;

/** The running scene, for tests and the `__debug` hook; null when idle. */
export function levelUpState(): LevelUpHost | null {
  return H;
}

/** Play `events` (what gainXp just returned for `mon`) then hand back. */
export function startLevelUp(mon: MonInstance, events: LevelUpEvent[], done: () => void): void {
  H = { phase: 'anim', t: 0, sel: 0, msg: null, msgChars: 0, queue: [], done };
  G.state = 'levelup';
  Audio2.sfx('item');
  // leave AFTER the last queued message, not when the chain resolves (with no
  // offers it resolves synchronously, before the first "grew" line shows)
  const h = H;
  announceLevelUps(h, mon, events, () => afterQueue(h, leave));
}

/** LEVEL CANDY on `mon`: exactly the xp to the next level through the REAL
 *  gainXp path (level-up full-heals, moves and evolution offer exactly as a
 *  battle win would), then the scene plays it out. False (nothing consumed,
 *  nothing started) at LEVEL_CAP — the caller keeps the item and says so. */
export function useLevelCandy(mon: MonInstance, done: () => void = () => {}): boolean {
  if (mon.lv >= LEVEL_CAP) return false;
  const events = gainXp(mon, SPECIES[mon.species], xpForLevel(mon.lv + 1) - mon.xp);
  startLevelUp(mon, events, done);
  return true;
}

function leave(): void {
  const h = H!;
  H = null;
  G.state = 'world';
  h.done();
}

export function levelUpUpdate(): void {
  const h = H;
  if (!h) return;
  h.t++;
  if (pumpMessages(h, G.frame)) return;
  levelUpInput(h);
}

/** Draws over whatever the caller painted first (main.ts: worldDraw) — the
 *  cinematic fills the screen itself, the prompts sit in the bottom window. */
export function levelUpDraw(): void {
  const h = H;
  if (!h) return;
  const pal = BG_PAL.green; // the battle palette — the cinematic and prompts are tuned to it
  if (h.phase === 'evolveScene' || h.phase === 'evoConfirm') {
    drawEvolveScene(h, pal);
    return;
  }
  drawWindow(0, 96, W, 48, pal);
  if (h.msg) drawMessage(h, pal);
  else drawLevelUpPrompt(h, pal);
}
