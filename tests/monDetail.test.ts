// MNU.3 — dex-style PARTY detail screen: pure formatters (detailPage,
// pageIndex, spriteBox) and the derived geometry constants. Mock setup
// mirrors tests/rankLadder.test.ts / tests/battleFx.test.ts: monDetail.ts
// imports renderer (drawWindow/ctx/decode/text) for its one draw fn, which
// this suite never calls — only the pure formatters are exercised here.
import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/engine/renderer', () => ({
  ctx: { drawImage: vi.fn() },
  decode: vi.fn(() => ({})),
  drawWindow: vi.fn(),
  text: vi.fn(),
  W: 160,
  H: 144,
}));

import { detailPage, pageIndex, spriteBox, DEX_LINE_CAP, DETAIL_COL_CAP } from '../src/systems/monDetail';
import { makeMon, maxHp } from '../src/systems/mon';
import { S } from '../src/data/sprites';
import type { MonSpecies } from '../src/types';

// Synthetic species, same idiom as tests/mon.test.ts's makeSpecies — never
// depends on shipped data.
function makeSpecies(over: Partial<MonSpecies> = {}): MonSpecies {
  const rows = S('0123');
  return {
    id: 'testmon',
    name: 'TESTMON',
    type: ['POISON'],
    baseHp: 40,
    atk: 65,
    def: 95,
    spd: 35,
    moves: [
      { lv: 1, move: 'tackle' },
      { lv: 1, move: 'smog' },
    ],
    front: rows,
    back: rows,
    pal: ['#000', '#555', '#aaa', '#fff'],
    catchRate: 0.45,
    heightM: 0.6,
    weightKg: 12.5,
    dex: ['LEAKS GAS WHEN', 'NERVOUS. ALWAYS.'],
    ...over,
  };
}

const moveName = (id: string): string => id.toUpperCase();

