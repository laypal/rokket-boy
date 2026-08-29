// CH4.2/CH4.3 interpreter + map-pin tests (span-content.test.ts / bridge-
// content.test.ts idiom): pin the four S.S. ANN maps' frozen geometry, the
// safe script's event order, the chief's chained boss fight, the CHIEF
// NPC's visibility window, and the ch4 chapter-objective derivation.
import { describe, it, expect, beforeEach } from 'vitest';
import { runScript, type ScriptHooks } from '../src/systems/script';
import { quest, resetQuest, currentObjective, checkCond } from '../src/systems/quest';
import { MAPS } from '../src/data/maps';
import { WALKABLE } from '../src/data/tiles';
import { dockScripts } from '../src/data/dialog/dock';
import { cabinScripts } from '../src/data/dialog/cabin';
import { ENCOUNTERS } from '../src/data/encounters';

/** Ordered event log (ch2-content.test.ts / span-content.test.ts idiom). */
function eventHooks() {
  const events: string[] = [];
  const hooks: ScriptHooks = {
    say: (_p, done) => { events.push('say'); done(); },
    battle: (id, done) => { events.push('battle:' + id); done(null); },
    warp: (w, done) => { events.push('warp:' + w.join(',')); done(); },
    sfx: (id) => events.push('sfx:' + id),
    music: (n) => events.push('music:' + n),
    setTile: () => {},
    addWarp: () => {},
    locker: (done) => done(),
    shop: (id, done) => { events.push('shop:' + id); done(); },
    endScreen: () => events.push('endScreen'),
    rankUp: (r, done) => { events.push('rankUp:' + r); done(); },
    heat: (n) => events.push('heat:' + n),
    giveMon: () => {},
    npcRun: (id, done) => { events.push('npcRun:' + id); done(); },
    healParty: () => events.push('healParty'),
    sysMsg: (lines) => events.push('sysMsg:' + lines[0]),
    jobs: (done) => { events.push('jobs'); done(); },
    cardFlip: (done) => { events.push('cardFlip'); done(); },
    tour: (_stops, done) => { events.push('tour'); done(); },
    choice: (_p, done) => { events.push('choice'); done(true); },
  };
  return { hooks, events };
}

/** Captures every `say` call's full page set (moon-content.ts idiom). */
function sayLogHooks(): { hooks: ScriptHooks; says: string[][][] } {
  const says: string[][][] = [];
  const hooks: ScriptHooks = {
    say: (pages, done) => { says.push(pages); done(); },
    battle: (_id, done) => done(null),
    warp: (_w, done) => done(),
    sfx: () => {},
    music: () => {},
    setTile: () => {},
    addWarp: () => {},
    locker: (done) => done(),
    shop: (_id, done) => done(),
    endScreen: () => {},
    rankUp: (_r, done) => done(),
    heat: () => {},
    giveMon: () => {},
    npcRun: (_id, done) => done(),
    healParty: () => {},
    sysMsg: () => {},
    jobs: (done) => done(),
    cardFlip: (done) => done(),
    tour: (_stops, done) => done(),
    choice: (_p, done) => done(true),
  };
  return { hooks, says };
}

beforeEach(() => resetQuest());

describe('CH4.2 map pins (frozen task card)', () => {
  it('all four maps exist with their pinned size', () => {
    expect(MAPS.dock.w).toBe(20);
    expect(MAPS.dock.h).toBe(10);
    expect(MAPS.deck1.w).toBe(24);
    expect(MAPS.deck1.h).toBe(12);
    expect(MAPS.deck2.w).toBe(20);
    expect(MAPS.deck2.h).toBe(10);
    expect(MAPS.cabin.w).toBe(16);
    expect(MAPS.cabin.h).toBe(8);
  });

  it('deck1/deck2/cabin share the ship heat zone, a 300s lockdown and always-on watch', () => {
    for (const id of ['deck1', 'deck2', 'cabin'] as const) {
      expect(MAPS[id].heatZone, id).toBe('ship');
      expect(MAPS[id].lockdown, id).toBe(300);
      expect(MAPS[id].watch, id).toBe(true);
    }
  });

  it('all four ship maps let the player wear the sailor disguise', () => {
    for (const id of ['dock', 'deck1', 'deck2', 'cabin'] as const) {
      expect(MAPS[id].disguise, id).toBe('sailor');
    }
  });

  it('the dock carries no heatZone/lockdown/watch — the gangway warp IS the escape', () => {
    expect(MAPS.dock.heatZone).toBeUndefined();
    expect(MAPS.dock.lockdown).toBeUndefined();
    expect(MAPS.dock.watch).toBeUndefined();
  });

  it('every pinned warp pair lands on a walkable tile', () => {
    const pairs: [string, [number, number], string, [number, number]][] = [
      ['dock', [17, 2], 'deck1', [2, 9]],
      ['deck1', [2, 10], 'dock', [17, 3]],
      ['deck1', [22, 5], 'cabin', [1, 3]],
      ['cabin', [0, 3], 'deck1', [21, 5]],
      ['deck1', [22, 8], 'deck2', [2, 1]],
      ['deck2', [1, 1], 'deck1', [21, 8]],
      ['outskirts', [20, 6], 'dock', [1, 6]],
      ['dock', [0, 6], 'outskirts', [19, 6]],
    ];
    for (const [fromId, [fx, fy], toId, [tx, ty]] of pairs) {
      const from = MAPS[fromId as keyof typeof MAPS];
      const warp = from.warps[`${fx},${fy}`];
      expect(warp, `${fromId} (${fx},${fy}) warp`).toBeDefined();
      expect(warp[0], `${fromId} (${fx},${fy}) target`).toBe(toId);
      expect(warp[1], `${fromId} (${fx},${fy}) target x`).toBe(tx);
      expect(warp[2], `${fromId} (${fx},${fy}) target y`).toBe(ty);
      const dest = MAPS[toId as keyof typeof MAPS];
      const tile = dest.grid[ty][tx];
      expect(WALKABLE.has(tile), `${toId} (${tx},${ty}) landing tile "${tile}"`).toBe(true);
    }
  });
});

