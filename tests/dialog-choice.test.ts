// { choice } picker (2026-08-15): the dialog engine's YES/NO row. Input is
// the menu.test.ts mock idiom; renderer/audio stubbed (canvas-free).
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
import { openChoice, openDialog, dialogUpdate, drawDialogBox, choiceArmed } from '../src/systems/dialog';
import { text } from '../src/engine/renderer';
import { BG_PAL } from '../src/data/palettes';

function frame(): void { dialogUpdate(); keys.pressed.clear(); }
function tap(k: string): void { keys.pressed.add(k); frame(); }
/** Hold A to fast-type the current page to completion. */
function typeOut(): void {
  keys.down.add('a');
  let guard = 0;
  while (G.dialog && !choiceArmed() && G.dialog.chars < G.dialog.pages[G.dialog.page].join('').length && guard++ < 200) frame();
  keys.down.delete('a');
}

beforeEach(() => {
  keys.down.clear();
  keys.pressed.clear();
  G.dialog = null;
  G.state = 'world';
});

describe('openChoice + dialogUpdate', () => {
  it('the picker only arms once the LAST page has fully typed out', () => {
    openChoice([['Page one'], ['Rest?']], () => {});
    expect(choiceArmed()).toBe(false);
    typeOut();
    expect(choiceArmed()).toBe(false); // page 0 done, still not the last page
    tap('a'); // advance to page 1
    expect(choiceArmed()).toBe(false); // typing
    typeOut();
    expect(choiceArmed()).toBe(true);
  });

  it('defaults to YES; A confirms it, closes the box, answers true', () => {
    let answer: boolean | null = null;
    openChoice([['Rest?']], (yes) => (answer = yes));
    typeOut();
    tap('a');
    expect(answer).toBe(true);
    expect(G.dialog).toBeNull();
    expect(G.state).toBe('world');
  });

  it('LEFT/RIGHT toggles to NO; A then answers false', () => {
    let answer: boolean | null = null;
    openChoice([['Rest?']], (yes) => (answer = yes));
    typeOut();
    tap('right');
    expect(G.dialog!.choice!.sel).toBe(1);
    tap('right'); // toggles back
    expect(G.dialog!.choice!.sel).toBe(0);
    tap('down');
    tap('a');
    expect(answer).toBe(false);
  });

  it('B is always NO, regardless of the cursor', () => {
    let answer: boolean | null = null;
    openChoice([['Rest?']], (yes) => (answer = yes));
    typeOut();
    tap('b');
    expect(answer).toBe(false);
    expect(G.dialog).toBeNull();
  });

  it('A mashed during typing does NOT answer — the arm gate holds', () => {
    let answer: boolean | null = null;
    openChoice([['A fairly long', 'question here?']], (yes) => (answer = yes));
    for (let i = 0; i < 3; i++) tap('a'); // each A: +3 chars only, no answer
    expect(answer).toBeNull();
    expect(G.dialog).not.toBeNull();
  });

  it('plain openDialog is untouched: no picker, A pages through and closes via after', () => {
    let closed = false;
    openDialog([['Hi'], ['Bye']], () => (closed = true));
    expect(choiceArmed()).toBe(false);
    typeOut(); tap('a');
    typeOut(); tap('a');
    expect(closed).toBe(true);
    expect(G.dialog).toBeNull();
  });
});

describe('drawDialogBox picker', () => {
  it('draws >YES  NO once armed, and the continue arrow never', () => {
    openChoice([['Rest?']], () => {});
    typeOut();
    vi.mocked(text).mockClear();
    G.frame = 16; // arrow phase would be visible on a plain dialog
    drawDialogBox(BG_PAL.green);
    const calls = vi.mocked(text).mock.calls.map((c) => c[0]);
    expect(calls).toContain('>YES');
    expect(calls).toContain(' NO');
    expect(calls).not.toContain('v');
  });

  it('cursor follows the selection', () => {
    openChoice([['Rest?']], () => {});
    typeOut();
    tap('right');
    vi.mocked(text).mockClear();
    drawDialogBox(BG_PAL.green);
    const calls = vi.mocked(text).mock.calls.map((c) => c[0]);
    expect(calls).toContain(' YES');
    expect(calls).toContain('>NO');
  });
});
