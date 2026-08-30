// ONB.3: "!" over NPCs who need talking to. Pins the frozen placement set
// (giovanni/jessika/myowth only), the frozen flag-order progression table,
// the invariant that a marker never lies (npcTodo → talk → resolved need),
// the save round-trip (no reload brings a cleared marker back), and a
// content lint over every shipped todoIf/goneIf. Draw-side ("!" rendering)
// is worker A's — this file only ever asserts npcTodo(), never pixels.
import { describe, it, expect, beforeEach } from 'vitest';
import type { Cond } from '../src/types';
import { quest, resetQuest } from '../src/systems/quest';
import { npcTodo } from '../src/systems/world';
import { MAPS } from '../src/data/maps';
import { hqScripts } from '../src/data/dialog/hq';
import { runScript, type ScriptHooks } from '../src/systems/script';
import { snapshot, migrate, applySave } from '../src/systems/save';
import { EGG_IDS } from '../src/data/eggs';
import { G } from '../src/state';

// Copied verbatim from tests/ch2-content.test.ts (lines 18-42) — the ordered
// event-log stub-hooks factory. say/choice/rankUp/etc. all auto-complete so
// runScript resolves synchronously for a plain node test.
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
    tour: (_stops, done) => { events.push('tour'); done(); },
    choice: (_p, done) => { events.push('choice'); done(true); },
  };
  return { hooks, events };
}

const hqNpc = (id: string) => MAPS.hq.npcs.find((n) => n.id === id)!;
const marked = () => MAPS.hq.npcs.filter(npcTodo).map((n) => n.id).sort();

beforeEach(() => resetQuest());

describe('placement (D5 — nothing else wears a marker)', () => {
  // CH4.2 adds one more: the dock's jessika wears the SAILOR SUIT hint
  // (todoIf: notFlag ch4Suit) — the no-softlock hint NPC for the whole ship.
  it('todoIf is set on exactly giovanni/jessika/myowth on hq, plus jessika on the CH4 dock', () => {
    const withTodo: { mapId: string; id: string }[] = [];
    for (const [mapId, map] of Object.entries(MAPS)) {
      for (const npc of map.npcs) if (npc.todoIf) withTodo.push({ mapId, id: npc.id });
    }
    expect(withTodo.map((n) => n.id).sort()).toEqual(['giovanni', 'jessika', 'jessika', 'myowth']);
    expect(withTodo.filter((n) => n.mapId !== 'hq')).toEqual([{ mapId: 'dock', id: 'jessika' }]);
  });
});

describe('progression (BDD): the ! tracks the frozen flag order', () => {
  it('walks the frozen flag-change order and checks marked() after each step', () => {
    expect(marked()).toEqual(['giovanni', 'jessika', 'myowth']);
    quest.flags.briefed = true;
    expect(marked()).toEqual(['jessika', 'myowth']);
    quest.flags.lootTaken = true;
    expect(marked()).toEqual(['giovanni', 'jessika', 'myowth']);
    quest.flags.missionDone = true;
    expect(marked()).toEqual(['giovanni', 'jessika', 'myowth']); // CH2 briefing waiting
    quest.flags.ch2Briefed = true;
    expect(marked()).toEqual(['jessika', 'myowth']);
    quest.flags.fossilsTaken = true;
    expect(marked()).toEqual(['jessika', 'myowth']); // fossils alone aren't the hand-in trigger
    quest.flags.bradBeaten = true;
    expect(marked()).toEqual(['giovanni', 'jessika', 'myowth']);
    quest.flags.ch2Done = true;
    expect(marked()).toEqual(['giovanni', 'jessika', 'myowth']); // CH3 briefing waiting
    quest.flags.ch3Briefed = true;
    expect(marked()).toEqual(['jessika', 'myowth']);
    quest.flags.ch3Done = true;
    expect(marked()).toEqual(['giovanni', 'jessika', 'myowth']); // CH4 briefing waiting
    quest.flags.ch4Briefed = true;
    expect(marked()).toEqual(['jessika', 'myowth']);
    quest.flags.drillBattleDone = true;
    expect(marked()).toEqual(['myowth']);
    quest.eggs.add('myowth'); // ONB.3-FB: the drill is reached by talking to him, which grants his egg
    quest.flags.drillStealthDone = true;
    expect(marked()).toEqual([]);
  });

  it('skip path (a): CH2 briefing never heard — giovanni is marked for the CH3 briefing, then the CH4 briefing once ch3Done lands unheard too', () => {
    Object.assign(quest.flags, {
      briefed: true, lootTaken: true, missionDone: true, bradBeaten: true, ch2Done: true,
    }); // ch2Briefed left false on purpose
    expect(marked()).toContain('giovanni');
    quest.flags.ch3Done = true; // ch3Briefed still false
    expect(marked()).toContain('giovanni'); // CH4 briefing now waiting — a new need, not a lie
    quest.flags.ch4Briefed = true;
    expect(marked()).not.toContain('giovanni'); // no permanent ! once every chapter is over anyway
  });

  it('skip path (b): every briefing skipped clean through ch4Briefed — no permanent !', () => {
    Object.assign(quest.flags, {
      briefed: true, lootTaken: true, missionDone: true, bradBeaten: true, ch2Done: true, ch3Done: true, ch4Briefed: true,
    }); // ch2Briefed and ch3Briefed both left false
    expect(marked()).not.toContain('giovanni');
  });
});

