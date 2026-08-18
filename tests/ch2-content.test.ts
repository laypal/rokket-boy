// CH2.4 interpreter + data tests: BRAD's gate, the fossil hand-in ordering
// (rankUp BEFORE endScreen — the 1e rule), the untouched ch1 giovanni
// branches, and the new trainer-portrait registry's dimensions.
import { describe, it, expect, beforeEach } from 'vitest';
import { runScript, type ScriptHooks } from '../src/systems/script';
import { quest, resetQuest } from '../src/systems/quest';
import { npcGone } from '../src/systems/world';
import { moonDigScripts } from '../src/data/dialog/moonDig';
import { moon1Scripts } from '../src/data/dialog/moon1';
import { hqScripts } from '../src/data/dialog/hq';
import { ENCOUNTERS } from '../src/data/encounters';
import { PORTRAITS } from '../src/data/chars';
import { SHOPS } from '../src/data/shops';
import { MAPS } from '../src/data/maps';

/** Ordered event log — the hand-in test is ABOUT sequencing, so every hook
 *  pushes into one array instead of per-kind buckets. */
function eventHooks() {
  const events: string[] = [];
  const hooks: ScriptHooks = {
    say: (_p, done) => { events.push('say'); done(); },
    battle: (id, done) => { events.push('battle:' + id); done(null); },
    warp: (_w, done) => done(),
    sfx: () => {},
    music: (n) => events.push('music:' + n),
    setTile: () => {},
    addWarp: () => {},
    locker: (done) => done(),
    shop: (id, done) => { events.push('shop:' + id); done(); },
    endScreen: () => events.push('endScreen'),
    rankUp: (_r, done) => { events.push('rankUp'); done(); },
    heat: () => {},
    giveMon: () => {},
    npcRun: (id, done) => { events.push('npcRun:' + id); done(); },
    healParty: () => events.push('healParty'),
    sysMsg: () => events.push('sysMsg'),
    jobs: (done) => { events.push('jobs'); done(); },
    cardFlip: (done) => { events.push('cardFlip'); done(); },
    choice: (_p, done) => { events.push('choice'); done(true); },
  };
  return { hooks, events };
}

beforeEach(() => resetQuest());

describe('BRAD at the dig site (CH2.4)', () => {
  it('before the fossils: taunt only, no battle', () => {
    const { hooks, events } = eventHooks();
    runScript(moonDigScripts['npc:brad'], hooks);
    expect(events).toEqual(['say']);
  });

  it('with the fossils: the ambush battle fires', () => {
    quest.flags.fossilsTaken = true;
    const { hooks, events } = eventHooks();
    runScript(moonDigScripts['npc:brad'], hooks);
    expect(events).toContain('battle:brad_ratikatt');
  });

  it('his onWin sets bradBeaten, and his NPC is gone once it is', () => {
    const { hooks } = eventHooks();
    runScript(ENCOUNTERS.brad_ratikatt.onWin, hooks);
    expect(quest.flags.bradBeaten).toBe(true);
    const brad = MAPS.moonDig.npcs.find((n) => n.id === 'brad');
    expect(brad).toBeDefined();
    expect(npcGone(brad!)).toBe(true);
  });
});

describe('giovanni hand-in (CH2.4 rank beat)', () => {
  it('bradBeaten: rankUp fires BEFORE endScreen, ch2Done set, rank is AGENT', () => {
    quest.flags.missionDone = true;
    quest.flags.fossilsTaken = true;
    quest.flags.bradBeaten = true;
    const { hooks, events } = eventHooks();
    runScript(hqScripts['npc:giovanni'], hooks);
    expect(quest.flags.ch2Done).toBe(true);
    expect(quest.rank).toBe('AGENT');
    const rankAt = events.indexOf('rankUp');
    const endAt = events.indexOf('endScreen');
    expect(rankAt).toBeGreaterThanOrEqual(0);
    expect(endAt).toBeGreaterThan(rankAt); // the 1e ordering rule, enforced
  });

  it('ch2Done: afterglow line only — no second rankUp or endScreen', () => {
    quest.flags.missionDone = true;
    quest.flags.ch2Done = true;
    const { hooks, events } = eventHooks();
    runScript(hqScripts['npc:giovanni'], hooks);
    expect(events).toEqual(['say']);
  });

  it('missionDone only: the CH2 briefing, no rank beat', () => {
    quest.flags.missionDone = true;
    const { hooks, events } = eventHooks();
    runScript(hqScripts['npc:giovanni'], hooks);
    expect(events).toEqual(['say']);
    expect(quest.flags.ch2Done).toBe(false);
  });

  it('fresh save: the ch1 briefing still runs unchanged (briefed gets set)', () => {
    const { hooks, events } = eventHooks();
    runScript(hqScripts['npc:giovanni'], hooks);
    expect(quest.flags.briefed).toBe(true);
    expect(events).toEqual(['say']);
  });
});

describe('moon cart vendor (CH2.4)', () => {
  it('the vendor script opens the moonCart shop, which exists', () => {
    const { hooks, events } = eventHooks();
    runScript(moon1Scripts['npc:vendor'], hooks);
    expect(events).toEqual(['say', 'shop:moonCart']);
    expect(SHOPS.moonCart).toBeDefined();
  });
});

describe('trainer portraits (CH2.4)', () => {
  it('every portrait is rectangular 24×24', () => {
    for (const [label, p] of Object.entries(PORTRAITS)) {
      expect(p.rows.length, `${label} portrait rows`).toBe(24);
      for (const [i, row] of p.rows.entries()) {
        expect(row.length, `${label} portrait row ${i}`).toBe(24);
      }
    }
  });
});

describe('BRAD ambush (CH2.7)', () => {
  it('taking the fossils runs BRAD to the player, then forces the battle', () => {
    const { hooks, events } = eventHooks();
    runScript(moonDigScripts['at:8,4'], hooks);
    const runAt = events.indexOf('npcRun:brad');
    const battleAt = events.indexOf('battle:brad_ratikatt');
    expect(runAt).toBeGreaterThanOrEqual(0);
    expect(battleAt).toBeGreaterThan(runAt); // he arrives BEFORE the fight
    expect(quest.flags.fossilsTaken).toBe(true);
  });

  it('re-entering the dig site with fossils and BRAD unbeaten re-ambushes', () => {
    quest.flags.fossilsTaken = true;
    const { hooks, events } = eventHooks();
    runScript(moonDigScripts.enter, hooks);
    expect(events).toContain('npcRun:brad');
    expect(events).toContain('battle:brad_ratikatt');
  });

  it('re-entering with BRAD already beaten only repairs the chest', () => {
    quest.flags.fossilsTaken = true;
    quest.flags.bradBeaten = true;
    const { hooks, events } = eventHooks();
    runScript(moonDigScripts.enter, hooks);
    expect(events).toEqual([]); // setTile is silent in this log; no run, no battle
  });

  it('fleeing loops straight back into the fight (onFlee re-engages)', () => {
    const { hooks, events } = eventHooks();
    runScript(ENCOUNTERS.brad_ratikatt.onFlee, hooks);
    expect(events).toEqual(['say', 'battle:brad_ratikatt']);
  });
});
