// F44 WM.1 — per-map seen bitmaps: the lantern ring marks 37 tiles, edges
// clip, base64 round-trips, bad blobs read as nothing seen.
import { describe, it, expect } from 'vitest';
import { newSeen, markSeen, isSeen, seenCount, seenToB64, seenFromB64 } from '../src/systems/seen';

describe('seen bitmaps (F44 WM.1)', () => {
  it('a fresh bitmap has nothing seen and ceil(w*h/8) bytes', () => {
    const s = newSeen(20, 10);
    expect(s.length).toBe(25);
    expect(seenCount(s)).toBe(0);
    expect(isSeen(s, 20, 0, 0)).toBe(false);
  });

  it('markSeen paints the CH5 lantern ring — 37 tiles mid-map', () => {
    const s = newSeen(20, 12);
    markSeen(s, 20, 12, 10, 6);
    expect(seenCount(s)).toBe(37);
    expect(isSeen(s, 20, 10, 6)).toBe(true);
    expect(isSeen(s, 20, 13, 6)).toBe(true); // dx 3 on the centre row
    expect(isSeen(s, 20, 14, 6)).toBe(false);
    expect(isSeen(s, 20, 12, 8)).toBe(true); // dx 2, dy 2 → 8 ≤ 12
    expect(isSeen(s, 20, 13, 8)).toBe(false); // 9+4 = 13 > 12
  });

  it('a ring at the corner clips to the map and never wraps a row', () => {
    const s = newSeen(20, 12);
    markSeen(s, 20, 12, 0, 0);
    expect(seenCount(s)).toBe(13); // the quarter ring: rows of 4,4,3,2 (x 0..3 / 0..3 / 0..2 / 0..1)
    expect(isSeen(s, 20, 19, 0)).toBe(false);
    expect(isSeen(s, 20, 19, 1)).toBe(false);
  });

  it('marking twice is idempotent', () => {
    const s = newSeen(20, 12);
    markSeen(s, 20, 12, 10, 6);
    markSeen(s, 20, 12, 10, 6);
    expect(seenCount(s)).toBe(37);
  });

  it('base64 round-trips and a wrong-length or garbage blob reads as fresh', () => {
    const s = newSeen(20, 12);
    markSeen(s, 20, 12, 3, 3);
    const b = seenToB64(s);
    expect(typeof b).toBe('string');
    expect(seenFromB64(b, 20, 12)).toEqual(s);
    expect(seenCount(seenFromB64('', 20, 12))).toBe(0);
    expect(seenCount(seenFromB64('not base64!!', 20, 12))).toBe(0);
    expect(seenCount(seenFromB64(seenToB64(newSeen(5, 5)), 20, 12))).toBe(0); // wrong length → fresh
  });
});
