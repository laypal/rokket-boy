// QA.7: the battle action prompt was clipped behind the root menu's list
// window (WHAT WILL / KOFFINK shipped in place of WHAT WILL / KOFFINK DO?).
// This pins the geometry battleDraw.ts derives its budgets from and lints
// every string any battle phase draws beside drawList against it — the
// FLW.3 shop row-budget lint (tests/shop-data-lint.test.ts) is the style
// precedent. No literal 7/10/11 here: everything comes from the exports.
import { describe, it, expect } from 'vitest';
import { LIST_X, ROOT_LIST_X, PROMPT_X, promptBudget, labelBudget } from '../src/systems/battleDraw';
import { ROOT_MENU } from '../src/systems/battle';
import { SPECIES } from '../src/data/mons';
import { MOVES } from '../src/data/moves';
import { MON_NAME_CAP } from '../src/systems/menu';

describe('battle prompt/list geometry lint (QA.7)', () => {
  it('pins the derived geometry', () => {
    // Regression pin — if drawList's window x, the cursor/label offsets or
    // W ever change, this fails loud instead of a prompt silently clipping
    // under the list again.
    expect(LIST_X).toBe(62);
    expect(ROOT_LIST_X).toBe(92);
    expect(PROMPT_X).toBe(6);
    expect(promptBudget(LIST_X)).toBe(7);
    expect(promptBudget(ROOT_LIST_X)).toBe(10);
    expect(labelBudget(LIST_X)).toBe(9);
    expect(labelBudget(ROOT_LIST_X)).toBe(6);
  });

  it('root menu prompt (WHAT WILL / mon name / DO?) fits promptBudget(ROOT_LIST_X)', () => {
    const budget = promptBudget(ROOT_LIST_X);
    expect('WHAT WILL'.length).toBeLessThanOrEqual(budget);
    expect('DO?'.length).toBeLessThanOrEqual(budget);
    // Every species name plus the nick cap (MON_NAME_CAP, menu.ts) — the
    // longest name the root prompt's second line can ever draw.
    for (const [id, sp] of Object.entries(SPECIES)) {
      expect(sp.name.length, `${id} name "${sp.name}" overflows the root prompt`).toBeLessThanOrEqual(budget);
    }
    expect(MON_NAME_CAP).toBeLessThanOrEqual(budget);
  });

  it('ROOT_MENU labels fit labelBudget(ROOT_LIST_X)', () => {
    const budget = labelBudget(ROOT_LIST_X);
    for (const label of ROOT_MENU) {
      expect(label.length, `ROOT_MENU "${label}" overflows the root list window`).toBeLessThanOrEqual(budget);
    }
  });

  it('other phase prompts (moves/replace/evolve/evoConfirm) fit promptBudget(LIST_X)', () => {
    const budget = promptBudget(LIST_X);
    const prompts = ['WHICH', 'MOVE?', 'FORGET', 'WHICH?', 'LET IT', 'CHANGE?', 'NEVER', 'EVOLVE?'];
    for (const p of prompts) {
      expect(p.length, `"${p}" overflows the LIST_X-window prompt budget`).toBeLessThanOrEqual(budget);
    }
  });

  it('every MOVES name and the evolve/evoConfirm list labels fit labelBudget(LIST_X)', () => {
    const budget = labelBudget(LIST_X);
    for (const [id, m] of Object.entries(MOVES)) {
      expect(m.name.length, `move "${id}" name "${m.name}" overflows the list window`).toBeLessThanOrEqual(budget);
    }
    for (const label of ['EVOLVE', 'STOP', 'NO', 'YES']) {
      expect(label.length, `"${label}" overflows the list window`).toBeLessThanOrEqual(budget);
    }
  });
});
