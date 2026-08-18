// MON LOCKER pure move logic (plan §4.3): party ↔ box transfers with the
// party-cap (4) and never-empty-party invariants. UI lives in systems/locker.ts
// but these pure helpers carry the rules and are frozen here.
import { describe, it, expect } from 'vitest';
import type { MonInstance } from '../src/types';
import {
  deposit,
  withdraw,
  PARTY_CAP,
  LOCKER_TITLE,
  HEADER_TITLE_X,
  GLYPH_W,
  tagX,
} from '../src/systems/locker';

function mon(species: string, lv: number): MonInstance {
  return { species, lv, hp: 1, xp: 0, moves: [] };
}

describe('MON LOCKER transfers', () => {
  it('deposit moves a party mon to the box', () => {
    const party = [mon('koffink', 5), mon('voltorbb', 4)];
    const box: MonInstance[] = [];
    const ok = deposit(party, box, 0);
    expect(ok).toBe(true);
    expect(party.map((m) => m.species)).toEqual(['voltorbb']);
    expect(box.map((m) => m.species)).toEqual(['koffink']);
  });

  it('deposit refuses to empty the party (must keep ≥1)', () => {
    const party = [mon('koffink', 5)];
    const box: MonInstance[] = [];
    const ok = deposit(party, box, 0);
    expect(ok).toBe(false);
    expect(party.length).toBe(1);
    expect(box.length).toBe(0);
  });

  it('deposit ignores an out-of-range index', () => {
    const party = [mon('koffink', 5), mon('voltorbb', 4)];
    const box: MonInstance[] = [];
    expect(deposit(party, box, 5)).toBe(false);
    expect(deposit(party, box, -1)).toBe(false);
    expect(party.length).toBe(2);
  });

  it('withdraw moves a box mon to the party', () => {
    const party = [mon('koffink', 5)];
    const box = [mon('voltorbb', 4)];
    const ok = withdraw(party, box, 0);
    expect(ok).toBe(true);
    expect(party.map((m) => m.species)).toEqual(['koffink', 'voltorbb']);
    expect(box.length).toBe(0);
  });

  it('withdraw refuses when the party is at cap', () => {
    const party = [mon('a', 5), mon('b', 5), mon('c', 5), mon('d', 5)];
    expect(party.length).toBe(PARTY_CAP);
    const box = [mon('e', 5)];
    const ok = withdraw(party, box, 0);
    expect(ok).toBe(false);
    expect(party.length).toBe(PARTY_CAP);
    expect(box.length).toBe(1);
  });

  it('withdraw ignores an out-of-range index', () => {
    const party = [mon('koffink', 5)];
    const box = [mon('voltorbb', 4)];
    expect(withdraw(party, box, 3)).toBe(false);
    expect(withdraw(party, box, -1)).toBe(false);
    expect(box.length).toBe(1);
  });
});

// MNU.6: the header title (drawn at HEADER_TITLE_X by drawScreenChrome) and
// the right-aligned tag (positioned by tagX) must never overlap, for every
// tag the header can actually show. Derived from the real draw geometry
// (locker.ts's exported constants/helper) rather than hard-coded pixel
// numbers, so this lint tracks the draw instead of drifting from it.
describe('MON LOCKER header geometry (MNU.6)', () => {
  const titleEnd = HEADER_TITLE_X + LOCKER_TITLE.length * GLYPH_W;

  it('title never overlaps the PARTY tag, for every party size 0..PARTY_CAP', () => {
    for (let n = 0; n <= PARTY_CAP; n++) {
      const tag = 'PARTY ' + n + '/' + PARTY_CAP;
      expect(titleEnd).toBeLessThanOrEqual(tagX(tag));
    }
  });

  it('title never overlaps the BOX tag, up to a 2-digit box count', () => {
    for (const n of [0, 1, 9, 10, 42, 99]) {
      const tag = 'BOX ' + n;
      expect(titleEnd).toBeLessThanOrEqual(tagX(tag));
    }
  });
});
