// Integrity lints for the mon/move registries — every entry added by later
// roster cards gets checked automatically, like the dialogue content lints.
import { describe, it, expect } from 'vitest';
import { MOVES } from '../src/data/moves';
import { SPECIES } from '../src/data/mons';
import { TYPE_IDS } from '../src/data/typeChart';
import { movesAtLevel, LEVEL_CAP, makeMon } from '../src/systems/mon';
import { detailPage, DEX_LINE_CAP, DETAIL_COL_CAP } from '../src/systems/monDetail';

describe('move registry', () => {
  it('has at least the Ch.1 seed moves', () => {
    expect(Object.keys(MOVES).length).toBeGreaterThanOrEqual(4);
  });

  it('every move is well-formed', () => {
    for (const [key, mv] of Object.entries(MOVES)) {
      expect(mv.id, `key ${key}`).toBe(key);
      expect(mv.name.length, `${key} name fits the battle menu`).toBeLessThanOrEqual(10);
      expect(TYPE_IDS, `${key} type`).toContain(mv.type);
      expect(mv.power, `${key} power`).toBeGreaterThanOrEqual(0);
      expect(mv.acc, `${key} acc`).toBeGreaterThan(0);
      expect(mv.acc, `${key} acc`).toBeLessThanOrEqual(1);
      // UX2.2: hover desc — one help-bar line (18-glyph interior, the
      // PACK_DESC_CAP geometry), shouty GB register, full stop.
      expect(mv.desc, `${key} has a desc`).toBeTruthy();
      expect(mv.desc.length, `${key} desc fits the help bar`).toBeLessThanOrEqual(18);
      expect(mv.desc, `${key} desc is uppercase`).toBe(mv.desc.toUpperCase());
      expect(mv.desc.endsWith('.'), `${key} desc ends with '.'`).toBe(true);
    }
  });
});