describe('detailPage', () => {
  it('label falls back to the species name when the mon has no nick', () => {
    const sp = makeSpecies();
    const mon = makeMon(sp, 5);
    expect(detailPage(mon, sp, moveName, 0, 1).label).toBe('TESTMON');
  });

  it('label uses the nick when set', () => {
    const sp = makeSpecies();
    const mon = makeMon(sp, 5);
    mon.nick = 'BUDDY';
    expect(detailPage(mon, sp, moveName, 0, 1).label).toBe('BUDDY');
  });

  it('lv omits the status suffix when unset', () => {
    const sp = makeSpecies();
    const mon = makeMon(sp, 12);
    expect(detailPage(mon, sp, moveName, 0, 1).lv).toBe('LV 12');
  });

  it('lv appends the status code when set', () => {
    const sp = makeSpecies();
    const mon = makeMon(sp, 12);
    mon.status = 'PSN';
    expect(detailPage(mon, sp, moveName, 0, 1).lv).toBe('LV 12 PSN');
  });

  it('type joins sp.type with "/"', () => {
    const sp1 = makeSpecies({ type: ['POISON'] });
    expect(detailPage(makeMon(sp1, 5), sp1, moveName, 0, 1).type).toBe('POISON');
    const sp2 = makeSpecies({ type: ['POISON', 'GROUND'] });
    expect(detailPage(makeMon(sp2, 5), sp2, moveName, 0, 1).type).toBe('POISON/GROUND');
  });

  it('hp reads current hp over maxHp(sp, lv)', () => {
    const sp = makeSpecies(); // baseHp 40
    const mon = makeMon(sp, 5); // maxHp(sp,5) = floor(2*40*5/100)+5+10 = 19
    expect(maxHp(sp, 5)).toBe(19);
    mon.hp = 3;
    expect(detailPage(mon, sp, moveName, 0, 1).hp).toBe('HP 3/19');
  });

  it('ht/wt print via toFixed(1)', () => {
    const sp = makeSpecies({ heightM: 1, weightKg: 1 });
    const mon = makeMon(sp, 5);
    const page = detailPage(mon, sp, moveName, 0, 1);
    expect(page.ht).toBe('HT 1.0M');
    expect(page.wt).toBe('WT 1.0KG');
  });

  it('ht/wt at the frozen KOFFINK values', () => {
    const sp = makeSpecies({ heightM: 0.6, weightKg: 1.0 });
    const mon = makeMon(sp, 5);
    const page = detailPage(mon, sp, moveName, 0, 1);
    expect(page.ht).toBe('HT 0.6M');
    expect(page.wt).toBe('WT 1.0KG');
  });

  it('atk/def/spd read the species base stats — only hp scales with level', () => {
    const sp = makeSpecies({ atk: 65, def: 95, spd: 35 });
    const lv5 = detailPage(makeMon(sp, 5), sp, moveName, 0, 1);
    const lv30 = detailPage(makeMon(sp, 30), sp, moveName, 0, 1);
    expect(lv5.atk).toBe('ATK 65');
    expect(lv5.def).toBe('DEF 95');
    expect(lv5.spd).toBe('SPD 35');
    expect(lv30).toMatchObject({ atk: 'ATK 65', def: 'DEF 95', spd: 'SPD 35' });
  });

  it('moves maps mon.moves through the injected moveName lookup', () => {
    const sp = makeSpecies();
    const mon = makeMon(sp, 5); // knows tackle, smog
    expect(detailPage(mon, sp, moveName, 0, 1).moves).toEqual(['TACKLE', 'SMOG']);
  });

  it('dex carries sp.dex through unchanged, including a single-line dex', () => {
    const sp = makeSpecies({ dex: ['ONE LINE.'] });
    const mon = makeMon(sp, 5);
    expect(detailPage(mon, sp, moveName, 0, 1).dex).toEqual(['ONE LINE.']);
  });

  it('pager is the 1-based "<index/count>" form', () => {
    const sp = makeSpecies();
    const mon = makeMon(sp, 5);
    expect(detailPage(mon, sp, moveName, 0, 3).pager).toBe('<1/3>');
    expect(detailPage(mon, sp, moveName, 1, 3).pager).toBe('<2/3>');
    expect(detailPage(mon, sp, moveName, 2, 3).pager).toBe('<3/3>');
  });

  // ── FLW.2: hpBand wiring — hpBand's own boundary tests already live in
  // tests/mon.test.ts; these just prove detailPage() calls it and carries
  // the result through as data, not that the threshold itself is right.
  it('band is "ok" for a healthy mon', () => {
    const sp = makeSpecies();
    const mon = makeMon(sp, 5); // makeMon starts at full hp
    expect(detailPage(mon, sp, moveName, 0, 1).band).toBe('ok');
  });

  it('band is "hurt" for a mon at or below half hp', () => {
    const sp = makeSpecies();
    const mon = makeMon(sp, 5);
    mon.hp = Math.floor(maxHp(sp, 5) / 2);
    expect(detailPage(mon, sp, moveName, 0, 1).band).toBe('hurt');
  });

  it('band is "hurt" for a fainted mon (hpBand has no separate fainted state)', () => {
    const sp = makeSpecies();
    const mon = makeMon(sp, 5);
    mon.hp = 0;
    expect(detailPage(mon, sp, moveName, 0, 1).band).toBe('hurt');
  });

  it('every column field fits its 10-glyph cap and every dex line fits 18', () => {
    const sp = makeSpecies();
    const mon = makeMon(sp, 5);
    mon.status = 'PSN';
    const page = detailPage(mon, sp, moveName, 0, 3);
    for (const f of [page.label, page.lv, page.type, page.hp, page.ht, page.wt, page.atk, page.def, page.spd, page.pager]) {
      expect(f.length, f).toBeLessThanOrEqual(10);
    }
    for (const l of page.dex) expect(l.length, l).toBeLessThanOrEqual(18);
  });
});

describe('pageIndex', () => {
  it('wraps forward past the end', () => {
    expect(pageIndex(2, 1, 3)).toBe(0);
  });

  it('wraps backward past the start', () => {
    expect(pageIndex(0, -1, 3)).toBe(2);
  });

  it('steps normally mid-range in both directions', () => {
    expect(pageIndex(1, 1, 3)).toBe(2);
    expect(pageIndex(1, -1, 3)).toBe(0);
  });

  it('is identity for count 1 in both directions', () => {
    expect(pageIndex(0, 1, 1)).toBe(0);
    expect(pageIndex(0, -1, 1)).toBe(0);
  });
});

describe('spriteBox', () => {
  it('a 28x28 front sprite (56x56 at 2x) centres exactly in the box, no offset', () => {
    expect(spriteBox(28, 28)).toEqual({ x: 8, y: 8, w: 56, h: 56 });
  });

  it('a 24x20 back sprite (48x40 at 2x) centres with a 4px/8px inset', () => {
    expect(spriteBox(24, 20)).toEqual({ x: 12, y: 16, w: 48, h: 40 });
  });
});

describe('geometry constants', () => {
  it('DEX_LINE_CAP is derived from the dex bar interior', () => {
    expect(DEX_LINE_CAP).toBe(18);
  });

  it('DETAIL_COL_CAP is derived from the right column width', () => {
    expect(DETAIL_COL_CAP).toBe(10);
  });
});
