// SIDE.2 — PICKPOCKET table rules. Pure and engine-free (no `G`/`quest`/
// renderer imports), the jobs.ts idiom: a deck of 9 LOOT + 3 COP cards,
// shuffled by an injected rng (mulberry32, never Math.random). The screen
// that renders this over the DEALER's card-flip minigame lives in
// cardFlipScreen.ts.
import type { Rng } from '../engine/rng';

export const STAKE = 30; // coins per hand
export const PAYOUT_UNIT = 2; // coins per haul point
export const LOOT_VALUES = [1, 1, 2, 2, 3, 3, 5, 5, 10] as const; // 9 LOOT cards, sum 32
export const COP_COUNT = 3; // COP cards in the deck
export const COP_LIMIT = 3; // the Nth cop busts the hand
export const GRID_W = 4;
export const GRID_H = 3; // 12 = LOOT_VALUES.length + COP_COUNT (linted)

export type Card = { kind: 'loot'; value: number } | { kind: 'cop' };
export type HandStatus = 'live' | 'bagged' | 'busted';
export interface Hand {
  cards: Card[]; // length 12, shuffled
  flipped: boolean[]; // length 12
  haul: number; // sum of flipped LOOT values
  cops: number; // flipped COP count
  status: HandStatus;
}

/** Fisher–Yates over the fixed deck (LOOT_VALUES in order, then COP_COUNT
 *  cops) using ONLY rng() ∈ [0,1) — same rng, same order, same board.
 *  Standard inside-out loop: for i from n-1 down to 1, j = floor(rng()*(i+1)), swap. */
export function newHand(rng: Rng): Hand {
  const cards: Card[] = [
    ...LOOT_VALUES.map((value): Card => ({ kind: 'loot', value })),
    ...Array.from({ length: COP_COUNT }, (): Card => ({ kind: 'cop' })),
  ];
  for (let i = cards.length - 1; i >= 1; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = cards[i];
    cards[i] = cards[j];
    cards[j] = t;
  }
  return { cards, flipped: cards.map(() => false), haul: 0, cops: 0, status: 'live' };
}

/** Reveal card i. Ignored (returns false, hand unchanged) if i is out of
 *  range, already flipped, or the hand isn't live. LOOT: haul += value;
 *  if every LOOT is now flipped → status 'bagged' (auto-bag). COP: cops +=
 *  1; cops === COP_LIMIT → status 'busted', haul = 0. Mutates in place,
 *  returns true when a flip happened. */
export function flip(hand: Hand, i: number): boolean {
  if (i < 0 || i >= hand.cards.length) return false;
  if (hand.flipped[i]) return false;
  if (hand.status !== 'live') return false;
  hand.flipped[i] = true;
  const card = hand.cards[i];
  if (card.kind === 'loot') {
    hand.haul += card.value;
    if (lootLeft(hand) === 0) hand.status = 'bagged';
  } else {
    hand.cops += 1;
    if (hand.cops === COP_LIMIT) {
      hand.status = 'busted';
      hand.haul = 0;
    }
  }
  return true;
}

/** Bank the haul: live && haul > 0 → status 'bagged', returns the payout
 *  (payout(haul)); otherwise returns 0 and leaves the hand unchanged. */
export function bag(hand: Hand): number {
  if (hand.status !== 'live' || hand.haul <= 0) return 0;
  hand.status = 'bagged';
  return payout(hand.haul);
}

export function payout(haul: number): number {
  return haul * PAYOUT_UNIT;
}

export function lootLeft(hand: Hand): number {
  let n = 0;
  for (let i = 0; i < hand.cards.length; i++) {
    if (hand.cards[i].kind === 'loot' && !hand.flipped[i]) n++;
  }
  return n;
}
