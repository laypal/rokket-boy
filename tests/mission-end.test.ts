// FLW.4: mission-complete "ride back or walk?" choice — design rationale,
// ordering rule and the CH1 exclusion all live on RIDE_HOME in
// src/data/encounters.ts; this file only tests the frozen closer list below.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { runScript, type ScriptHooks } from '../src/systems/script';
import { resetQuest } from '../src/systems/quest';
import { ENCOUNTERS } from '../src/data/encounters';
import { MAPS } from '../src/data/maps';
import { WALKABLE } from '../src/data/tiles';
import type { ScriptStep } from '../src/types';

const MISSION_CLOSERS = ['brad_ratikatt', 'span_kira', 'ss_chief2'] as const;

/** Narrows a step to the `{ choice }` variant (mirrors the `'choice' in
 *  step` idiom used by egg-lint.test.ts / content-lint.test.ts). */
function findChoice(steps: ScriptStep[]): Extract<ScriptStep, { choice: unknown }> | undefined {
  return steps.find((s): s is Extract<ScriptStep, { choice: unknown }> => 'choice' in s);
}

function eventHooks(answerYes: boolean) {
  const events: string[] = [];
  const hooks: ScriptHooks = {
    say: (_p, done) => done(),
    battle: (id, done) => { events.push('battle:' + id); done(null); },
    warp: (w, done) => { events.push('warp:' + w.join(',')); done(); },
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
    tour: (_stops, done) => { events.push('tour'); done(); },
    choice: (_p, done) => { events.push('choice'); done(answerYes); },
  };
  return { hooks, events };
}

beforeEach(() => resetQuest());

describe('FLW.4 mission-complete choice: every closer offers it', () => {
  for (const id of MISSION_CLOSERS) {
    describe(id, () => {
      it('onWin carries exactly one choice step', () => {
        const choices = ENCOUNTERS[id].onWin.filter((s) => 'choice' in s);
        expect(choices.length, `${id} onWin choice count`).toBe(1);
      });

      it('yes branch is exactly one warp naming a real map and a walkable cell', () => {
        const choice = findChoice(ENCOUNTERS[id].onWin);
        expect(choice, `${id} has no choice step`).toBeDefined();
        const yes = choice!.choice.yes;
        expect(yes.length, `${id} choice.yes step count`).toBe(1);
        const step = yes[0];
        expect('warp' in step, `${id} choice.yes[0] is not a warp`).toBe(true);
        if ('warp' in step) {
          const [mapId, x, y] = step.warp;
          const dest = MAPS[mapId];
          expect(dest, `${id} warp target map "${mapId}"`).toBeDefined();
          expect(x >= 0 && x < dest.w, `${id} warp x ${x} out of ${dest.w} bounds`).toBe(true);
          expect(y >= 0 && y < dest.h, `${id} warp y ${y} out of ${dest.h} bounds`).toBe(true);
          const tile = dest.grid[y][x];
          expect(WALKABLE.has(tile), `${id} warp lands on unwalkable tile "${tile}"`).toBe(true);
        }
      });

      it('no branch is empty or absent — declining hands control back to the world', () => {
        const choice = findChoice(ENCOUNTERS[id].onWin);
        const no = choice!.choice.no;
        expect(no === undefined || no.length === 0, `${id} choice.no should be empty/absent`).toBe(true);
      });

      it('choice sits after any rankUp and before any endScreen in the same array', () => {
        const onWin = ENCOUNTERS[id].onWin;
        const choiceAt = onWin.findIndex((s) => 'choice' in s);
        const rankAt = onWin.findIndex((s) => 'rankUp' in s);
        const endAt = onWin.findIndex((s) => 'endScreen' in s);
        if (rankAt >= 0) expect(choiceAt, `${id} choice must come after rankUp`).toBeGreaterThan(rankAt);
        if (endAt >= 0) expect(choiceAt, `${id} choice must come before endScreen`).toBeLessThan(endAt);
      });
      // Last-page line/char budget for `choice` is already enforced for every
      // encounter onWin by tests/content-lint.test.ts — not duplicated here.
    });
  }

  it('CH1 guard_voltorbb.onWin carries no ride-home choice (hand-in already happens at HQ)', () => {
    const choices = ENCOUNTERS.guard_voltorbb.onWin.filter((s) => 'choice' in s);
    expect(choices).toEqual([]);
  });

  it('spar_jessika.onWin (HQ training drill, not a mission close) carries no ride-home choice', () => {
    const choices = ENCOUNTERS.spar_jessika.onWin.filter((s) => 'choice' in s);
    expect(choices).toEqual([]);
  });
});

describe('mission closers driven through the real interpreter', () => {
  for (const id of MISSION_CLOSERS) {
    it(`${id}: YES warps once to hq,9,12,up and the script completes`, () => {
      const { hooks, events } = eventHooks(true);
      const done = vi.fn();
      runScript(ENCOUNTERS[id].onWin, hooks, done);
      expect(events.filter((e) => e.startsWith('warp:'))).toEqual(['warp:hq,9,12,up']);
      expect(done).toHaveBeenCalledTimes(1);
    });

    it(`${id}: NO fires no warp and the script completes`, () => {
      const { hooks, events } = eventHooks(false);
      const done = vi.fn();
      runScript(ENCOUNTERS[id].onWin, hooks, done);
      expect(events.filter((e) => e.startsWith('warp:'))).toEqual([]);
      expect(done).toHaveBeenCalledTimes(1);
    });
  }

  // The one ordering drive (span_kira is the closer with both rankUp and
  // endScreen, so it's the one that proves the placement rule end to end).
  it('span_kira YES order: rankUp -> choice -> warp(hq,9,12,up) -> endScreen', () => {
    const { hooks, events } = eventHooks(true);
    runScript(ENCOUNTERS.span_kira.onWin, hooks);
    const order = events.filter(
      (e) => /^rankUp:/.test(e) || e === 'choice' || e.startsWith('warp:') || e === 'endScreen'
    );
    expect(order).toEqual([expect.stringMatching(/^rankUp:/), 'choice', 'warp:hq,9,12,up', 'endScreen']);
  });

  it('span_kira NO order: rankUp -> choice -> endScreen, no warp', () => {
    const { hooks, events } = eventHooks(false);
    runScript(ENCOUNTERS.span_kira.onWin, hooks);
    const order = events.filter(
      (e) => /^rankUp:/.test(e) || e === 'choice' || e.startsWith('warp:') || e === 'endScreen'
    );
    expect(order).toEqual([expect.stringMatching(/^rankUp:/), 'choice', 'endScreen']);
  });
});
