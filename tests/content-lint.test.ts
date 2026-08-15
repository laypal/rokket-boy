// Content lints (plan §9): every dialogue line fits the box, every say page
// has ≤3 lines, and map data is internally consistent. These run over ALL
// shipped content, so new chapters get linted for free.
import { describe, it, expect } from 'vitest';
import type { ScriptStep } from '../src/types';
import { MAPS } from '../src/data/maps';
import { ENCOUNTERS } from '../src/data/encounters';
import { CHAPTERS } from '../src/systems/quest';

const MAX_CHARS = 17; // plan §5: max 3 lines × 17 chars per page
const MAX_LINES = 3;

function collectSays(steps: ScriptStep[], out: string[][][], path: string, where: string[]): void {
  for (const step of steps) {
    if ('say' in step) {
      out.push(step.say);
      where.push(path);
    }
    if ('sayCycle' in step) {
      for (const d of step.sayCycle.dialogs) {
        out.push(d);
        where.push(path + ' (sayCycle)');
      }
    }
    // CH2.10 toast lines share the box budget — lint them as a one-page say
    if ('sysMsg' in step) {
      out.push([step.sysMsg]);
      where.push(path + ' (sysMsg)');
    }
    if ('if' in step) {
      collectSays(step.then, out, path + ' > then', where);
      if (step.else) collectSays(step.else, out, path + ' > else', where);
    }
    // { choice }: its pages draw in the same box (last page also hosts the
    // YES/NO row, budgeted below), and both branches are real scripts
    if ('choice' in step) {
      out.push(step.choice.say);
      where.push(path + ' (choice)');
      collectSays(step.choice.yes, out, path + ' > yes', where);
      if (step.choice.no) collectSays(step.choice.no, out, path + ' > no', where);
    }
  }
}

/** The YES/NO row shares the last page's bottom text row (dialog.ts
 *  CHOICE_X.yes = 96): a 3-line last page collides with the picker, so a
 *  choice's final page may use 2 lines at most. */
function collectChoiceLastPages(steps: ScriptStep[], out: string[][], where: string[], path: string): void {
  for (const step of steps) {
    if ('choice' in step) {
      out.push(step.choice.say[step.choice.say.length - 1]);
      where.push(path);
      collectChoiceLastPages(step.choice.yes, out, where, path + ' > yes');
      if (step.choice.no) collectChoiceLastPages(step.choice.no, out, where, path + ' > no');
    }
    if ('if' in step) {
      collectChoiceLastPages(step.then, out, where, path + ' > then');
      if (step.else) collectChoiceLastPages(step.else, out, where, path + ' > else');
    }
  }
}

describe('content lints', () => {
  it('every scripted dialogue page fits 3 lines × 17 chars', () => {
    const says: string[][][] = [];
    const where: string[] = [];
    for (const map of Object.values(MAPS)) {
      for (const [key, steps] of Object.entries(map.scripts)) {
        collectSays(steps, says, `${map.id}:${key}`, where);
      }
    }
    for (const enc of Object.values(ENCOUNTERS)) {
      collectSays(enc.onWin, says, 'enc onWin', where);
      collectSays(enc.onLose, says, 'enc onLose', where);
      collectSays(enc.onFlee, says, 'enc onFlee', where);
    }
    says.forEach((pages, i) => {
      for (const page of pages) {
        expect(page.length, `${where[i]} page has too many lines`).toBeLessThanOrEqual(MAX_LINES);
        for (const line of page) {
          expect(line.length, `${where[i]} line too long: "${line}"`).toBeLessThanOrEqual(MAX_CHARS);
        }
      }
    });
    expect(says.length).toBeGreaterThan(20); // sanity: the walker actually found content
  });

  it("every { choice }'s last page leaves the bottom row for the YES/NO picker (≤2 lines)", () => {
    const pages: string[][] = [];
    const where: string[] = [];
    for (const map of Object.values(MAPS)) {
      for (const [key, steps] of Object.entries(map.scripts)) {
        collectChoiceLastPages(steps, pages, where, `${map.id}:${key}`);
      }
    }
    for (const enc of Object.values(ENCOUNTERS)) {
      collectChoiceLastPages(enc.onWin, pages, where, 'enc onWin');
      collectChoiceLastPages(enc.onLose, pages, where, 'enc onLose');
      collectChoiceLastPages(enc.onFlee, pages, where, 'enc onFlee');
    }
    pages.forEach((page, i) => {
      expect(page.length, `${where[i]}: choice last page collides with the picker row`).toBeLessThanOrEqual(2);
      // and the picker starts at x=96, so line 2 (if any) is fine at 17 — the
      // picker sits on the THIRD row slot, which this cap keeps empty
    });
    expect(pages.length).toBeGreaterThan(0); // the bunk grunt at minimum
  });

  it('every sign page fits the box (≤3 lines × 17 chars) — the box DROPS a 4th line silently', () => {
    for (const map of Object.values(MAPS)) {
      for (const [key, pages] of Object.entries(map.signs)) {
        expect(pages.length, `${map.id} sign ${key} has no pages`).toBeGreaterThan(0);
        for (const lines of pages) {
          expect(lines.length, `${map.id} sign ${key}: page has ${lines.length} lines`).toBeLessThanOrEqual(MAX_LINES);
          for (const line of lines) {
            expect(line.length, `${map.id} sign ${key}: "${line}"`).toBeLessThanOrEqual(MAX_CHARS);
          }
        }
      }
    }
  });

  it('every map grid is rectangular and every row is defined', () => {
    for (const map of Object.values(MAPS)) {
      expect(map.grid.length).toBe(map.h);
      for (const row of map.grid) expect(row.length).toBe(map.w);
    }
  });

  it('battle winText fits the message box', () => {
    for (const enc of Object.values(ENCOUNTERS)) {
      expect(enc.winText.length).toBeLessThanOrEqual(MAX_LINES);
      for (const line of enc.winText) expect(line.length).toBeLessThanOrEqual(MAX_CHARS);
    }
  });

  it('every chapter objective fits the STATUS line (§4.7)', () => {
    for (const ch of CHAPTERS) {
      for (const step of ch.steps) {
        expect(
          step.objective.length,
          `${ch.id} objective too long: "${step.objective}"`,
        ).toBeLessThanOrEqual(MAX_CHARS);
      }
    }
  });

  it('every heatGuard.encounterId resolves in the encounter registry', () => {
    let seen = 0;
    for (const map of Object.values(MAPS)) {
      for (const npc of map.npcs) {
        if (npc.heatGuard) {
          seen++;
          expect(
            ENCOUNTERS[npc.heatGuard.encounterId],
            `${map.id} npc ${npc.id} heatGuard`,
          ).toBeDefined();
        }
      }
    }
    expect(seen).toBeGreaterThan(0); // sanity: the walker actually found a heatGuard
  });
});
