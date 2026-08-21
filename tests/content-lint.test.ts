// Content lints (plan §9): every dialogue line fits the box, every say page
// has ≤3 lines, and map data is internally consistent. These run over ALL
// shipped content, so new chapters get linted for free.
import { describe, it, expect } from 'vitest';
import type { ScriptStep } from '../src/types';
import { MAPS } from '../src/data/maps';
import { ENCOUNTERS } from '../src/data/encounters';
import { BG_PAL, ALERT, ALERT_IDX, OBJ_PAL } from '../src/data/palettes';
import { CHAPTERS } from '../src/systems/quest';
import { CHARSETS } from '../src/data/chars';
import { MON_WALKERS } from '../src/systems/world';

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

// ── FLW.2: BG palette shape ──────────────────────────────────────────────
// Menus draw from whichever map palette is live (`BG_PAL[G.map.pal]`), so a
// palette missing the ALERT slot would draw a hurt HP readout as `undefined`
// on exactly the maps nobody thought to test. Pinned over ALL entries so the
// next map's palette can't ship short — the derive-and-lint idiom MNU.2
// established for the PACK box.
describe('BG_PAL shape', () => {
  it('every background palette is 4 shades plus the shared ALERT slot', () => {
    for (const [id, pal] of Object.entries(BG_PAL)) {
      expect(pal, `BG_PAL.${id}`).toHaveLength(5);
      expect(pal[ALERT_IDX], `BG_PAL.${id} alert slot`).toBe(ALERT);
    }
  });

  it('every shade is a full 6-digit hex colour', () => {
    for (const [id, pal] of Object.entries(BG_PAL)) {
      pal.forEach((c, i) => {
        expect(c, `BG_PAL.${id}[${i}]`).toMatch(/^#[0-9a-f]{6}$/);
      });
    }
  });

});

// ── ONB.7: every NpcDef resolves to something drawable ───────────────────
// Mirrors world.ts's draw-time resolution (MON_WALKERS animated frames, or
// a CHARSETS entry — CHAR_FRAMES is built to cover every CHARSETS key, so
// there's no third path) so a typo'd `char` fails a fast lint instead of a
// blank tile in the browser. `pal` overrides must likewise be a real
// OBJ_PAL key — the healer card is the reason this lint exists.
describe('NPC char/pal resolution', () => {
  it('every NpcDef.char resolves to a drawable char (MON_WALKERS or CHARSETS)', () => {
    let seen = 0;
    for (const map of Object.values(MAPS)) {
      for (const npc of map.npcs) {
        seen++;
        const drawable = MON_WALKERS.has(npc.char) || npc.char in CHARSETS;
        expect(drawable, `${map.id} npc ${npc.id}: char "${npc.char}" resolves in neither MON_WALKERS nor CHARSETS`).toBe(true);
      }
    }
    expect(seen).toBeGreaterThan(0); // sanity: the walker actually found npcs
  });

  it('every NpcDef.pal is a registered OBJ_PAL key', () => {
    let seen = 0;
    for (const map of Object.values(MAPS)) {
      for (const npc of map.npcs) {
        if (!npc.pal) continue;
        seen++;
        expect(OBJ_PAL[npc.pal], `${map.id} npc ${npc.id}: pal "${npc.pal}" not in OBJ_PAL`).toBeDefined();
      }
    }
    expect(seen).toBeGreaterThan(0); // sanity: vendor/blackmarket pal overrides exist
  });
});
