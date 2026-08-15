// Dialogue engine: typewriter, pages, callback on close. Plus the YES/NO
// picker ({ choice } step, 2026-08-15): the last page ends in a two-option
// row instead of the continue arrow, so a repeat visit to a service NPC is
// a decision rather than an A-mash accident.
import { G } from '../state';
import { clamp, drawWindow, text, W } from '../engine/renderer';
import { Input } from '../engine/input';
import { Audio2 } from '../engine/audio';
import { DUR, EASE, lerp, msToFrames, tween } from '../engine/easing';
import type { Palette } from '../data/palettes';

export function openDialog(pages: string[][], after?: () => void): void {
  G.dialog = { pages, page: 0, chars: 0, after: after || null, openFrame: G.frame };
  G.state = 'dialog';
}

/** Same box, but the last page shows `YES  NO`: LEFT/RIGHT (or UP/DOWN)
 *  moves the cursor, A confirms, B is always NO — the GB convention where
 *  cancel means decline. Defaults to YES because the player walked up and
 *  pressed A on purpose; B is the one-tap escape. */
export function openChoice(pages: string[][], onAnswer: (yes: boolean) => void): void {
  G.dialog = { pages, page: 0, chars: 0, after: null, openFrame: G.frame, choice: { sel: 0, onAnswer } };
  G.state = 'dialog';
}

/** The picker only arms once the last page has fully typed out. */
export function choiceArmed(): boolean {
  const d = G.dialog;
  if (!d?.choice) return false;
  const pg = d.pages[d.page];
  return d.page === d.pages.length - 1 && d.chars >= pg.join('').length;
}

export function dialogUpdate(): void {
  const d = G.dialog!;
  const pg = d.pages[d.page];
  const total = pg.join('').length;
  if (d.chars < total) {
    d.chars += Input.held('a') || Input.held('b') ? 3 : 1;
    if (G.frame % 4 === 0) Audio2.sfx('blip');
    if (d.chars > total) d.chars = total;
    return;
  }
  if (d.choice && d.page === d.pages.length - 1) {
    const c = d.choice;
    if (Input.hit('left') || Input.hit('right') || Input.hit('up') || Input.hit('down')) {
      c.sel = 1 - c.sel;
      Audio2.sfx('blip');
    }
    const yes = Input.hit('a') ? c.sel === 0 : Input.hit('b') ? false : null;
    if (yes === null) return;
    Audio2.sfx(yes ? 'confirm' : 'cancel');
    G.dialog = null;
    G.state = 'world';
    c.onAnswer(yes);
    return;
  }
  if (Input.hit('a')) {
    Audio2.sfx('beep');
    d.page++;
    d.chars = 0;
    if (d.page >= d.pages.length) {
      const after = d.after;
      G.dialog = null;
      G.state = 'world';
      if (after) after();
    }
  }
}

// Picker geometry: right-aligned on the box's bottom text row, where the
// continue arrow normally blinks — the two share the slot, never both.
const CHOICE_Y = 128;
const CHOICE_X = { yes: 96, no: 128 };

export function drawDialogBox(pal: Palette): void {
  const d = G.dialog;
  if (!d) return;
  // Cosmetic slide-in: box eases up from 24px below its rest position. Purely
  // visual — the typewriter (dialogUpdate) has been running since openFrame.
  const p = tween(G.frame - d.openFrame, msToFrames(DUR.dialogIn), EASE.decelerate);
  const dy = Math.round(lerp(24, 0, p));
  drawWindow(0, 96 + dy, W, 48, pal);
  const pg = d.pages[d.page];
  let remaining = d.chars;
  for (let i = 0; i < pg.length && i < 3; i++) {
    const line = pg[i];
    const n = clamp(remaining, 0, line.length);
    text(line.substring(0, n), 8, 104 + dy + i * 12, pal[0]);
    remaining -= line.length;
  }
  const total = pg.join('').length;
  if (d.chars < total) return;
  if (choiceArmed()) {
    const sel = d.choice!.sel;
    text((sel === 0 ? '>' : ' ') + 'YES', CHOICE_X.yes, CHOICE_Y + dy, pal[0]);
    text((sel === 1 ? '>' : ' ') + 'NO', CHOICE_X.no, CHOICE_Y + dy, pal[0]);
    return;
  }
  if ((G.frame >> 4) & 1) text('v', 148, 133 + dy, pal[0]);
}
