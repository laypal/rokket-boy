// CH3.1/CH3.3 interpreter + data tests: the frozen Nugget Span encounter
// table (five marks + AGENT KIRA), Giovanni's CH3 briefing/afterglow
// branches, and the chapter-objective derivation across ch3. Same
// fake-hooks idiom as tests/moon-content.test.ts (per-field log) and
// tests/ch2-content.test.ts (ordered event log for the rankUp-before-
// endScreen rule).
import { describe, it, expect, beforeEach } from 'vitest';
import { runScript, type ScriptHooks } from '../src/systems/script';
import { quest, resetQuest, currentObjective, RANKS } from '../src/systems/quest';
import { hqScripts } from '../src/data/dialog/hq';
import { ENCOUNTERS } from '../src/data/encounters';
import { RANK_REWARDS } from '../src/data/rankRewards';

const MAX_CHARS = 17;
const MAX_LINES = 3;

function expectFitsBox(pages: string[][], where: string): void {
  for (const page of pages) {
    expect(page.length, `${where} page has too many lines`).toBeLessThanOrEqual(MAX_LINES);
    for (const line of page) {
      expect(line.length, `${where} line too long: "${line}"`).toBeLessThanOrEqual(MAX_CHARS);
    }
  }
}

/** Ordered event log (ch2-content.test.ts idiom) — records rankUp's rank
 *  argument too, since KIRA's win needs to prove it promotes to OPERATIVE. */
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
    rankUp: (r, done) => { events.push('rankUp:' + r); done(); },
    heat: () => {},
    giveMon: () => {},
    npcRun: (id, done) => { events.push('npcRun:' + id); done(); },
    healParty: () => events.push('healParty'),
    sysMsg: (lines) => events.push('sysMsg:' + lines[0]),
    jobs: (done) => { events.push('jobs'); done(); },
    cardFlip: (done) => { events.push('cardFlip'); done(); },
    choice: (_p, done) => { events.push('choice'); done(true); },
  };
  return { hooks, events };
}

/** Fake hooks that capture every `say` call's full page set (moon-content.ts
 *  idiom), for asserting exact page count/first-line content. */
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
    choice: (_p, done) => done(true),
  };
  return { hooks, says };
}

beforeEach(() => resetQuest());

// The frozen table (CH3.1 task card): id, trainer, foe, flag, payout.
const MARKS = [
  { id: 'span_camper', trainer: 'CAMPER', foe: { species: 'ratikatt', lv: 7 }, flag: 'spanCamper', payout: 40 },
  { id: 'span_picnicker', trainer: 'PICNICKER', foe: { species: 'zubatt', lv: 8 }, flag: 'spanPicnicker', payout: 50 },
  { id: 'span_hiker', trainer: 'HIKER', foe: { species: 'geodood', lv: 9 }, flag: 'spanHiker', payout: 60 },
  { id: 'span_youngster', trainer: 'YOUNGSTER', foe: { species: 'ekanzz', lv: 10 }, flag: 'spanYoungster', payout: 80 },
  { id: 'span_lass', trainer: 'LASS', foe: { species: 'voltorbb', lv: 11 }, flag: 'spanLass', payout: 100 },
] as const;