describe('species registry', () => {
  it('seeds the Ch.1 duo', () => {
    expect(SPECIES.koffink).toBeDefined();
    expect(SPECIES.voltorbb).toBeDefined();
    expect(SPECIES.koffink.type).toEqual(['POISON']);
    expect(SPECIES.voltorbb.type).toEqual(['ELECTRIC']);
  });

  it('every species is well-formed', () => {
    for (const [key, sp] of Object.entries(SPECIES)) {
      expect(sp.id, `key ${key}`).toBe(key);
      expect(sp.name.length, `${key} name fits battle boxes`).toBeLessThanOrEqual(10);
      expect(sp.type.length, `${key} has 1–2 types`).toBeGreaterThanOrEqual(1);
      expect(sp.type.length, `${key} has 1–2 types`).toBeLessThanOrEqual(2);
      for (const t of sp.type) expect(TYPE_IDS, `${key} type`).toContain(t);
      for (const stat of [sp.baseHp, sp.atk, sp.def, sp.spd]) {
        expect(stat, `${key} stats positive`).toBeGreaterThan(0);
      }
      expect(sp.catchRate, `${key} catchRate`).toBeGreaterThan(0);
      expect(sp.catchRate, `${key} catchRate`).toBeLessThanOrEqual(1);
      expect(sp.front._id, `${key} front sprite is tagged`).toBeTruthy();
      expect(sp.back._id, `${key} back sprite is tagged`).toBeTruthy();
      expect(sp.pal, `${key} palette has 4 shades`).toHaveLength(4);
    }
  });

  it('every learnset references real moves, sorted by level, within the cap', () => {
    for (const [key, sp] of Object.entries(SPECIES)) {
      expect(sp.moves.length, `${key} has moves`).toBeGreaterThan(0);
      let prev = 0;
      for (const { lv, move } of sp.moves) {
        expect(MOVES[move], `${key} move ${move} exists`).toBeDefined();
        expect(lv, `${key} learnset sorted`).toBeGreaterThanOrEqual(prev);
        expect(lv).toBeGreaterThanOrEqual(1);
        expect(lv).toBeLessThanOrEqual(LEVEL_CAP);
        prev = lv;
      }
      expect(movesAtLevel(sp, 1).length, `${key} knows a move at lv 1`).toBeGreaterThan(0);
    }
  });

  it('every battle sprite is rectangular and battle-sized', () => {
    // Legal shapes: 28×28 (front) or 24×20 (back). Either slot may hold
    // either shape while the 1a placeholder cross-reuse lasts; what this
    // lint hard-fails is ragged rows or off-grammar dimensions.
    const legal = (rows: string[]) =>
      (rows.length === 28 && rows.every((r) => r.length === 28)) ||
      (rows.length === 20 && rows.every((r) => r.length === 24));
    for (const [key, sp] of Object.entries(SPECIES)) {
      expect(legal(sp.front), `${key} front is 28×28 or 24×20 with uniform rows`).toBe(true);
      expect(legal(sp.back), `${key} back is 28×28 or 24×20 with uniform rows`).toBe(true);
    }
  });

  it('every evolution target exists in the registry', () => {
    for (const [key, sp] of Object.entries(SPECIES)) {
      if (sp.evolvesTo) {
        expect(SPECIES[sp.evolvesTo.id], `${key} evolves to a real species`).toBeDefined();
        expect(sp.evolvesTo.lv).toBeGreaterThan(1);
        expect(sp.evolvesTo.lv).toBeLessThanOrEqual(LEVEL_CAP);
      }
    }
  });

  it('pins the evolution thresholds (UX2.5 — pacing is a Lyall decision)', () => {
    // Lowered so an evolution is reachable at CH2–3 wild levels: RATIKATT/
    // ZUBATT 2026-08-05, GEODOOD/EKANZZ 2026-08-09 (was 26/22). Changing any
    // number here needs a Lyall decision, not a refactor.
    expect(SPECIES.ratikatt.evolvesTo).toEqual({ id: 'ratikate', lv: 16 });
    expect(SPECIES.zubatt.evolvesTo).toEqual({ id: 'golbatt', lv: 18 });
    expect(SPECIES.geodood.evolvesTo).toEqual({ id: 'gravlr', lv: 18 });
    expect(SPECIES.ekanzz.evolvesTo).toEqual({ id: 'arbok', lv: 21 });
  });

  // MNU.3 — the dex page's flavour block. Same ASCII-printable rule the
  // content lints use elsewhere (charCode 32..126).
  it('MNU.3: every species has a valid heightM/weightKg/dex block', () => {
    const printable = (s: string): boolean => [...s].every((c) => {
      const code = c.charCodeAt(0);
      return code >= 32 && code <= 126;
    });
    for (const [key, sp] of Object.entries(SPECIES)) {
      expect(sp.heightM, `${key} heightM`).toBeGreaterThanOrEqual(0.1);
      expect(sp.heightM, `${key} heightM`).toBeLessThanOrEqual(99.9);
      expect(sp.weightKg, `${key} weightKg`).toBeGreaterThanOrEqual(0.1);
      expect(sp.weightKg, `${key} weightKg`).toBeLessThanOrEqual(999.9);
      expect(sp.dex.length, `${key} dex has 1-2 lines`).toBeGreaterThanOrEqual(1);
      expect(sp.dex.length, `${key} dex has 1-2 lines`).toBeLessThanOrEqual(2);
      for (const line of sp.dex) {
        expect(line.length, `${key} dex line "${line}" fits DEX_LINE_CAP`).toBeLessThanOrEqual(DEX_LINE_CAP);
        expect(printable(line), `${key} dex line "${line}" is ASCII-printable`).toBe(true);
      }
      expect(sp.type.join('/').length, `${key} type line fits DETAIL_COL_CAP`).toBeLessThanOrEqual(DETAIL_COL_CAP);
    }
  });

  it('MNU.3: every DetailPage field for a fresh lv-5 mon fits its cap', () => {
    for (const [key, sp] of Object.entries(SPECIES)) {
      const mon = makeMon(sp, 5);
      const page = detailPage(mon, sp, (id) => MOVES[id].name, 0, 1);
      for (const f of [page.label, page.lv, page.type, page.hp, page.ht, page.wt, page.atk, page.def, page.spd, page.pager]) {
        expect(f.length, `${key}: "${f}"`).toBeLessThanOrEqual(10);
      }
      for (const l of page.dex) expect(l.length, `${key}: "${l}"`).toBeLessThanOrEqual(18);
      for (const m of page.moves) expect(m.length, `${key} move "${m}"`).toBeLessThanOrEqual(10);
    }
  });
});