// ONB.3-FB: Myowth's ! clears on the first talk (the egg his script grants is
// the "met" signal), comes back once the mission is done (sneak school is a
// new reason to talk), and clears for good when the drill is done.
describe('myowth invariant — first talk clears it, the drill brings it back', () => {
  it('fresh: marked; one talk clears; missionDone re-marks; drillStealthDone clears', () => {
    expect(npcTodo(hqNpc('myowth'))).toBe(true);
    runScript(hqScripts['npc:myowth'], eventHooks().hooks);
    expect(quest.eggs.has('myowth')).toBe(true);
    expect(npcTodo(hqNpc('myowth'))).toBe(false);
    quest.flags.missionDone = true;
    expect(npcTodo(hqNpc('myowth'))).toBe(true);
    quest.flags.drillStealthDone = true;
    expect(npcTodo(hqNpc('myowth'))).toBe(false);
  });
  it('a save that never talked to him keeps the ! through missionDone (no lie either way)', () => {
    quest.flags.missionDone = true;
    expect(npcTodo(hqNpc('myowth'))).toBe(true);
  });
});

// D4's setFlag insertions land in the SAME `then` array as the say they
// gate, so npcTodo(giovanni) only reflects a genuinely unheard briefing —
// never a briefing the player has already sat through, even mid-visit.
// Two of the five marked checkpoints (lootTaken, bradBeaten) are hand-in
// branches: resolving them immediately reveals the NEXT chapter's briefing
// in the same `any[]`, so one talk cannot fully silence Giovanni there — a
// second talk (which this test also drives) does. That is not the marker
// lying; it is a genuinely new need appearing in the same visit's Cond.
describe('giovanni invariant — a marker never lies', () => {
  it('fresh: the ! is the CH1 briefing waiting; one talk clears it', () => {
    expect(npcTodo(hqNpc('giovanni'))).toBe(true);
    const { hooks } = eventHooks();
    runScript(hqScripts['npc:giovanni'], hooks);
    expect(npcTodo(hqNpc('giovanni'))).toBe(false);
  });

  it('lootTaken: the ! is the CH1 hand-in waiting; handing it in surfaces the CH2 briefing in the same visit, so a second talk is needed to fully clear', () => {
    quest.flags.briefed = true;
    quest.flags.lootTaken = true;
    expect(npcTodo(hqNpc('giovanni'))).toBe(true);
    runScript(hqScripts['npc:giovanni'], eventHooks().hooks);
    expect(quest.flags.missionDone).toBe(true);
    expect(npcTodo(hqNpc('giovanni'))).toBe(true); // CH2 briefing now waiting
    runScript(hqScripts['npc:giovanni'], eventHooks().hooks);
    expect(quest.flags.ch2Briefed).toBe(true);
    expect(npcTodo(hqNpc('giovanni'))).toBe(false);
  });

  it('missionDone: the ! is the CH2 briefing waiting; one talk sets ch2Briefed and clears it', () => {
    quest.flags.briefed = true;
    quest.flags.lootTaken = true;
    quest.flags.missionDone = true;
    expect(npcTodo(hqNpc('giovanni'))).toBe(true);
    runScript(hqScripts['npc:giovanni'], eventHooks().hooks);
    expect(quest.flags.ch2Briefed).toBe(true);
    expect(npcTodo(hqNpc('giovanni'))).toBe(false);
  });

  it('bradBeaten: the ! is the CH2 hand-in waiting; handing it in surfaces the CH3 briefing in the same visit, so a second talk is needed to fully clear', () => {
    Object.assign(quest.flags, {
      briefed: true, lootTaken: true, missionDone: true, ch2Briefed: true,
      fossilsTaken: true, bradBeaten: true,
    });
    expect(npcTodo(hqNpc('giovanni'))).toBe(true);
    runScript(hqScripts['npc:giovanni'], eventHooks().hooks);
    expect(quest.flags.ch2Done).toBe(true);
    expect(npcTodo(hqNpc('giovanni'))).toBe(true); // CH3 briefing now waiting
    runScript(hqScripts['npc:giovanni'], eventHooks().hooks);
    expect(quest.flags.ch3Briefed).toBe(true);
    expect(npcTodo(hqNpc('giovanni'))).toBe(false);
  });

  it('ch2Done: the ! is the CH3 briefing waiting; one talk sets ch3Briefed and clears it', () => {
    Object.assign(quest.flags, {
      briefed: true, lootTaken: true, missionDone: true, ch2Briefed: true,
      fossilsTaken: true, bradBeaten: true, ch2Done: true,
    });
    expect(npcTodo(hqNpc('giovanni'))).toBe(true);
    runScript(hqScripts['npc:giovanni'], eventHooks().hooks);
    expect(quest.flags.ch3Briefed).toBe(true);
    expect(npcTodo(hqNpc('giovanni'))).toBe(false);
  });

  it('mid-heist (briefed only): not marked, and talking to him sets no new flag', () => {
    quest.flags.briefed = true;
    expect(npcTodo(hqNpc('giovanni'))).toBe(false);
    const before = { ...quest.flags };
    runScript(hqScripts['npc:giovanni'], eventHooks().hooks);
    expect({ ...quest.flags }).toEqual(before);
  });
});

