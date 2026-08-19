// ONB.4/ONB.6 content tests: Myowth's egg hint (count derives from the
// EGG_TOTAL registry, reachable with no flag set first) and the first-rank-up
// toast (fires exactly once, in the CH2 hand-in, after the rank card).
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { runScript, type ScriptHooks } from '../src/systems/script';
import { quest, resetQuest } from '../src/systems/quest';
import type { ScriptStep } from '../src/types';
import { hqScripts } from '../src/data/dialog/hq';
import { EGG_TOTAL } from '../src/data/eggs';
import { MAPS } from '../src/data/maps';
import { ENCOUNTERS } from '../src/data/encounters';

/** Recursive say-page walker — same idiom as content-lint.test.ts's
 *  collectSays, trimmed to just the branches ONB.4 needs (say/if.then/else). */
function collectSayPages(steps: ScriptStep[], out: string[][]): void {
  for (const step of steps) {
    if ('say' in step) out.push(...step.say);
    if ('if' in step) {
      collectSayPages(step.then, out);
      if (step.else) collectSayPages(step.else, out);
    }
    if ('choice' in step) {
      out.push(...step.choice.say);
      collectSayPages(step.choice.yes, out);
      if (step.choice.no) collectSayPages(step.choice.no, out);
    }
  }
}

/** Ordered event log fake hooks — copied from ch2-content.test.ts's
 *  eventHooks (not imported: that file keeps it private), extended with a
 *  sayLog so ONB.4's BDD check can assert the hint page was actually spoken. */
function eventHooks() {
  const events: string[] = [];
  const sayLog: string[][] = [];
  const hooks: ScriptHooks = {
    say: (pages, done) => { events.push('say'); sayLog.push(...pages); done(); },
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
    sysMsg: (lines) => { events.push('sysMsg:' + lines.join('|')); },
    jobs: (done) => { events.push('jobs'); done(); },
    cardFlip: (done) => { events.push('cardFlip'); done(); },
    choice: (_p, done) => { events.push('choice'); done(true); },
  };
  return { hooks, events, sayLog };
}

beforeEach(() => resetQuest());

describe('ONB.4 — Myowth mentions the eggs', () => {
  it('the pre-mission branch has a page quoting EGG_TOTAL, not a literal', () => {
    const pages: string[][] = [];
    collectSayPages(hqScripts['npc:myowth'], pages);
    const hasEggTotalLine = pages.some((page) =>
      page.some((line) => line.includes(EGG_TOTAL + ' of them')),
    );
    expect(hasEggTotalLine).toBe(true);
  });

  it('the hint line is built from EGG_TOTAL in source, not a hard-coded number (precedent: tests/egg-lint.test.ts:51)', () => {
    const src = readFileSync(new URL('../src/data/dialog/hq.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/EGG_TOTAL \+ ' of them/);
    expect(src).not.toMatch(/'\d+ of them/);
  });

  it('BDD: on a fresh save with no flags set, talking to Myowth reaches the egg hint', () => {
    const { hooks, sayLog } = eventHooks();
    runScript(hqScripts['npc:myowth'], hooks);
    const spoken = sayLog.some((page) => page.some((line) => line.includes(EGG_TOTAL + ' of them')));
    expect(spoken).toBe(true);
  });

  it('once missionDone, the pre-mission branch (and its hint) is not reachable — the drill branch runs instead', () => {
    quest.flags.missionDone = true;
    const { hooks, sayLog } = eventHooks();
    runScript(hqScripts['npc:myowth'], hooks);
    const spoken = sayLog.some((page) => page.some((line) => line.includes(EGG_TOTAL + ' of them')));
    expect(spoken).toBe(false);
  });
});

describe('ONB.6 — first rank-up points at the ladder', () => {
  it('exactly one rankUp in the whole game is followed (in the same step array) by a STATUS sysMsg, and it is in hq npc:giovanni', () => {
    const hits: string[] = [];

    function scan(steps: ScriptStep[], where: string): void {
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        if ('rankUp' in step) {
          const rest = steps.slice(i + 1);
          const toastCount = rest.filter(
            (s): s is { sysMsg: string[] } => 'sysMsg' in s && s.sysMsg.some((l) => l.includes('STATUS')),
          ).length;
          for (let t = 0; t < toastCount; t++) hits.push(where); // one push per toast, not per rankUp
        }
        if ('if' in step) {
          scan(step.then, where + ' > then');
          if (step.else) scan(step.else, where + ' > else');
        }
        if ('choice' in step) {
          scan(step.choice.yes, where + ' > choice.yes');
          if (step.choice.no) scan(step.choice.no, where + ' > choice.no');
        }
      }
    }

    for (const map of Object.values(MAPS)) {
      for (const [key, steps] of Object.entries(map.scripts)) {
        scan(steps, `${map.id}:${key}`);
      }
    }
    for (const [id, enc] of Object.entries(ENCOUNTERS)) {
      scan(enc.onWin, `enc:${id} onWin`);
      scan(enc.onLose, `enc:${id} onLose`);
      scan(enc.onFlee, `enc:${id} onFlee`);
    }

    expect(hits.length).toBe(1);
    expect(hits[0].startsWith('hq:npc:giovanni')).toBe(true);
  });

  it('the game-wide count of STATUS-mentioning sysMsg steps is exactly 1', () => {
    function countStatusToasts(steps: ScriptStep[]): number {
      let n = 0;
      for (const step of steps) {
        if ('sysMsg' in step && step.sysMsg.some((l) => l.includes('STATUS'))) n++;
        if ('if' in step) {
          n += countStatusToasts(step.then);
          if (step.else) n += countStatusToasts(step.else);
        }
        if ('choice' in step) {
          n += countStatusToasts(step.choice.yes);
          if (step.choice.no) n += countStatusToasts(step.choice.no);
        }
      }
      return n;
    }

    let total = 0;
    for (const map of Object.values(MAPS)) {
      for (const steps of Object.values(map.scripts)) total += countStatusToasts(steps);
    }
    for (const enc of Object.values(ENCOUNTERS)) {
      total += countStatusToasts(enc.onWin);
      total += countStatusToasts(enc.onLose);
      total += countStatusToasts(enc.onFlee);
    }
    expect(total).toBe(1);
  });

  it('the giovanni hand-in fires rankUp, then endScreen, then the STATUS toast, in that order', () => {
    quest.flags.missionDone = true;
    quest.flags.bradBeaten = true;
    const { hooks, events } = eventHooks();
    runScript(hqScripts['npc:giovanni'], hooks);
    const rankAt = events.indexOf('rankUp');
    const endAt = events.indexOf('endScreen');
    const toastAt = events.findIndex((e) => e.startsWith('sysMsg:') && e.includes('STATUS'));
    expect(rankAt).toBeGreaterThanOrEqual(0);
    expect(endAt).toBeGreaterThan(rankAt);
    expect(toastAt).toBeGreaterThan(endAt);
  });

  it('a later promotion (span_kira onWin) does not repeat the toast', () => {
    const hasRankUp = ENCOUNTERS.span_kira.onWin.some((s) => 'rankUp' in s);
    expect(hasRankUp).toBe(true);
    const { hooks, events } = eventHooks();
    runScript(ENCOUNTERS.span_kira.onWin, hooks);
    const toastFired = events.some((e) => e.startsWith('sysMsg:') && e.includes('STATUS'));
    expect(toastFired).toBe(false);
  });
});
