// ONB.2/FLW.5 content: the HQ enter script's tour blocks, and a lint over
// every { tour } shipped anywhere. Machine behavior (pan/hold/skip) lives in
// tour.test.ts — this file drives the real dialog data through runScript
// with stub hooks and pins the frozen design: Myowth's five-stop tour for
// new players only (ending at the desk), the one-stop "boss wants a word"
// pan whenever a hand-in is pending, and never both.
import { describe, it, expect, beforeEach } from 'vitest';
import type { ScriptStep, TourStop } from '../src/types';
import { quest, resetQuest } from '../src/systems/quest';
import { MAPS } from '../src/data/maps';
import { runScript, type ScriptHooks } from '../src/systems/script';

const GIOVANNI_DESK: [number, number] = [112, 48]; // (7,3) * TILE

// The ch2-content stub-hooks factory, with tour recording its stops.
function tourHooks() {
  const events: string[] = [];
  const tours: TourStop[][] = [];
  const hooks: ScriptHooks = {
    say: (_p, done) => { events.push('say'); done(); },
    battle: (id, done) => { events.push('battle:' + id); done(null); },
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
    tour: (stops, done) => { events.push('tour'); tours.push(stops); done(); },
    choice: (_p, done) => { events.push('choice'); done(true); },
  };
  return { hooks, events, tours };
}

function runEnter(): { events: string[]; tours: TourStop[][] } {
  const { hooks, events, tours } = tourHooks();
  runScript(MAPS.hq.scripts.enter, hooks);
  return { events, tours };
}

beforeEach(() => resetQuest());

describe('ONB.2 — the fresh-save tour (design frozen 2026-08-21)', () => {
  it('a new player gets: Giovanni line, Myowth line, the five-stop tour ending at the desk', () => {
    const { events, tours } = runEnter();
    expect(events).toEqual(['say', 'say', 'tour']);
    expect(tours).toHaveLength(1);
    expect(tours[0]).toHaveLength(5);
    expect(tours[0][4].cam).toEqual(GIOVANNI_DESK); // delivered to the boss
    expect(quest.flags.introToured).toBe(true); // set BEFORE the tour ran
  });

  it('never replays: the same flags run the enter script clean the second time', () => {
    runEnter();
    const second = runEnter();
    expect(second.events).toEqual([]);
  });

  it('a returning save (briefed, pre-ONB.2) never sees the tour', () => {
    quest.flags.introSeen = true;
    quest.flags.briefed = true;
    const { events } = runEnter();
    expect(events).toEqual([]);
    expect(quest.flags.introToured).toBe(false); // nothing set for them either
  });
});

describe('FLW.5 — the hand-in pan (design frozen 2026-08-21)', () => {
  const settled = () => {
    quest.flags.introSeen = true;
    quest.flags.introToured = true;
    quest.flags.briefed = true;
  };

  it('CH1 hand-in pending: the reminder say, then a one-stop pan to the desk', () => {
    settled();
    quest.flags.lootTaken = true;
    const { events, tours } = runEnter();
    expect(events).toEqual(['say', 'tour']);
    expect(tours[0]).toHaveLength(1);
    expect(tours[0][0].cam).toEqual(GIOVANNI_DESK);
  });

  it('CH2 hand-in pending (BRAD beaten, chapter open): the one-stop pan fires', () => {
    settled();
    quest.flags.lootTaken = true;
    quest.flags.missionDone = true;
    quest.flags.bradBeaten = true;
    const { events, tours } = runEnter();
    expect(events).toEqual(['tour']);
    expect(tours[0]).toHaveLength(1);
    expect(tours[0][0].cam).toEqual(GIOVANNI_DESK);
  });

  it('nothing owed: no pan on an ordinary walk-in', () => {
    settled();
    quest.flags.lootTaken = true;
    quest.flags.missionDone = true;
    quest.flags.bradBeaten = true;
    quest.flags.ch2Done = true;
    const { events } = runEnter();
    expect(events).toEqual([]);
  });

  it('a hand-in only ever pans — it never re-fires the tour with it', () => {
    // The tour gate (notFlag briefed) and the hand-in terms (mission flags)
    // cannot hold together in real play; pin that the data agrees.
    quest.flags.introSeen = true;
    quest.flags.briefed = true;
    quest.flags.lootTaken = true;
    const { tours } = runEnter();
    expect(tours).toHaveLength(1);
    expect(tours[0]).toHaveLength(1);
  });
});

describe('lint: every shipped { tour } is drawable and readable', () => {
  function collectTours(steps: ScriptStep[], out: TourStop[][]): void {
    for (const s of steps) {
      if ('tour' in s) out.push(s.tour.stops);
      if ('if' in s) {
        collectTours(s.then, out);
        if (s.else) collectTours(s.else, out);
      }
      if ('choice' in s) {
        collectTours(s.choice.yes, out);
        if (s.choice.no) collectTours(s.choice.no, out);
      }
    }
  }

  it('stops are non-empty, lines are 1-3 x <=17 chars, cams sit inside their map', () => {
    let found = 0;
    for (const map of Object.values(MAPS)) {
      const out: TourStop[][] = [];
      for (const steps of Object.values(map.scripts)) collectTours(steps, out);
      for (const stops of out) {
        found++;
        expect(stops.length).toBeGreaterThan(0);
        for (const stop of stops) {
          expect(stop.lines.length).toBeGreaterThanOrEqual(1);
          expect(stop.lines.length).toBeLessThanOrEqual(3);
          for (const l of stop.lines) expect(l.length, l).toBeLessThanOrEqual(17);
          expect(stop.cam[0]).toBeGreaterThanOrEqual(0);
          expect(stop.cam[0]).toBeLessThanOrEqual(map.w * 16);
          expect(stop.cam[1]).toBeGreaterThanOrEqual(0);
          expect(stop.cam[1]).toBeLessThanOrEqual(map.h * 16);
        }
      }
    }
    expect(found).toBe(2); // hq enter: the tour + the hand-in pan — the sanity pin
  });
});
