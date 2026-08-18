// Entry point: wire renderer, input, audio and register state handlers.
import { G } from './state';
import { BG_PAL } from './data/palettes';
import { initRenderer } from './engine/renderer';
import { initInput } from './engine/input';
import { Audio2 } from './engine/audio';
import { buildCharFrames } from './engine/charFrames';
import { registerState, startLoop } from './engine/loop';
import { worldUpdate, worldDraw } from './systems/world';
import { dialogUpdate, drawDialogBox } from './systems/dialog';
import { menuUpdate, menuDraw } from './systems/menu';
import { battleUpdate, startBattle } from './systems/battle';
import { battleDraw } from './systems/battleDraw';
import { lockerUpdate, lockerDraw, openLocker } from './systems/locker';
import { shopUpdate, shopDraw, openShop } from './systems/shop';
import { jobsUpdate, jobsDraw, openJobs } from './systems/jobsScreen';
import { cardFlipUpdate, cardFlipDraw, openCardFlip } from './systems/cardFlipScreen';
import { bootUpdate, titleUpdate, introUpdate, endUpdate, rankCardUpdate, markPowered } from './systems/scenes';
import { install as installDiagnostics, rokketApi } from './engine/diagnostics';
import { quest, setDexMons } from './systems/quest';
import { runScript } from './systems/script';
import { worldHooks } from './systems/world';
import { setEncounterRng } from './systems/encounter';
import { mulberry32 } from './engine/rng';
import { ITEMS } from './data/items';
import type { WarpDef } from './types';

// HRD.3: field error capture from the very first frame — the loop guard
// records loop throws; this catches everything outside it.
installDiagnostics();
// D4 (2026-08-11): read-only bug-report surface, staging build ONLY — the
// prod bundle tree-shakes this branch and greps clean of __rokket.
if (__STAGING__) {
  (window as unknown as { __rokket: typeof rokketApi }).__rokket = rokketApi;
}

const canvas = document.getElementById('screen') as HTMLCanvasElement;
initRenderer(canvas);
buildCharFrames();

let powered = false;
function poweredOn(): void {
  if (powered) return;
  powered = true;
  document.getElementById('led')?.classList.add('on');
  Audio2.init();
  Audio2.resume();
  markPowered();
}

initInput({
  onFirstInput: poweredOn,
  onMuteToggle: () => Audio2.setMuted(!Audio2.muted),
});

registerState('boot', bootUpdate);
registerState('title', titleUpdate);
registerState('intro', introUpdate);
registerState('world', () => {
  worldUpdate();
  worldDraw();
});
registerState('worldwait', worldDraw); // waiting on a fade transition
registerState('dialog', () => {
  worldDraw();
  dialogUpdate();
  if (G.dialog) drawDialogBox(BG_PAL[G.map.pal]);
});
registerState('menu', () => {
  worldDraw();
  menuUpdate();
  if (G.menu) menuDraw(BG_PAL[G.map.pal]);
});
registerState('battle', () => {
  battleUpdate();
  if (G.battle) battleDraw();
});
registerState('locker', () => {
  worldDraw();
  lockerUpdate();
  if (G.state === 'locker') lockerDraw(BG_PAL[G.map.pal]);
});
registerState('shop', () => {
  worldDraw();
  shopUpdate();
  if (G.state === 'shop') shopDraw(BG_PAL[G.map.pal]);
});
registerState('jobs', () => {
  worldDraw();
  jobsUpdate();
  if (G.state === 'jobs') jobsDraw(BG_PAL[G.map.pal]);
});
registerState('cardflip', () => {
  worldDraw();
  cardFlipUpdate();
  if (G.state === 'cardflip') cardFlipDraw(BG_PAL[G.map.pal]);
});

// SIDE.4: the `{ dexComplete: true }` Cond reads the live collection through
// this provider (quest.ts stays engine-free — it can't import state.ts).
setDexMons(() => [...G.party, ...G.box]);
registerState('end', endUpdate);
registerState('rankcard', rankCardUpdate);

// E2E/debug hook — dev builds only, stripped from production output. The shop/
// locker openers let the 1c Playwright spec drive those modal UIs directly
// instead of walking the player there (the held-key tile-chain race, doc 03).
if (import.meta.env.DEV) {
  (window as unknown as { __debug: unknown }).__debug = {
    G,
    quest,
    openShop: (id: string) => openShop(id, () => {}),
    openLocker: () => openLocker(() => {}),
    // SIDE.1: drives the real board state module (same class as openShop)
    openJobs: () => openJobs(() => {}),
    // SIDE.2: the PICKPOCKET table; `seed` pins the deal for e2e specs
    openCardFlip: (seed?: number) => openCardFlip(() => {}, seed),
    // drives the REAL rankUp contract (interpreter + worldHooks), not a shortcut
    rankUp: () => runScript([{ rankUp: true }], worldHooks),
    // 1f.8: drives the REAL heat hook (interpreter + worldHooks), not a direct
    // G.heatState mutation. advanceTime only bumps playSeconds — the running
    // loop's next worldUpdate tick applies decay/expiry (heat.ts is pure and
    // never ticked directly from here).
    setHeat: (n: number) => runScript([{ heat: n }], worldHooks),
    advanceTime: (s: number) => {
      G.playSeconds += s;
    },
    // CH2.1: deterministic wild rolls for e2e — seeds the encounter stream
    // (its own rng; battleRng and its seeded snapshots are untouched).
    setEncounterSeed: (n: number) => setEncounterRng(mulberry32(n)),
    // CH2.4: rng() = 1 can never beat a rate (strict <) — rubble walks are
    // safe for e2e specs that drive the critical path (chapter2).
    noEncounters: () => setEncounterRng(() => 1),
    // UX2.1: drop straight into a registered encounter for visual QA — the
    // real startBattle (no shortcut); winBattle restores 'world' on exit.
    startBattle: (enc: string) => startBattle(enc, () => {}),
    // RNK.5 (2026-08-15, Lyall's ask): eyeball worn gear without a rank
    // grind. wear(id) puts a piece in the PACK (the real ownership signal —
    // the next world draw recomposes the sprite); wear() with no id strips
    // all gear; wearNext() cycles every registered piece one at a time.
    // Rides quest.items exactly like a promotion or purchase would.
    wear: (id?: string) => {
      quest.items = quest.items.filter((i) => !ITEMS[i]?.wear);
      if (id) quest.items.push(id);
    },
    wearNext: () => {
      const ids = Object.keys(ITEMS).filter((i) => ITEMS[i].wear);
      const cur = quest.items.find((i) => ITEMS[i]?.wear);
      const next = ids[(ids.indexOf(cur ?? '') + 1) % ids.length];
      quest.items = quest.items.filter((i) => !ITEMS[i]?.wear);
      quest.items.push(next);
      return next;
    },
    // SIDE.5: unlock both drills without playing to them (flags only, the
    // real gate the NPC scripts read) and jump into the stealth room.
    unlockDrills: () => {
      quest.flags.briefed = true;
      quest.flags.missionDone = true;
    },
    enterDrill: () => runScript([{ warp: ['hqDrill', 5, 8, 'up'] }], worldHooks),
    // CH3.4: fade-warp through the REAL warp hook (interpreter + worldHooks)
    // so chapter specs can seed a mid-campaign position instead of walking
    // three maps.
    warp: (w: WarpDef) => runScript([{ warp: w }], worldHooks),
  };
}

startLoop();
