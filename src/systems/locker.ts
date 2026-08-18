// MON LOCKER — the HQ PC terminal (plan §4.3). Moves mons between G.party and
// G.box. Opened by a `{ locker: true }` script step at an HQ computer tile; the
// script suspends until the player backs out (B), then resumes with no
// follow-up. The transfer rules (party cap, never-empty party) are the pure
// deposit/withdraw helpers below, frozen in tests/locker.test.ts.
import { G } from '../state';
import type { MonInstance } from '../types';
import { SPECIES } from '../data/mons';
import { maxHp } from './mon';
import { text, W } from '../engine/renderer';
import { Input } from '../engine/input';
import { Audio2 } from '../engine/audio';
import type { Palette } from '../data/palettes';
import { listInput, flash, tickFlash, clampScroll, drawScreenChrome } from './ui/listScreen';

export const PARTY_CAP = 4;

// Header geometry (MNU.6): drawScreenChrome always draws the title at x=6,
// one 8px-wide glyph per char (ui/listScreen.ts). The header tag keeps its
// own 6px right margin instead of the shared rightText's 8px (2px off — see
// the draw comment below). Both exported so the geometry lint in
// tests/locker.test.ts can pin title-end < tag-start against the real draw
// values instead of re-deriving the arithmetic independently.
export const GLYPH_W = 8;
export const HEADER_TITLE_X = 6;
export const LOCKER_TITLE = 'LOCKER';
export function tagX(tag: string): number {
  return W - tag.length * GLYPH_W - 6;
}

/** Move party[i] to the end of box. Refuses if it would empty the party or i is
 *  out of range. Mutates both arrays; returns whether the move happened. */
export function deposit(party: MonInstance[], box: MonInstance[], i: number): boolean {
  if (i < 0 || i >= party.length) return false;
  if (party.length <= 1) return false;
  box.push(party.splice(i, 1)[0]);
  return true;
}

/** Move box[i] to the end of party. Refuses if the party is at cap or i is out
 *  of range. Mutates both arrays; returns whether the move happened. */
export function withdraw(party: MonInstance[], box: MonInstance[], i: number): boolean {
  if (i < 0 || i >= box.length) return false;
  if (party.length >= PARTY_CAP) return false;
  party.push(box.splice(i, 1)[0]);
  return true;
}

// ── Terminal UI ────────────────────────────────────────────────────────────
interface LockerState {
  col: 'party' | 'box';
  sel: number;
  top: number;
  msg: string | null;
  msgT: number;
  done: () => void;
}
let L: LockerState | null = null;

const VIS = 5; // visible rows in the list window

function list(l: LockerState): MonInstance[] {
  return l.col === 'party' ? G.party : G.box;
}
function monName(m: MonInstance): string {
  return m.nick ?? SPECIES[m.species].name;
}

export function openLocker(done: () => void): void {
  Audio2.sfx('confirm');
  L = { col: 'party', sel: 0, top: 0, msg: null, msgT: 0, done };
  G.state = 'locker';
}

export function lockerUpdate(): void {
  const l = L!;
  tickFlash(l);
  const items = list(l);
  l.sel = listInput(l.sel, items.length);
  clampScroll(l, items.length, VIS);
  if (Input.hit('left') || Input.hit('right')) {
    l.col = l.col === 'party' ? 'box' : 'party';
    l.sel = 0;
    l.top = 0;
    Audio2.sfx('beep');
  }
  if (Input.hit('a')) {
    if (l.col === 'party') {
      if (deposit(G.party, G.box, l.sel)) {
        Audio2.sfx('item');
        clampScroll(l, list(l).length, VIS);
      } else flash(l, 'KEEP ONE MON OUT!');
    } else {
      if (G.box.length === 0) flash(l, 'THE BOX IS EMPTY.');
      else if (withdraw(G.party, G.box, l.sel)) {
        Audio2.sfx('item');
        clampScroll(l, list(l).length, VIS);
      } else flash(l, 'PARTY IS FULL!');
    }
    return;
  }
  if (Input.hit('b') || Input.hit('start')) {
    Audio2.sfx('cancel');
    const done = l.done;
    L = null;
    G.state = 'world';
    done();
  }
}

export function lockerDraw(pal: Palette): void {
  const l = L!;
  const items = list(l);
  drawScreenChrome(pal, LOCKER_TITLE, null, l.msgT > 0 && l.msg ? l.msg : 'A:MOVE <>:TAB B:OUT');
  // header tag keeps its own 6px right margin (2px off the shared rightText)
  const tag = l.col === 'party' ? 'PARTY ' + G.party.length + '/' + PARTY_CAP : 'BOX ' + G.box.length;
  text(tag, tagX(tag), 7, pal[0]);
  if (items.length === 0) {
    text(l.col === 'party' ? 'NO MONS.' : 'BOX EMPTY.', 16, 40, pal[0]);
  }
  for (let r = 0; r < VIS; r++) {
    const idx = l.top + r;
    if (idx >= items.length) break;
    const m = items[idx];
    const y = 34 + r * 16;
    const col = m.hp > 0 ? pal[0] : pal[2];
    if (idx === l.sel) text('>', 6, y, pal[0]);
    text(monName(m), 16, y, col);
    text('L' + m.lv, 100, y, col);
    text(m.hp + '/' + maxHp(SPECIES[m.species], m.lv), 124, y, col);
  }
}
