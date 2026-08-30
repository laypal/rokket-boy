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
    tour: (_stops, done) => { events.push('tour'); done(); },
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

  // QA.5 (2026-08-22): three more STATUS-mentioning toasts joined this one —
  // the CH1/CH2/CH3 briefings' "CHECK STATUS." toast. CH4.3 adds a fourth
  // (the CH4 briefing's own toast, same slot the CH3 briefing's replaced at
  // ch2Done). CH5.3 adds a fifth (the CH5 briefing's own toast, same slot
  // the CH4 briefing's replaced at ch4Done). CH6.3 adds a sixth (the CH6
  // briefing's own toast, same slot the CH5 briefing's replaced at ch5Done).
  // The invariant this test actually guards (one rankUp-adjacent toast,
  // checked above) still holds; this one is retargeted to the new total so a
  // stray extra toast still fails it.
  it('the game-wide count of STATUS-mentioning sysMsg steps is exactly 7 (1 rank-ladder + 6 QA.5 briefings)', () => {
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
    expect(total).toBe(7);
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

describe('QA.5 — quest-added toast (hq.ts briefings)', () => {
  // Every `then` block anywhere in hq.ts that sets one of the three
  // briefing flags must end with the NEW JOB toast — appended AFTER the
  // say pages, so it surfaces once the dialog closes (sysMsg only ticks
  // in worldDraw). Walk every hqScripts entry, not just npc:giovanni, so a
  // future briefing added elsewhere can't ship silently.
  const BRIEFING_FLAGS = ['briefed', 'ch2Briefed', 'ch3Briefed'];

  function findBriefingBlocks(steps: ScriptStep[], out: ScriptStep[][]): void {
    for (const step of steps) {
      if ('if' in step) {
        // the CH1 briefing's setFlag lives in the ELSE (the THEN is the
        // already-briefed brush-off) — check both arms, not just then.
        if (step.then.some((s) => 'setFlag' in s && BRIEFING_FLAGS.includes(s.setFlag))) {
          out.push(step.then);
        }
        if (step.else && step.else.some((s) => 'setFlag' in s && BRIEFING_FLAGS.includes(s.setFlag))) {
          out.push(step.else);
        }
        findBriefingBlocks(step.then, out);
        if (step.else) findBriefingBlocks(step.else, out);
      }
      if ('choice' in step) {
        findBriefingBlocks(step.choice.yes, out);
        if (step.choice.no) findBriefingBlocks(step.choice.no, out);
      }
    }
  }

  it('every branch that sets briefed/ch2Briefed/ch3Briefed ends with the NEW JOB toast', () => {
    const blocks: ScriptStep[][] = [];
    for (const steps of Object.values(hqScripts)) findBriefingBlocks(steps, blocks);

    expect(blocks.length).toBe(3); // the CH1/CH2/CH3 briefings — no more, no fewer
    for (const block of blocks) {
      const last = block[block.length - 1];
      expect('sysMsg' in last && last.sysMsg[0] === 'NEW JOB!', `block ending ${JSON.stringify(last)}`).toBe(true);
    }
  });

  it('BDD: each briefing talk fires exactly one NEW JOB toast, after the say pages close', () => {
    // CH1 briefing — fresh save.
    {
      const { hooks, events } = eventHooks();
      runScript(hqScripts['npc:giovanni'], hooks);
      const sayAt = events.lastIndexOf('say');
      const toastAt = events.indexOf('sysMsg:NEW JOB!|CHECK STATUS.');
      expect(toastAt).toBeGreaterThan(sayAt);
      expect(events.filter((e) => e.startsWith('sysMsg:')).length).toBe(1);
    }
    // CH2 briefing.
    {
      resetQuest();
      quest.flags.missionDone = true;
      const { hooks, events } = eventHooks();
      runScript(hqScripts['npc:giovanni'], hooks);
      expect(events).toContain('sysMsg:NEW JOB!|CHECK STATUS.');
      expect(events.filter((e) => e.startsWith('sysMsg:')).length).toBe(1);
    }
    // CH3 briefing.
    {
      resetQuest();
      quest.flags.ch2Done = true;
      const { hooks, events } = eventHooks();
      runScript(hqScripts['npc:giovanni'], hooks);
      expect(events).toContain('sysMsg:NEW JOB!|CHECK STATUS.');
      expect(events.filter((e) => e.startsWith('sysMsg:')).length).toBe(1);
    }
  });

  it('no talk can fire both the NEW JOB toast and the ONB.6 RANK LADDER toast (the CH2 hand-in is a separate talk from either briefing)', () => {
    resetQuest();
    quest.flags.missionDone = true;
    quest.flags.bradBeaten = true;
    const { hooks, events } = eventHooks();
    runScript(hqScripts['npc:giovanni'], hooks);
    const toasts = events.filter((e) => e.startsWith('sysMsg:'));
    expect(toasts).toEqual(['sysMsg:RANK LADDER:|START > STATUS|> RANK']); // hand-in only — no NEW JOB
  });

  it('the intro (`enter`) script never sets a briefing flag, so it can never fire the toast', () => {
    const src = readFileSync(new URL('../src/data/dialog/hq.ts', import.meta.url), 'utf8');
    const enterBlock = src.slice(src.indexOf('enter: ['), src.indexOf('\n};'));
    for (const flag of BRIEFING_FLAGS) {
      expect(enterBlock).not.toMatch(new RegExp(`setFlag: '${flag}'`));
    }
  });
});
