// PICKPOCKET table screen (SIDE.2) — the DEALER's card game at the GAMEZ
// CORNER, over the pure rule engine in systems/cardFlip.ts. Opened by a
// `{ cardFlip: true }` script step; suspends the script until the player
// leaves (the jobsScreen idiom: module state, open/leave, update, draw).
//
// Contract: .paul/plan/side-2346/02-side2-pickpocket.md (frozen). One
// deviation from the literal doc, flagged rather than silently applied —
// the doc's face-draw calls read `fill(x, y, w, h, pal[1])`, but the real
// renderer's `fill()` is the whole-screen wipe (`fill(color): void`); the
// only 5-arg rect primitive is `rect(x, y, w, h, color)`. Card faces below
// use `rect` for both the border and the inset interior fill (2px inset,
// the same unit the doc's own selection-ring uses for its -2/+4 outset),
// which composes into a THICKER (4px total) pal[0] ring on the selected
// card rather than an invisible one — see the worker report for the raw
// signature mismatch.
import { G } from '../state';
import { quest } from './quest';
import { mulberry32 } from '../engine/rng';
import { STAKE, GRID_W, GRID_H, newHand, flip, bag, payout, type Hand } from './cardFlip';
import { text, rect } from '../engine/renderer';
import { Input } from '../engine/input';
import { Audio2 } from '../engine/audio';
import type { Palette } from '../data/palettes';
import { listInput, flash, tickFlash, drawScreenChrome } from './ui/listScreen';

// Grid geometry — pinned per the frozen contract, linted in tests/cardFlip.test.ts.
export const CARD_W = 28;
export const CARD_H = 20;
export const CARD_X = [18, 50, 82, 114];
export const CARD_Y = [34, 58, 82];

interface FlipState {
  view: 'deal' | 'table' | 'result';
  sel: number; // deal: 0..1 · table: 0..11 (row-major, 4 wide)
  hand: Hand | null;
  seed: number;
  result: string; // footer line for the 'result' view
  msg: string | null;
  msgT: number; // FlashState
  done: () => void;
}
let S: FlipState | null = null;

export function openCardFlip(done: () => void, seed?: number): void {
  Audio2.sfx('confirm');
  const s0 = seed ?? ((G.frame * 7919 + (quest.vars.flipHands ?? 0) * 104729) >>> 0);
  S = { view: 'deal', sel: 0, hand: null, seed: s0, result: '', msg: null, msgT: 0, done };
  G.state = 'cardflip';
}

function leave(): void {
  const s = S!;
  Audio2.sfx('cancel');
  const done = s.done;
  S = null;
  G.state = 'world';
  done();
}

