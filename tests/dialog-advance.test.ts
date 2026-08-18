// FLW.1 (2026-08-18): B advances plain dialog the same way A does — typewriter
// skip, page turn, close+after. The one exception (B = NO on a { choice }
// last page) is already covered in dialog-choice.test.ts and re-asserted here
// as a regression guard. Same mock/harness idiom as dialog-choice.test.ts.
import { describe, it, expect, beforeEach, vi } from 'vitest';

const keys = { down: new Set<string>(), pressed: new Set<string>() };
vi.mock('../src/engine/renderer', () => ({
  clamp: (v: number, a: number, z: number) => Math.max(a, Math.min(z, v)),
  drawWindow: vi.fn(),
  text: vi.fn(),
  W: 160,
  H: 144,
}));
vi.mock('../src/engine/audio', () => ({ Audio2: { play: vi.fn(), sfx: vi.fn() } }));
vi.mock('../src/engine/input', () => ({
  Input: {
    held: (k: string): boolean => keys.down.has(k),
    hit: (k: string): boolean => keys.pressed.has(k),
    endFrame: (): void => keys.pressed.clear(),
    dirHeld: (): null => null,
  },
}));

import { G } from '../src/state';
import { openChoice, openDialog, dialogUpdate, choiceArmed } from '../src/systems/dialog';
import { Audio2 } from '../src/engine/audio';

function frame(): void { dialogUpdate(); keys.pressed.clear(); }
function tap(k: string): void { keys.pressed.add(k); frame(); }
/** Hold the given button to fast-type the current page to completion. */
function typeOutWith(key: 'a' | 'b'): void {
  keys.down.add(key);
  let guard = 0;
  while (G.dialog && !choiceArmed() && G.dialog.chars < G.dialog.pages[G.dialog.page].join('').length && guard++ < 200) frame();
  keys.down.delete(key);
}

beforeEach(() => {
  keys.down.clear();
  keys.pressed.clear();
  G.dialog = null;
  G.state = 'world';
  vi.mocked(Audio2.sfx).mockClear();
});

describe('B advances plain dialog like A (FLW.1)', () => {
  it('B completes an in-progress typewriter (same as holding A)', () => {
    openDialog([['A fairly long line of text here']], () => {});
    expect(G.dialog!.chars).toBe(0);
    typeOutWith('b');
    const total = G.dialog!.pages[0].join('').length;
    expect(G.dialog!.chars).toBe(total);
  });

  it('B turns a plain page, firing the same beep sfx as A', () => {
    openDialog([['Page one'], ['Page two']], () => {});
    typeOutWith('a');
    tap('b');
    expect(G.dialog!.page).toBe(1);
    expect(G.dialog!.chars).toBe(0);
    expect(Audio2.sfx).toHaveBeenCalledWith('beep');
    expect(G.dialog).not.toBeNull(); // still open, second page pending
  });

  it('B on the FINAL plain page closes the box and runs after', () => {
    let closed = false;
    openDialog([['Only page']], () => (closed = true));
    typeOutWith('a');
    tap('b');
    expect(closed).toBe(true);
    expect(G.dialog).toBeNull();
    expect(G.state).toBe('world');
  });

  it('B on a choice last page still answers NO — the cancel exception is untouched', () => {
    let answer: boolean | null = null;
    openChoice([['Rest?']], (yes) => (answer = yes));
    typeOutWith('a');
    tap('right'); // move cursor onto YES, to prove B still means NO regardless
    tap('b');
    expect(answer).toBe(false);
    expect(G.dialog).toBeNull();
  });

  it('every existing A behaviour is unchanged: A still types, pages, and closes+after', () => {
    let closed = false;
    openDialog([['Hi'], ['Bye']], () => (closed = true));
    typeOutWith('a');
    tap('a');
    expect(G.dialog!.page).toBe(1);
    typeOutWith('a');
    tap('a');
    expect(closed).toBe(true);
    expect(G.dialog).toBeNull();
  });

  it('BDD: a three-page sign closes identically under three B presses as under three A presses', () => {
    let closedA = false;
    openDialog([['Line one'], ['Line two'], ['Line three']], () => (closedA = true));
    typeOutWith('a'); tap('a');
    typeOutWith('a'); tap('a');
    typeOutWith('a'); tap('a');
    expect(closedA).toBe(true);
    expect(G.dialog).toBeNull();

    let closedB = false;
    openDialog([['Line one'], ['Line two'], ['Line three']], () => (closedB = true));
    typeOutWith('b'); tap('b');
    typeOutWith('b'); tap('b');
    typeOutWith('b'); tap('b');
    expect(closedB).toBe(true);
    expect(G.dialog).toBeNull();
  });
});
