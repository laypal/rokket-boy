// ui/listScreen.ts (HRD.14): the shared vertical-list cursor + modal screen
// chrome extracted from shop/locker/jobsScreen/menu/battle. The wrap-vs-clamp
// ruling (2026-08-14, decision journal): WRAP everywhere — 9 of 10 shipped
// sites already wrapped; the STATUS submenu's clamp was an accident (its own
// comment claimed to copy the pack idiom, which wraps). Clamp mode stays in
// the API because the ruling is per-screen policy, not a dead branch: both
// modes are pinned here. Mock harness follows tests/shop.test.ts's idiom.
import { describe, it, expect, beforeEach } from 'vitest';
import { vi } from 'vitest';

const keys = { pressed: new Set<string>() };

vi.mock('../src/engine/renderer', () => ({
  drawWindow: vi.fn(),
  text: vi.fn(),
  W: 160,
}));
vi.mock('../src/engine/audio', () => ({
  Audio2: { play: vi.fn(), sfx: vi.fn() },
}));
vi.mock('../src/engine/input', () => ({
  Input: {
    held: (): boolean => false,
    hit: (k: string): boolean => keys.pressed.has(k),
  },
}));

import {
  stepCursor,
  listInput,
  flash,
  tickFlash,
  clampScroll,
  drawScreenChrome,
  rightText,
  type FlashState,
} from '../src/systems/ui/listScreen';
import { Audio2 } from '../src/engine/audio';
import { drawWindow, text } from '../src/engine/renderer';
import { BG_PAL } from '../src/data/palettes';

beforeEach(() => {
  keys.pressed.clear();
  vi.mocked(Audio2.sfx).mockClear();
  vi.mocked(drawWindow).mockClear();
  vi.mocked(text).mockClear();
});

// ── stepCursor: the pure core, both modes ─────────────────────────────────
describe('stepCursor — wrap mode (the ruling default)', () => {
  it('moves down the list', () => {
    expect(stepCursor(2, 5, 1)).toBe(3);
  });
  it('moves up the list', () => {
    expect(stepCursor(2, 5, -1)).toBe(1);
  });
  it('UP at row 0 wraps to the last row', () => {
    expect(stepCursor(0, 5, -1)).toBe(4);
  });
  it('DOWN at the last row wraps to row 0', () => {
    expect(stepCursor(4, 5, 1)).toBe(0);
  });
  it('n=1: both directions land on the only row', () => {
    expect(stepCursor(0, 1, 1)).toBe(0);
    expect(stepCursor(0, 1, -1)).toBe(0);
  });
  it('n=0: returns 0 (nothing to select), no NaN/negative', () => {
    expect(stepCursor(0, 0, 1)).toBe(0);
    expect(stepCursor(0, 0, -1)).toBe(0);
  });
  it('recovers a stale out-of-range sel exactly like the old % idiom', () => {
    // old: (7 + 1) % 5 = 3 / (7 + 5 - 1) % 5 = 1 — shrunk-list carryover
    expect(stepCursor(7, 5, 1)).toBe(3);
    expect(stepCursor(7, 5, -1)).toBe(1);
  });
});

describe('stepCursor — clamp mode', () => {
  it('moves inside the range', () => {
    expect(stepCursor(2, 5, 1, false)).toBe(3);
    expect(stepCursor(2, 5, -1, false)).toBe(1);
  });
  it('UP at row 0 stays at row 0', () => {
    expect(stepCursor(0, 5, -1, false)).toBe(0);
  });
  it('DOWN at the last row stays at the last row', () => {
    expect(stepCursor(4, 5, 1, false)).toBe(4);
  });
  it('n=1 pins to 0; n=0 returns 0', () => {
    expect(stepCursor(0, 1, 1, false)).toBe(0);
    expect(stepCursor(0, 0, -1, false)).toBe(0);
  });
});

// ── listInput: Input reading + beep, behaviour-preserving ─────────────────
describe('listInput', () => {
  function tap(k: string, sel: number, n: number, wrap?: boolean): number {
    keys.pressed.add(k);
    const out = listInput(sel, n, wrap === undefined ? undefined : { wrap });
    keys.pressed.clear();
    return out;
  }

  it('up/down step the cursor and beep once', () => {
    expect(tap('down', 0, 3)).toBe(1);
    expect(Audio2.sfx).toHaveBeenCalledTimes(1);
    expect(Audio2.sfx).toHaveBeenCalledWith('beep');
    expect(tap('up', 1, 3)).toBe(0);
    expect(Audio2.sfx).toHaveBeenCalledTimes(2);
  });
  it('no key pressed: sel unchanged, no beep', () => {
    expect(listInput(2, 5)).toBe(2);
    expect(Audio2.sfx).not.toHaveBeenCalled();
  });
  it('beeps even when the move is a no-op (n=1) — pins current behaviour', () => {
    expect(tap('down', 0, 1)).toBe(0);
    expect(Audio2.sfx).toHaveBeenCalledWith('beep');
  });
  it('clamp mode beeps at the edge too (STATUS behaviour, pre-ruling parity)', () => {
    expect(tap('up', 0, 5, false)).toBe(0);
    expect(Audio2.sfx).toHaveBeenCalledWith('beep');
  });
  it('defaults to wrap (the ruling)', () => {
    expect(tap('up', 0, 5)).toBe(4);
  });
});