export function cardFlipUpdate(): void {
  const s = S!;
  tickFlash(s);

  if (s.view === 'deal') {
    s.sel = listInput(s.sel, 2);
    if (Input.hit('a')) {
      if (s.sel === 0) {
        if (quest.coins < STAKE) {
          flash(s, 'NEED 30 COINS.');
        } else {
          quest.coins -= STAKE;
          quest.vars.flipHands = (quest.vars.flipHands ?? 0) + 1;
          s.hand = newHand(mulberry32((s.seed + quest.vars.flipHands) >>> 0));
          s.sel = 0;
          s.view = 'table';
          Audio2.sfx('confirm');
        }
      } else {
        leave();
      }
      return;
    }
    if (Input.hit('b') || Input.hit('start')) leave();
    return;
  }

  if (s.view === 'table') {
    const hand = s.hand!;
    const row = Math.floor(s.sel / GRID_W);
    const col = s.sel % GRID_W;
    if (Input.hit('left')) {
      s.sel = row * GRID_W + ((col - 1 + GRID_W) % GRID_W);
      Audio2.sfx('beep');
    }
    if (Input.hit('right')) {
      s.sel = row * GRID_W + ((col + 1) % GRID_W);
      Audio2.sfx('beep');
    }
    if (Input.hit('up')) {
      s.sel = ((row - 1 + GRID_H) % GRID_H) * GRID_W + col;
      Audio2.sfx('beep');
    }
    if (Input.hit('down')) {
      s.sel = ((row + 1) % GRID_H) * GRID_W + col;
      Audio2.sfx('beep');
    }
    if (Input.hit('a')) {
      const wasLoot = hand.cards[s.sel].kind === 'loot';
      if (flip(hand, s.sel)) {
        Audio2.sfx(wasLoot ? 'coin' : 'cancel');
        if (hand.status !== 'live') {
          if (hand.status === 'bagged') {
            const p = payout(hand.haul);
            quest.coins += p;
            quest.vars.flipWon = (quest.vars.flipWon ?? 0) + p;
            s.result = 'CLEAN SWEEP! +' + p;
            Audio2.sfx('item');
          } else {
            s.result = 'BUSTED! COPS 3/3';
          }
          s.view = 'result';
        }
      }
      return;
    }
    if (Input.hit('b')) {
      const p = bag(hand);
      if (p > 0) {
        quest.coins += p;
        quest.vars.flipWon = (quest.vars.flipWon ?? 0) + p;
        s.result = 'BAGGED +' + p + '!';
        Audio2.sfx('item');
      } else {
        hand.status = 'busted';
        s.result = 'FOLD. STAKE GONE.';
        Audio2.sfx('cancel');
      }
      s.view = 'result';
    }
    // START is ignored on the table — no dumping mid-hand (SIDE.1-FB rule).
    return;
  }

  // 'result'
  if (Input.hit('a') || Input.hit('b') || Input.hit('start')) {
    s.view = 'deal';
    s.sel = 0;
  }
}

export function cardFlipDraw(pal: Palette): void {
  const s = S!;
  const footer =
    s.msgT > 0 && s.msg
      ? s.msg
      : s.view === 'result'
        ? s.result
        : s.view === 'table'
          ? 'HAUL ' + String(s.hand!.haul).padStart(2, '0') + '  COPS ' + s.hand!.cops + '/3'
          : 'A:DEAL  B:LEAVE';
  drawScreenChrome(pal, 'PICKPOCKET', '$' + quest.coins, footer);

  if (s.view === 'deal') {
    text('DEAL  ' + STAKE + ' COINS', 18, 34, pal[0]);
    text('LEAVE', 18, 52, pal[0]);
    text('>', 8, s.sel === 0 ? 34 : 52, pal[0]);
    text('9 LOOT. 3 COPS.', 18, 76, pal[2]);
    text('3RD COP = BUST.', 18, 86, pal[2]);
    text('B BAGS THE HAUL.', 18, 96, pal[2]);
    return;
  }

  const hand = s.hand!;
  for (let i = 0; i < hand.cards.length; i++) {
    const row = Math.floor(i / GRID_W);
    const col = i % GRID_W;
    const x = CARD_X[col];
    const y = CARD_Y[row];
    const faceUp = s.view === 'result' || hand.flipped[i];
    const selected = s.view === 'table' && i === s.sel;
    if (selected) rect(x - 2, y - 2, CARD_W + 4, CARD_H + 4, pal[0]);
    if (!faceUp) {
      rect(x, y, CARD_W, CARD_H, pal[0]);
      rect(x + 2, y + 2, CARD_W - 4, CARD_H - 4, pal[1]);
      continue;
    }
    const card = hand.cards[i];
    if (card.kind === 'loot') {
      rect(x, y, CARD_W, CARD_H, pal[0]);
      rect(x + 2, y + 2, CARD_W - 4, CARD_H - 4, pal[3]);
      const label = String(card.value);
      text(label, x + Math.floor((CARD_W - 8 * label.length) / 2), y + 6, pal[0]);
    } else {
      rect(x, y, CARD_W, CARD_H, pal[0]);
      text('COP', x + 2, y + 6, pal[3]);
    }
  }
}
