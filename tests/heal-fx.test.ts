// F38 JCE.2 — the heal animation is DATA: two scripts insert { fx: 'heal' }
// before healParty and play the `heal` chime after it, before the toast.
// Pins the order fx → healParty → sfx → sysMsg for the HQ bunk and the CH6
// heal pad (the JCE.0 decision that picture and sound stay separate steps).
import { describe, it, expect } from 'vitest';
import { runScript, type ScriptHooks } from '../src/systems/script';
import { hqScripts } from '../src/data/dialog/hq';
import { syl5Scripts } from '../src/data/dialog/syl5';
import type { ScriptStep } from '../src/types';

function yesBranch(steps: ScriptStep[]): ScriptStep[] {
  const c = steps.find((s) => 'choice' in s);
  if (!c || !('choice' in c)) throw new Error('no choice step');
  return c.choice.yes;
}

function run(steps: ScriptStep[]): string[] {
  const events: string[] = [];
  const hooks: ScriptHooks = {
    say: (_p, done) => done(),
    battle: (_id, done) => done(null),
    warp: (_w, done) => done(),
    sfx: (n) => events.push('sfx:' + n),
    fx: (id, at) => events.push('fx:' + id + (at ? '@' + at.join(',') : '')),
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
    healParty: () => events.push('healParty'),
    sysMsg: () => events.push('sysMsg'),
    jobs: (done) => done(),
    cardFlip: (done) => done(),
    tour: (_stops, done) => done(),
    choice: (_p, done) => done(true),
  };
  runScript(steps, hooks);
  return events;
}

describe('JCE.2 heal animation: sparkles over the player, the chime, then the toast', () => {
  it('the HQ bunk (hq.ts npc:bunkgrunt YES): fx:heal → healParty → sfx:heal → sysMsg, fx with no `at` (= the player)', () => {
    expect(run(yesBranch(hqScripts['npc:bunkgrunt']))).toEqual(['fx:heal', 'healParty', 'sfx:heal', 'sysMsg']);
  });
  it('the CH6 heal pad (syl5.ts step:10,5 YES): the same four, same order', () => {
    expect(run(yesBranch(syl5Scripts['step:10,5']))).toEqual(['fx:heal', 'healParty', 'sfx:heal', 'sysMsg']);
  });
});