describe('frozen Nugget Span encounter table (CH3.1)', () => {
  for (const mark of MARKS) {
    describe(mark.id, () => {
      it('pins trainer/foe, and onWin pays exactly once via one setFlag + one addCoins + a matching sysMsg', () => {
        const enc = ENCOUNTERS[mark.id];
        expect(enc, mark.id).toBeDefined();
        expect(enc.trainer).toBe(mark.trainer);
        expect(enc.foe).toEqual(mark.foe);

        const setFlags = enc.onWin.filter((s) => 'setFlag' in s);
        expect(setFlags.length, `${mark.id} onWin setFlag count`).toBe(1);
        expect((setFlags[0] as { setFlag: string }).setFlag).toBe(mark.flag);

        const addCoinsSteps = enc.onWin.filter((s) => 'addCoins' in s);
        expect(addCoinsSteps.length, `${mark.id} onWin addCoins count`).toBe(1);
        expect((addCoinsSteps[0] as { addCoins: number }).addCoins).toBe(mark.payout);

        const sysMsgSteps = enc.onWin.filter((s) => 'sysMsg' in s);
        expect(sysMsgSteps.length, `${mark.id} onWin sysMsg count`).toBe(1);
        expect((sysMsgSteps[0] as { sysMsg: string[] }).sysMsg[0]).toBe(`GOT ${mark.payout} COINS!`);
      });

      it('winText and every say page fit the box (≤3 lines × 17 chars)', () => {
        const enc = ENCOUNTERS[mark.id];
        expectFitsBox([enc.winText], `${mark.id} winText`);
        for (const step of enc.onWin) {
          if ('say' in step) expectFitsBox(step.say, `${mark.id} onWin say`);
        }
      });

      it('onWin carries no `if` guard — the challenge is guarded upstream by the flag, not the payout step', () => {
        const enc = ENCOUNTERS[mark.id];
        const guards = enc.onWin.filter((s) => 'if' in s);
        expect(guards.length, `${mark.id} onWin must not self-guard`).toBe(0);
      });

      it('onLose and onFlee are empty — whiteout/flee cannot pay', () => {
        const enc = ENCOUNTERS[mark.id];
        expect(enc.onLose).toEqual([]);
        expect(enc.onFlee).toEqual([]);
      });

      it('running onWin pays every time it runs — the guard living upstream, not in onWin, is why', () => {
        const enc = ENCOUNTERS[mark.id];
        const before = quest.coins;
        const { hooks: h1 } = eventHooks();
        runScript(enc.onWin, h1);
        expect(quest.coins - before).toBe(mark.payout);
        expect(quest.flags[mark.flag]).toBe(true);

        // Run it again: nothing in onWin itself stops a second payout — that
        // is exactly why the challenge script (other worker's bridge/
        // outskirts data) must guard the {battle} step with notFlag, not rely
        // on the encounter to be idempotent.
        const { hooks: h2 } = eventHooks();
        runScript(enc.onWin, h2);
        expect(quest.coins - before).toBe(mark.payout * 2);
      });
    });
  }
});

describe('span_kira (CH3.3 loyalty test + OPERATIVE rank beat)', () => {
  it('pins trainer/foe/winText/flee line', () => {
    const enc = ENCOUNTERS.span_kira;
    expect(enc.trainer).toBe('AGENT KIRA');
    expect(enc.foe).toEqual({ species: 'arbok', lv: 12 });
    expect(enc.winText).toEqual(['KIRA: ...Good.', 'That was the', 'test. You pass.']);
    expectFitsBox([enc.winText], 'span_kira winText');
    for (const step of enc.onFlee) {
      if ('say' in step) expectFitsBox(step.say, 'span_kira onFlee say');
    }
  });

  it('the encounter carries no addCoins of its own — only rankUp pays', () => {
    const addCoinsSteps = ENCOUNTERS.span_kira.onWin.filter((s) => 'addCoins' in s);
    expect(addCoinsSteps).toEqual([]);
  });

  it('win order: ch3Done set, rankUp fires BEFORE endScreen, rank becomes OPERATIVE, hooks.rankUp received OPERATIVE, coins pay the OPERATIVE reward', () => {
    quest.rank = 'AGENT';
    const before = quest.coins;
    const { hooks, events } = eventHooks();
    runScript(ENCOUNTERS.span_kira.onWin, hooks);

    expect(quest.flags.ch3Done).toBe(true);
    expect(quest.rank).toBe('OPERATIVE');

    const rankAt = events.findIndex((e) => e.startsWith('rankUp:'));
    const endAt = events.indexOf('endScreen');
    expect(rankAt).toBeGreaterThanOrEqual(0);
    expect(endAt).toBeGreaterThan(rankAt); // the 1e ordering rule, enforced
    expect(events[rankAt]).toBe('rankUp:OPERATIVE');

    expect(quest.coins - before).toBe(RANK_REWARDS.OPERATIVE.coins);
  });

  it('replay from OPERATIVE already: rankUp just clamps forward one more rung — no special-casing', () => {
    quest.rank = 'OPERATIVE';
    const before = quest.coins;
    const { hooks } = eventHooks();
    runScript(ENCOUNTERS.span_kira.onWin, hooks);

    const expectedRank = RANKS[Math.min(RANKS.indexOf('OPERATIVE') + 1, RANKS.length - 1)];
    expect(quest.rank).toBe(expectedRank);
    const reward = RANK_REWARDS[expectedRank];
    if (reward) expect(quest.coins - before).toBe(reward.coins);
  });

  it('onFlee just says a line — no battle, no flag mutation', () => {
    const { hooks, events } = eventHooks();
    runScript(ENCOUNTERS.span_kira.onFlee, hooks);
    expect(events).toEqual(['say']);
    expect(quest.flags.ch3Done).toBe(false);
  });
});

