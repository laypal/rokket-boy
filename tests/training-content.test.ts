// SIDE.5 — HQ training missions content: the drill offers, the once-only
// rewards, and the training room's data. The spar/drill ENGINE exemptions
// live in battle.test.ts and world.test.ts; this file is about the scripts
// and data driving them (the ch2-content idiom: real scripts, fake hooks).
import { describe, it, expect, beforeEach } from 'vitest';
import { runScript, type ScriptHooks } from '../src/systems/script';
import { quest, resetQuest } from '../src/systems/quest';
import { hqScripts } from '../src/data/dialog/hq';
import { hqDrillScripts } from '../src/data/dialog/hqDrill';
import { ENCOUNTERS } from '../src/data/encounters';
import { MAPS } from '../src/data/maps';

function eventHooks() {
  const events: string[] = [];
  const hooks: ScriptHooks = {
    say: (_p, done) => { events.push('say'); done(); },
    battle: (id, done) => { events.push('battle:' + id); done(null); },
    warp: (w, done) => { events.push('warp:' + w[0]); done(); },
    sfx: () => {},
    music: () => {},
    setTile: () => {},
    addWarp: () => {},
    locker: (done) => done(),
    shop: (id, done) => { events.push('shop:' + id); done(); },
    endScreen: () => events.push('endScreen'),
    rankUp: (_r, done) => { events.push('rankUp'); done(); },
    heat: (n) => events.push('heat:' + n),
    giveMon: () => {},
    npcRun: (id, done) => { events.push('npcRun:' + id); done(); },
    healParty: () => {},
    sysMsg: () => events.push('sysMsg'),
    jobs: (done) => { events.push('jobs'); done(); },
    choice: (_p, done) => { events.push('choice'); done(true); },
  };
  return { hooks, events };
}

beforeEach(() => resetQuest());

/** Same event log, but the choice hook answers a fixed way. */
function choiceHooks(answer: boolean) {
  const h = eventHooks();
  h.hooks.choice = (_p, done) => { h.events.push('choice'); done(answer); };
  return h;
}

describe('battle drill — Jessika (SIDE.5, re-cut 2026-08-15)', () => {
  it('from the FIRST talk (pre-briefing): look-sharp line, then the spar OFFER — YES fights', () => {
    const { hooks, events } = choiceHooks(true);
    runScript(hqScripts['npc:jessika'], hooks);
    // story line, the choice prompt, YES's "rule one" line, then the battle
    expect(events).toEqual(['say', 'choice', 'say', 'battle:spar_jessika']);
  });

  it('NO declines: no battle, a polite line', () => {
    const { hooks, events } = choiceHooks(false);
    runScript(hqScripts['npc:jessika'], hooks);
    expect(events).toEqual(['say', 'choice', 'say']);
    expect(events).not.toContain('battle:spar_jessika');
  });

  it('once the drill is done, talking never auto-fights: it OFFERS a rematch, NO walks away', () => {
    quest.flags.briefed = true;
    quest.flags.drillBattleDone = true;
    const { hooks, events } = choiceHooks(false);
    runScript(hqScripts['npc:jessika'], hooks);
    expect(events).not.toContain('battle:spar_jessika');
    expect(events).toContain('choice');
  });

  it('a rematch is still possible on an explicit YES', () => {
    quest.flags.drillBattleDone = true;
    const { hooks, events } = choiceHooks(true);
    runScript(hqScripts['npc:jessika'], hooks);
    expect(events).toContain('battle:spar_jessika');
  });

  it('post-mission: the motto egg still lands before the offer', () => {
    quest.flags.briefed = true;
    quest.flags.missionDone = true;
    const { hooks, events } = choiceHooks(false);
    runScript(hqScripts['npc:jessika'], hooks);
    expect(quest.eggs.has('motto')).toBe(true);
    expect(events).toContain('choice');
  });

  it('first win pays 100c once and sets the flag; repeats say only', () => {
    const { hooks } = eventHooks();
    runScript(ENCOUNTERS.spar_jessika.onWin, hooks);
    expect(quest.flags.drillBattleDone).toBe(true);
    expect(quest.coins).toBe(100);
    runScript(ENCOUNTERS.spar_jessika.onWin, hooks);
    expect(quest.coins).toBe(100); // never a second payout
  });

  it('the spar encounters are spar-flagged trainers (the loss exemption arms)', () => {
    expect(ENCOUNTERS.spar_jessika.spar).toBe(true);
    expect(ENCOUNTERS.spar_jessika.trainer).toBeTruthy();
    expect(ENCOUNTERS.drill_guard.spar).toBe(true);
  });
});

describe('stealth drill — Myowth and the training room (SIDE.5)', () => {
  it('mid-heist: coaching only, no warp', () => {
    const { hooks, events } = eventHooks();
    runScript(hqScripts['npc:myowth'], hooks);
    expect(events).toEqual(['say']);
    expect(quest.eggs.has('myowth')).toBe(true);
  });

  it('post-mission: sneak-school pitch, then the warp into the drill', () => {
    quest.flags.missionDone = true;
    const { hooks, events } = eventHooks();
    runScript(hqScripts['npc:myowth'], hooks);
    expect(events).toEqual(['say', 'warp:hqDrill']);
  });

  it('the room enter script re-arms heat 1 on every entry, intro only pre-clear', () => {
    const first = eventHooks();
    runScript(hqDrillScripts.enter, first.hooks);
    expect(first.events).toEqual(['say', 'heat:1']);
    quest.flags.drillStealthDone = true;
    const again = eventHooks();
    runScript(hqDrillScripts.enter, again.hooks);
    expect(again.events).toEqual(['heat:1']); // no stale intro, heat still arms
  });

  it('the goal pad is a STEP-ON trigger: pays 150c once, then warps home; repeats warp without pay', () => {
    const first = eventHooks();
    runScript(hqDrillScripts['step:10,1'], first.hooks);
    expect(quest.flags.drillStealthDone).toBe(true);
    expect(quest.coins).toBe(150);
    expect(first.events).toContain('warp:hq');
    const again = eventHooks();
    runScript(hqDrillScripts['step:10,1'], again.hooks);
    expect(quest.coins).toBe(150); // never a second payout
    expect(again.events).toContain('warp:hq'); // still goes home
    expect(hqDrillScripts['at:10,1']).toBeUndefined(); // no A-press variant — walk-on only
    expect(hqDrillScripts['tile:W']).toBeDefined(); // A at the pad = a nudge, not the finish
  });

  it('the training room is a drill map with the guard on the real heat machinery', () => {
    const m = MAPS.hqDrill;
    expect(m.drill).toEqual({ x: 5, y: 8 });
    const guard = m.npcs.find((n) => n.id === 'drillguard');
    expect(guard?.heatGuard?.encounterId).toBe('drill_guard');
    // the reset tile and both warp endpoints are walkable floor
    expect(m.grid[8][5]).toBe(' ');
    expect(m.grid[9][5]).toBe('o');
    expect(MAPS.hq.grid[9][10]).toBe(' '); // the hq return tile
    // the goal pad the step-script keys on
    expect(m.grid[1][10]).toBe('W');
  });

  it('rewards touch coins and flags only — never rank', () => {
    quest.flags.missionDone = true;
    const { hooks } = eventHooks();
    runScript(ENCOUNTERS.spar_jessika.onWin, hooks);
    runScript(hqDrillScripts['step:10,1'], hooks);
    expect(quest.rank).toBe('GRUNT'); // the ladder stays story-owned (§4.7)
  });
});