describe('briefing text untouched (D4 ordering)', () => {
  it('runs the CH2-briefing branch and logs a say', () => {
    quest.flags.briefed = true;
    quest.flags.lootTaken = true;
    quest.flags.missionDone = true;
    const { hooks, events } = eventHooks();
    runScript(hqScripts['npc:giovanni'], hooks);
    expect(events).toContain('say');
  });

  it('pins setFlag-before-say ordering in the CH2/CH3/CH4 briefing branches, reading the data directly', () => {
    // CH5.3 wrapped the old chain in three outer branches (ch5Done afterglow,
    // ch5Mask hand-in, ch4Done -> CH5 briefing); CH6.3 wrapped that in three
    // more (ch6Done afterglow, ch6Ball hand-in, ch5Done -> CH6 briefing). Walk
    // past all six to reach the same `if ch4Done` node this pin started from.
    const outerCh6Done = hqScripts['npc:giovanni'][0];
    if (!('if' in outerCh6Done) || !outerCh6Done.else) throw new Error('unexpected giovanni script shape (ch6Done)');
    const outerCh6Ball = outerCh6Done.else[0];
    if (!('if' in outerCh6Ball) || !outerCh6Ball.else) throw new Error('unexpected giovanni script shape (ch6Ball)');
    const outerCh5Done = outerCh6Ball.else[0]; // ch5Done now sits behind CH6's briefing branch
    if (!('if' in outerCh5Done) || !outerCh5Done.else) throw new Error('unexpected giovanni script shape (ch5Done)');
    const outerCh5Mask = outerCh5Done.else[0];
    if (!('if' in outerCh5Mask) || !outerCh5Mask.else) throw new Error('unexpected giovanni script shape (ch5Mask)');
    const top = outerCh5Mask.else[0]; // if ch4Done (now the CH5 briefing node)
    if (!('if' in top) || !top.else) throw new Error('unexpected giovanni script shape');
    const ch3DoneIf = top.else[0]; // else[0] of the top `if ch4Done`
    if (!('if' in ch3DoneIf) || !ch3DoneIf.else) throw new Error('unexpected shape (ch3Done)');
    const ch4Briefing = ch3DoneIf.then; // CH4 briefing `then`
    expect(ch4Briefing[0]).toEqual({ setFlag: 'ch4Briefed' });
    const ch4Say = ch4Briefing[1];
    if (!('say' in ch4Say)) throw new Error('expected a say as the CH4 briefing 2nd step');
    expect(ch4Say.say[0][0]).toBe('GIOVANNI:');

    const ch2DoneIf = ch3DoneIf.else[0]; // else[0] of `if ch3Done`
    if (!('if' in ch2DoneIf) || !ch2DoneIf.else) throw new Error('unexpected shape (ch2Done)');
    const ch3Briefing = ch2DoneIf.then; // CH3 briefing `then`
    expect(ch3Briefing[0]).toEqual({ setFlag: 'ch3Briefed' });
    const ch3Say = ch3Briefing[1];
    if (!('say' in ch3Say)) throw new Error('expected a say as the CH3 briefing 2nd step');
    expect(ch3Say.say[0][0]).toBe('GIOVANNI: AGENT.');

    const bradIf = ch2DoneIf.else[0]; // else[0] of `if ch2Done`
    if (!('if' in bradIf) || !bradIf.else) throw new Error('unexpected shape (bradBeaten)');
    const missionDoneIf = bradIf.else[0]; // else[0] of `if bradBeaten`
    if (!('if' in missionDoneIf)) throw new Error('unexpected shape (missionDone)');
    const ch2Briefing = missionDoneIf.then; // CH2 briefing `then`
    expect(ch2Briefing[0]).toEqual({ setFlag: 'ch2Briefed' });
    const ch2Say = ch2Briefing[1];
    if (!('say' in ch2Say)) throw new Error('expected a say as the CH2 briefing 2nd step');
    expect(ch2Say.say[0][0]).toBe('GIOVANNI: New');
  });
});

