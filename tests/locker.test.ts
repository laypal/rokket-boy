// MON LOCKER pure move logic (plan §4.3): party ↔ box transfers with the
// party-cap (4) and never-empty-party invariants. UI lives in systems/locker.ts
// but these pure helpers carry the rules and are frozen here; a real-draw BDD
// test for the MNU.8 row geometry lives at the bottom of this file too.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { MonInstance } from '../src/types';

// MNU.8's BDD row-draw test drives the real lockerDraw, which pulls in
// listInput/flash/tickFlash/clampScroll/drawScreenChrome (ui/listScreen.ts) —
// those aren't mocked, but THEY import engine/renderer, so it has to be
// stubbed here too (vitest's node environment can't touch canvas/DOM). It's
// the spy the test reads calls off of. Input/Audio2 need no mock: locker.ts
// imports them at module load, but neither touches `window` at import time,
// and Audio2.sfx()'s init() no-ops (try/catch) without a real AudioContext.
vi.mock('../src/engine/renderer', () => ({
  drawWindow: vi.fn(),
  text: vi.fn(),
  W: 160,
}));

import {
  deposit,
  withdraw,
  PARTY_CAP,
  LOCKER_TITLE,
  HEADER_TITLE_X,
  GLYPH_W,
  tagX,
  ROW_NAME_X,
  ROW_LV_X,
  ROW_RIGHT_X,
  openLocker,
  lockerDraw,
} from '../src/systems/locker';
import { text } from '../src/engine/renderer';
import { G } from '../src/state';
import { makeMon, LEVEL_CAP } from '../src/systems/mon';
import { SPECIES } from '../src/data/mons';
import { BG_PAL } from '../src/data/palettes';

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

// MNU.8: rows clipped the right edge — hp column dropped, see locker.ts row geometry.
describe('MON LOCKER row geometry (MNU.8)', () => {
  const MAX_NAME_LEN = 10; // MON_NAME_CAP (menu.ts) — the global mon/move name budget, docs 02

  it('a max-length name clears the level column by a full glyph, not just any positive gap', () => {
    const nameEnd = ROW_NAME_X + MAX_NAME_LEN * GLYPH_W;
    expect(nameEnd).toBeLessThan(ROW_LV_X);
    // one full 8px glyph of breathing room, same as menu.ts's PARTY_LEVEL_X
    // (MNU.7) — not merely > 0px, which is how the old hp column shipped.
    expect(ROW_LV_X - nameEnd).toBeGreaterThanOrEqual(GLYPH_W);
  });

  it('the level column, at its longest (L + LEVEL_CAP), stays inside the window interior', () => {
    const levelEnd = ROW_LV_X + ('L' + LEVEL_CAP).length * GLYPH_W;
    expect(levelEnd).toBeLessThanOrEqual(ROW_RIGHT_X);
  });
});

describe('MON LOCKER row draw (MNU.8 BDD): only name and level render', () => {
  beforeEach(() => {
    // Given a party mon with a max-length (MON_NAME_CAP) name at LEVEL_CAP —
    // the row that used to read 'L5030/33'-style garbage off the right edge.
    G.party = [makeMon(SPECIES.koffink, LEVEL_CAP)];
    G.party[0].nick = 'X'.repeat(10);
    G.box = [];
  });

  afterEach(() => {
    G.state = 'world';
  });

  it('draws exactly the name and the level for the row — nothing right of the level column', () => {
    openLocker(() => {});
    vi.mocked(text).mockClear();
    lockerDraw(BG_PAL.green);
    const rowY = 34; // first visible row (locker.ts: y = 34 + r*16, r=0)
    const rowCalls = vi.mocked(text).mock.calls.filter((c) => c[2] === rowY);
    // sel defaults to 0, so row 0 is selected: cursor '>' + name + level.
    expect(rowCalls).toHaveLength(3);
    const nameCall = rowCalls.find((c) => c[0] === G.party[0].nick)!;
    const levelCall = rowCalls.find((c) => c[0] === 'L' + LEVEL_CAP)!;
    expect(nameCall).toBeDefined();
    expect(levelCall).toBeDefined();
    expect(nameCall[1]).toBe(ROW_NAME_X);
    expect(levelCall[1]).toBe(ROW_LV_X);
    // no hp text call exists at all, and nothing drawn on the row overflows
    // the window's interior right edge.
    expect(rowCalls.some((c) => (c[0] as string).includes('/'))).toBe(false);
    for (const c of rowCalls) {
      const end = (c[1] as number) + (c[0] as string).length * GLYPH_W;
      expect(end).toBeLessThanOrEqual(ROW_RIGHT_X);
    }
  });
});
