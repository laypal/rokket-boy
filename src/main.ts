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
import { battleUpdate, startBattle, battleTrace } from './systems/battle';
import { battleDraw } from './systems/battleDraw';
import { lockerUpdate, lockerDraw, openLocker } from './systems/locker';
import { shopUpdate, shopDraw, openShop } from './systems/shop';
import { jobsUpdate, jobsDraw, openJobs } from './systems/jobsScreen';
import { cardFlipUpdate, cardFlipDraw, openCardFlip } from './systems/cardFlipScreen';
import { levelUpUpdate, levelUpDraw, useLevelCandy } from './systems/levelUpScene';
import { bootUpdate, titleUpdate, introUpdate, endUpdate, rankCardUpdate, markPowered, endIntro } from './systems/scenes';
import { install as installDiagnostics, rokketApi } from './engine/diagnostics';
import { quest, setDexMons } from './systems/quest';
import { runScript } from './systems/script';
import { worldHooks } from './systems/world';
import { setEncounterRng } from './systems/encounter';
import { mulberry32 } from './engine/rng';
import { ITEMS } from './data/items';
import { SPECIES } from './data/mons';
import { maxHp } from './systems/mon';
import { findPartyMon, xpToReach, hpFromArg } from './systems/debugResolve';
import { requestPersist } from './engine/storage';
import { initInstall, resetInstall } from './engine/install';
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
  requestPersist(navigator); // PKG.2: keep the save through disk pressure
}

initInput({
  onFirstInput: poweredOn,
  onMuteToggle: () => Audio2.setMuted(!Audio2.muted),
});
// PKG.3: offline shell (public/sw.js). Network-first, so registering in dev
// is harmless — one code path, no mode branch. Absent on file:// and in
// browsers without SW support; a failed registration is not the game's problem.
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
initInstall(window); // PKG.4: hold beforeinstallprompt for the title screen

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
// SIDE.7: LEVEL CANDY's level-up scene — the battle's own pipeline, no foe
registerState('levelup', () => {
  levelUpUpdate();
  if (G.state === 'levelup') {
    worldDraw();
    levelUpDraw();
  }
});
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
    // ONB.5-FB: rolling log of every coach beat fired/suppressed and every
    // SWIPE outcome. There to capture the "Nothing left to swipe!" report
    // that reading the code says cannot happen — if it recurs, this says why.
    battleTrace,
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
    // QA.6: primes the NEXT battle win to level this mon through the REAL
    // gainXp path (moves, evolution offer) — never touches lv/hp directly,
    // because skipping gainXp skips the very events being tested. The
    // resolved mon must be ACTIVE at the win.
    levelTo: (key: string | number, lv: number) => {
      const mon = findPartyMon(G.party, key);
      if (!mon) {
        console.error(`[__debug.levelTo] no party mon matches ${key}`);
        return;
      }
      mon.xp = xpToReach(lv);
      console.error(`[__debug.levelTo] ${mon.species} (slot ${G.party.indexOf(mon)}) primed for lv ${lv} on next win — must be ACTIVE`);
    },
    // QA.8: fraction (<1) or absolute hp, resolved against the mon's real
    // maxHp and clamped — shares findPartyMon with levelTo (one resolver).
    setHp: (key: string | number, arg: number) => {
      const mon = findPartyMon(G.party, key);
      if (!mon) {
        console.error(`[__debug.setHp] no party mon matches ${key}`);
        return;
      }
      mon.hp = hpFromArg(maxHp(SPECIES[mon.species], mon.lv), arg);
      console.error(`[__debug.setHp] ${mon.species} hp -> ${mon.hp}`);
    },
    // QA.8: skips the cold-open cinematic + HQ tour by setting the SAME two
    // flags the real path sets (hq.ts:313-327) before handing over through
    // endIntro's own fade+landAt — not a second definition of "intro done".
    // No-op outside the intro state.
    skipIntro: () => {
      if (G.state !== 'intro') {
        console.error(`[__debug.skipIntro] no-op — G.state is '${G.state}', not 'intro'`);
        return;
      }
      quest.flags.introSeen = true;
      quest.flags.introToured = true;
      console.error('[__debug.skipIntro] set introSeen + introToured');
      endIntro();
    },
    // SIDE.7: play the LEVEL CANDY scene on a party mon without owning one —
    // the same useLevelCandy the PARTY picker calls (real gainXp, real scene).
    levelCandy: (key: string | number) => {
      const mon = findPartyMon(G.party, key);
      if (!mon) {
        console.error(`[__debug.levelCandy] no party mon matches ${key}`);
        return;
      }
      if (!useLevelCandy(mon)) console.error('[__debug.levelCandy] MAXED OUT.');
    },
    // PKG.4: fake Chrome's install offer so e2e/playtester can see the title
    // line and press SELECT without a real prompt. `prompted` flips when the
    // game calls prompt().
    install: {
      prompted: false,
      fake(): void {
        const ev = new Event('beforeinstallprompt', { cancelable: true });
        Object.assign(ev, {
          prompt: () => {
            (window as unknown as { __debug: { install: { prompted: boolean } } }).__debug.install.prompted = true;
            return Promise.resolve();
          },
        });
        window.dispatchEvent(ev);
      },
      // clear a REAL offer (Chromium fires one on localhost) so a "no offer"
      // baseline is stageable; also drops `prompted` back to false
      reset(): void {
        resetInstall();
        (window as unknown as { __debug: { install: { prompted: boolean } } }).__debug.install.prompted = false;
      },
    },
  };
}

startLoop();