// ── flash / tickFlash: the msg/msgT footer idiom ──────────────────────────
describe('flash + tickFlash', () => {
  it('flash sets the message for 90 frames and plays cancel by default', () => {
    const s: FlashState = { msg: null, msgT: 0 };
    flash(s, 'NOT ENOUGH COINS!');
    expect(s).toEqual({ msg: 'NOT ENOUGH COINS!', msgT: 90 });
    expect(Audio2.sfx).toHaveBeenCalledWith('cancel');
  });
  it('flash with ok=true plays item', () => {
    const s: FlashState = { msg: null, msgT: 0 };
    flash(s, 'BOUGHT SODA!', true);
    expect(Audio2.sfx).toHaveBeenCalledWith('item');
  });
  it('tickFlash counts down and stops at 0', () => {
    const s: FlashState = { msg: 'X', msgT: 2 };
    tickFlash(s);
    expect(s.msgT).toBe(1);
    tickFlash(s);
    tickFlash(s);
    expect(s.msgT).toBe(0);
  });
});

// ── clampScroll: the shop/locker scroll window ────────────────────────────
describe('clampScroll', () => {
  it('clamps a stale sel into range after the list shrinks', () => {
    const s = { sel: 6, top: 3 };
    clampScroll(s, 5, 4);
    expect(s.sel).toBe(4);
  });
  it('slides top down so sel stays visible', () => {
    const s = { sel: 5, top: 0 };
    clampScroll(s, 8, 4);
    expect(s.top).toBe(2); // sel - vis + 1
  });
  it('slides top up when sel moves above the window', () => {
    const s = { sel: 1, top: 3 };
    clampScroll(s, 8, 4);
    expect(s.top).toBe(1);
  });
  it('resets top to 0 when everything fits', () => {
    const s = { sel: 2, top: 1 };
    clampScroll(s, 3, 4);
    expect(s.top).toBe(0);
  });
  it('n=0: sel pins to 0 (locker empty-box case)', () => {
    const s = { sel: 3, top: 2 };
    clampScroll(s, 0, 5);
    expect(s.sel).toBe(0);
    expect(s.top).toBe(0);
  });
});

// ── drawScreenChrome: the byte-identical modal trio ───────────────────────
describe('drawScreenChrome', () => {
  const pal = BG_PAL.green;

  it('draws header, body and footer windows at the shared geometry', () => {
    drawScreenChrome(pal, 'JOB BOARD', '$120', 'A:OK  B:BACK');
    expect(drawWindow).toHaveBeenCalledWith(0, 0, 160, 22, pal);
    expect(drawWindow).toHaveBeenCalledWith(0, 26, 160, 92, pal);
    expect(drawWindow).toHaveBeenCalledWith(0, 122, 160, 22, pal);
  });
  it('draws the title at (6,7) and the footer line at (6,129)', () => {
    drawScreenChrome(pal, 'MON LOCKER', null, 'A:MOVE <>:TAB B:OUT');
    expect(text).toHaveBeenCalledWith('MON LOCKER', 6, 7, pal[0]);
    expect(text).toHaveBeenCalledWith('A:MOVE <>:TAB B:OUT', 6, 129, pal[0]);
  });
  it('right-aligns the header extra at the shop/jobs x (W - len*8 - 8)', () => {
    drawScreenChrome(pal, 'SHOP', '$45', 'F');
    expect(text).toHaveBeenCalledWith('$45', 160 - 3 * 8 - 8, 7, pal[0]);
  });
  it('skips the right text when null (locker draws its own tag)', () => {
    drawScreenChrome(pal, 'MON LOCKER', null, 'F');
    const calls = vi.mocked(text).mock.calls.map((c) => c[0]);
    expect(calls).toEqual(['MON LOCKER', 'F']);
  });
});

describe('rightText', () => {
  it('right-aligns against the shared 8px margin', () => {
    rightText('$200', 40, '#000');
    expect(text).toHaveBeenCalledWith('$200', 160 - 4 * 8 - 8, 40, '#000');
  });
});