describe('save round-trip (the card BDD: no reload brings it back)', () => {
  it('jessika loses the ! after drillBattleDone, and applying a save made after that keeps it gone', () => {
    // minimal valid G state for snapshot()/migrate() to accept — mirrors
    // tests/save.test.ts's resetG() helper
    G.party = [{ species: 'koffink', lv: 5, hp: 10, xp: 0, moves: ['tackle'] }];
    G.box = [];
    G.map = MAPS.hq;
    G.player.x = 9;
    G.player.y = 7;
    G.heatState = {};

    expect(npcTodo(hqNpc('jessika'))).toBe(true);
    quest.flags.drillBattleDone = true;
    expect(npcTodo(hqNpc('jessika'))).toBe(false);

    const s = migrate(JSON.parse(JSON.stringify(snapshot())))!;
    expect(s).not.toBeNull();

    resetQuest();
    expect(npcTodo(hqNpc('jessika'))).toBe(true); // fresh quest — marked again

    applySave(s);
    expect(npcTodo(hqNpc('jessika'))).toBe(false); // the save's drillBattleDone wins, no reload resurrects the !
  });
});

describe('todoIf/goneIf lint (authoring guardrail: every reference is real, no empty all/any)', () => {
  it('every flag/notFlag/egg/notEgg in a shipped todoIf or goneIf is a real registry id, and every all/any list is non-empty', () => {
    resetQuest();
    const flagNames = new Set(Object.keys(quest.flags));
    const eggIds = new Set<string>(EGG_IDS);

    function walkCond(c: Cond): void {
      if ('flag' in c) expect(flagNames.has(c.flag), `unknown flag "${c.flag}"`).toBe(true);
      if ('notFlag' in c) expect(flagNames.has(c.notFlag), `unknown flag "${c.notFlag}"`).toBe(true);
      if ('egg' in c) expect(eggIds.has(c.egg), `unknown egg "${c.egg}"`).toBe(true);
      if ('notEgg' in c) expect(eggIds.has(c.notEgg), `unknown egg "${c.notEgg}"`).toBe(true);
      if ('all' in c) {
        expect(c.all.length, 'an "all" Cond list must be non-empty (author error)').toBeGreaterThan(0);
        c.all.forEach(walkCond);
      }
      if ('any' in c) {
        expect(c.any.length, 'an "any" Cond list must be non-empty (author error)').toBeGreaterThan(0);
        c.any.forEach(walkCond);
      }
    }

    for (const map of Object.values(MAPS)) {
      for (const npc of map.npcs) {
        if (npc.todoIf) walkCond(npc.todoIf);
        if (npc.goneIf) walkCond(npc.goneIf);
      }
    }
  });
});