describe('chapter derivation across CH3 (integration; quest.test.ts owns the exhaustive cases)', () => {
  it('ch1+ch2 flags done → WORK THE SPAN; +spanLass → BEAT KIRA; +ch3Done → AWAIT ORDERS.', () => {
    quest.flags.briefed = true;
    quest.flags.guardBeaten = true;
    quest.flags.switchFound = true;
    quest.flags.lootTaken = true;
    quest.flags.missionDone = true;
    quest.flags.fossilsTaken = true;
    quest.flags.bradBeaten = true;
    quest.flags.ch2Done = true;
    expect(currentObjective()).toBe('WORK THE SPAN');

    quest.flags.spanCamper = true;
    quest.flags.spanPicnicker = true;
    quest.flags.spanHiker = true;
    quest.flags.spanYoungster = true;
    quest.flags.spanLass = true;
    expect(currentObjective()).toBe('BEAT KIRA');

    quest.flags.ch3Done = true;
    expect(currentObjective()).toBe('AWAIT ORDERS.');
  });
});

describe('Giovanni CH3 branches (npc:giovanni)', () => {
  // The CH2 hand-in path (bradBeaten && !ch2Done: sets ch2Done, rankUp then
  // endScreen) is unchanged by this card and already pinned in
  // tests/ch2-content.test.ts ("giovanni hand-in (CH2.4 rank beat)" >
  // "bradBeaten: rankUp fires BEFORE endScreen...") — not duplicated here.

  it('ch2Done && !ch3Done: the 4-page CH3 briefing runs, first line "GIOVANNI: AGENT.", mutates no flag', () => {
    quest.flags.missionDone = true;
    quest.flags.fossilsTaken = true;
    quest.flags.bradBeaten = true;
    quest.flags.ch2Done = true;
    const { hooks, says } = sayLogHooks();
    runScript(hqScripts['npc:giovanni'], hooks);

    expect(says.length).toBe(1);
    const pages = says[0];
    expect(pages.length).toBe(4);
    expect(pages[0][0]).toBe('GIOVANNI: AGENT.');
    expectFitsBox(pages, 'giovanni ch3 briefing');
    expect(quest.flags.ch3Done).toBe(false);
  });

  it('ch3Done: the 2-page afterglow runs', () => {
    quest.flags.missionDone = true;
    quest.flags.fossilsTaken = true;
    quest.flags.bradBeaten = true;
    quest.flags.ch2Done = true;
    quest.flags.ch3Done = true;
    const { hooks, says } = sayLogHooks();
    runScript(hqScripts['npc:giovanni'], hooks);

    expect(says.length).toBe(1);
    const pages = says[0];
    expect(pages.length).toBe(2);
    expect(pages[0][0]).toBe('GIOVANNI: KIRA');
    expectFitsBox(pages, 'giovanni ch3 afterglow');
  });
});