describe('the SAFE (cabin at:14,4)', () => {
  it('fresh: say runs, then heat:3 LAST, ch4Safe true after', () => {
    const { hooks, events } = eventHooks();
    runScript(cabinScripts['at:14,4'], hooks);

    expect(quest.flags.ch4Safe).toBe(true);
    const sayAt = events.findIndex((e) => e === 'say');
    const heatAt = events.findIndex((e) => e.startsWith('heat:'));
    expect(sayAt).toBeGreaterThanOrEqual(0);
    expect(heatAt).toBeGreaterThan(sayAt);
    expect(heatAt).toBe(events.length - 1); // heat is the LAST event (doc 02)
    expect(events[heatAt]).toBe('heat:3');
  });

  it('run again (already cracked): only a say, no second heat', () => {
    quest.flags.ch4Safe = true;
    const { hooks, events } = eventHooks();
    runScript(cabinScripts['at:14,4'], hooks);

    expect(events).toEqual(['say']);
    expect(events.some((e) => e.startsWith('heat:'))).toBe(false);
  });
});

describe('the chief: chained 2-mon boss (ss_chief1 -> ss_chief2)', () => {
  it('ss_chief1.onWin is exactly a battle handoff to ss_chief2', () => {
    expect(ENCOUNTERS.ss_chief1.onWin).toEqual([{ battle: 'ss_chief2' }]);
  });

  it('ss_chief2.onWin: rankUp before the RIDE_HOME choice before endScreen, through the real interpreter', () => {
    quest.rank = 'OPERATIVE';
    const { hooks, events } = eventHooks();
    runScript(ENCOUNTERS.ss_chief2.onWin, hooks);

    expect(quest.flags.ch4Done).toBe(true);
    expect(quest.rank).toBe('LIEUTENANT');

    const rankAt = events.findIndex((e) => e.startsWith('rankUp:'));
    const choiceAt = events.indexOf('choice');
    const endAt = events.indexOf('endScreen');
    expect(rankAt).toBeGreaterThanOrEqual(0);
    expect(choiceAt).toBeGreaterThan(rankAt);
    expect(endAt).toBeGreaterThan(choiceAt);
    expect(events[rankAt]).toBe('rankUp:LIEUTENANT');
  });
});

describe('the CHIEF NPC visibility window (dock)', () => {
  it('gone before ch4Safe, present between, gone again after ch4Done', () => {
    const chief = MAPS.dock.npcs.find((n) => n.id === 'chief');
    expect(chief, 'chief npc').toBeDefined();
    expect(chief!.goneIf, 'chief goneIf').toBeDefined();

    expect(checkCond(chief!.goneIf!)).toBe(true); // fresh: no safe cracked yet
    quest.flags.ch4Safe = true;
    expect(checkCond(chief!.goneIf!)).toBe(false); // loot in hand: blocks the gangway
    quest.flags.ch4Done = true;
    expect(checkCond(chief!.goneIf!)).toBe(true); // beaten: steps aside for good
  });
});

describe('ch4 chapter-objective derivation', () => {
  it('walks SUIT UP -> CRACK THE SAFE -> BEAT THE CHIEF -> FIND THE SCOPE (CH5 follows)', () => {
    quest.flags.briefed = true;
    quest.flags.guardBeaten = true;
    quest.flags.switchFound = true;
    quest.flags.lootTaken = true;
    quest.flags.missionDone = true;
    quest.flags.fossilsTaken = true;
    quest.flags.bradBeaten = true;
    quest.flags.ch2Done = true;
    quest.flags.spanCamper = true;
    quest.flags.spanPicnicker = true;
    quest.flags.spanHiker = true;
    quest.flags.spanYoungster = true;
    quest.flags.spanLass = true;
    quest.flags.ch3Done = true;

    expect(currentObjective()).toBe('SUIT UP');
    quest.flags.ch4Suit = true;
    expect(currentObjective()).toBe('CRACK THE SAFE');
    quest.flags.ch4Safe = true;
    expect(currentObjective()).toBe('BEAT THE CHIEF');
    quest.flags.ch4Done = true;
    expect(currentObjective()).toBe('FIND THE SCOPE'); // CH5's first step follows (CH5.0 §9)
  });
});

describe("Jessika's SAILOR SUIT hand-over (dock)", () => {
  it('fresh: 3 pages, sets ch4Suit once, and repeating says only the 1-page encouragement', () => {
    const first = sayLogHooks();
    runScript(dockScripts['npc:jessika'], first.hooks);
    expect(quest.flags.ch4Suit).toBe(true);
    expect(first.says.length).toBe(1);
    expect(first.says[0].length).toBe(3);

    const second = sayLogHooks();
    runScript(dockScripts['npc:jessika'], second.hooks);
    expect(quest.flags.ch4Suit).toBe(true); // still set — no re-trigger
    expect(second.says.length).toBe(1);
    expect(second.says[0].length).toBe(1); // the encouragement branch, not the hand-over again
  });
});
