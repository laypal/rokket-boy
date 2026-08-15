// LIST SCREEN — HRD.14: the one implementation of the vertical-list cursor
// and the full-screen modal chrome that shop.ts, locker.ts and jobsScreen.ts
// each carried a byte-identical copy of (and menu.ts/battle.ts re-typed the
// cursor half of). Wrap-vs-clamp ruling (2026-08-14, decision journal):
// list navigation WRAPS everywhere — 9 of 10 shipped sites already did, and
// the one clamp (STATUS submenu) cited an idiom that actually wraps. Clamp
// mode remains for callers that opt out; none ship today.
import { drawWindow, text, W } from '../../engine/renderer';
import { Input } from '../../engine/input';
import { Audio2 } from '../../engine/audio';
import type { Palette } from '../../data/palettes';

/** Pure cursor step. n<=0 pins to 0; wrap cycles past the edges, clamp
 *  stops on them. Tolerates a stale out-of-range sel (shrunk lists) the
 *  same way the old `% n` idiom did. */
export function stepCursor(sel: number, n: number, dir: -1 | 1, wrap = true): number {
  if (n <= 0) return 0;
  if (wrap) return (sel + n + dir) % n;
  return Math.max(0, Math.min(n - 1, sel + dir));
}

/** Shared up/down handling: steps the cursor and beeps on any hit — even a
 *  no-op move (n=1, clamp edge) beeps, preserving every site's shipped
 *  behaviour. A/B/confirm handling stays with the caller. */
export function listInput(sel: number, n: number, opts?: { wrap?: boolean }): number {
  const wrap = opts?.wrap ?? true;
  let out = sel;
  if (Input.hit('up')) {
    out = stepCursor(out, n, -1, wrap);
    Audio2.sfx('beep');
  }
  if (Input.hit('down')) {
    out = stepCursor(out, n, 1, wrap);
    Audio2.sfx('beep');
  }
  return out;
}

/** The transient footer-message idiom: 90 frames, 'item' on success,
 *  'cancel' on refusal. */
export interface FlashState {
  msg: string | null;
  msgT: number;
}
export function flash(s: FlashState, msg: string, ok = false): void {
  s.msg = msg;
  s.msgT = 90;
  Audio2.sfx(ok ? 'item' : 'cancel');
}
export function tickFlash(s: FlashState): void {
  if (s.msgT > 0) s.msgT--;
}

/** shop/locker scroll window: clamps sel into [0, n-1] and slides the
 *  window top so the selection stays inside `vis` rows. */
export function clampScroll(s: { sel: number; top: number }, n: number, vis: number): void {
  s.sel = Math.max(0, Math.min(s.sel, n - 1));
  if (s.sel < s.top) s.top = s.sel;
  if (s.sel >= s.top + vis) s.top = s.sel - vis + 1;
  if (n <= vis) s.top = 0;
}

/** Right-aligned text against the modal screens' shared 8px margin. */
export function rightText(s: string, y: number, col: string): void {
  text(s, W - s.length * 8 - 8, y, col);
}

/** The byte-identical modal trio: header (title + optional right-aligned
 *  extra), body, footer with its one-line message. Rows render on top of
 *  the body window, per screen — their column layouts genuinely differ. */
export function drawScreenChrome(pal: Palette, title: string, right: string | null, footer: string): void {
  drawWindow(0, 0, W, 22, pal);
  text(title, 6, 7, pal[0]);
  if (right !== null) rightText(right, 7, pal[0]);
  drawWindow(0, 26, W, 92, pal);
  drawWindow(0, 122, W, 22, pal);
  text(footer, 6, 129, pal[0]);
}
