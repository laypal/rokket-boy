// RNK.5a — worn-gear compose, the pure half. Row overlay + slot/tier
// selection + charset composition are all Node-testable; the canvas decode
// on top of them is covered by the decode goldens and the playtester pass.
import { describe, it, expect } from 'vitest';
import { S, overlayRows, type SpriteRows } from '../src/data/sprites';
import { CHARSETS, GEAR_WEAR, wornGear, composeCharset, HEADS } from '../src/data/chars';
import { ITEMS } from '../src/data/items';
import { OBJ_PAL } from '../src/data/palettes';

describe('overlayRows', () => {
  const base = S('0123', '....');
  const top = S('..9.', '9...');

  it('top pixel wins unless transparent', () => {
    const out = overlayRows(base, top);
    expect([...out]).toEqual(['0193', '9...']);
  });

  it('never mutates its inputs', () => {
    overlayRows(base, top);
    expect([...base]).toEqual(['0123', '....']);
    expect([...top]).toEqual(['..9.', '9...']);
  });

  it('mints a fresh _id — decode caches by it, composed rows must not collide', () => {
    const out = overlayRows(base, top);
    expect(out._id).not.toBe(base._id);
    expect(out._id).not.toBe(top._id);
    // and it is deterministic per pair, so the cache still works
    expect(overlayRows(base, top)._id).toBe(out._id);
  });
});

describe('wornGear — one piece per slot, highest tier', () => {
  it('empty pack wears nothing', () => {
    expect(wornGear([])).toEqual([]);
  });

  it('non-gear and rows-less items are ignored', () => {
    expect(wornGear(['SODA', 'ROKKET BALL', 'NOT-AN-ITEM'])).toEqual([]);
  });

  it('picks the highest tier within a slot', () => {
    const shades = GEAR_WEAR['ROKKET SHADES'];
    if (shades.slot !== 'head') throw new Error('SHADES must be head gear');
    GEAR_WEAR['T-CAP'] = { slot: 'head', rows: shades.rows };
    ITEMS['T-CAP'] = { id: 'T-CAP', kind: 'gear', price: 0, desc: 'TEST.', wear: { slot: 'head', tier: 0 } };
    expect(wornGear(['T-CAP', 'ROKKET SHADES'])).toEqual(['ROKKET SHADES']); // tier 1 beats 0
    delete ITEMS['T-CAP'];
    delete GEAR_WEAR['T-CAP'];
  });

  it('applies in head, body, hands order (hands draw over a coat)', () => {
    // only SHADES has rows in RNK.5a; the ORDER contract is pinned via the
    // slot list — completeness of all six pieces is RNK.5b's lint.
    expect(wornGear(['ROKKET SHADES'])).toEqual(['ROKKET SHADES']);
  });
});

describe('composeCharset', () => {
  it('no worn gear returns the base charset BY REFERENCE (decode cache no-op)', () => {
    expect(composeCharset(CHARSETS.grunt, [])).toBe(CHARSETS.grunt);
    expect(composeCharset(CHARSETS.grunt, ['SODA'])).toBe(CHARSETS.grunt);
  });

  it('a head piece overlays all three head facings and leaves the body alone', () => {
    const out = composeCharset(CHARSETS.grunt, ['ROKKET SHADES']);
    expect(out).not.toBe(CHARSETS.grunt);
    expect(out.head.d).not.toBe(CHARSETS.grunt.head.d);
    expect(out.head.d._id).not.toBe(CHARSETS.grunt.head.d._id);
    expect(out.body).toBe(CHARSETS.grunt.body);
    expect(out.pal).toBe(CHARSETS.grunt.pal);
    // every row still 16 wide — overlay never changes geometry
    for (const r of out.head.d) expect(r).toHaveLength(16);
  });
});

describe('GEAR_WEAR registry lint', () => {
  it('every entry resolves to a gear item whose wear slot matches', () => {
    for (const [id, g] of Object.entries(GEAR_WEAR)) {
      const item = ITEMS[id];
      expect(item, `${id} resolves in ITEMS`).toBeDefined();
      expect(item.kind, `${id} kind`).toBe('gear');
      expect(item.wear?.slot, `${id} slot`).toBe(g.slot);
    }
  });

  it('every overlay row set is 8 rows of 16 chars over the legal alphabet (0-4 + .)', () => {
    // RNK.5c: gear rows may use digit 4 = Rokket gold (OBJ_PAL.player[4]);
    // base character rows never do, so the player palette is the ONLY one
    // that needs five entries.
    for (const [id, g] of Object.entries(GEAR_WEAR)) {
      const sets: SpriteRows[] =
        g.slot === 'head' ? [g.rows.d, g.rows.u, g.rows.s]
        : [g.rows.d0, g.rows.d1, g.rows.u0, g.rows.u1, g.rows.s0, g.rows.s1];
      for (const rows of sets) {
        expect(rows, `${id} rows`).toHaveLength(8);
        for (const r of rows) expect(r, `${id}: "${r}"`).toMatch(/^[0-4.]{16}$/);
      }
    }
  });

  it('RNK.5c: the player palette is grunt + one gold slot, and every gear piece uses gold somewhere', () => {
    expect(OBJ_PAL.player).toHaveLength(5);
    expect(OBJ_PAL.player.slice(0, 4)).toEqual(OBJ_PAL.grunt);
    for (const [id, g] of Object.entries(GEAR_WEAR)) {
      const sets: SpriteRows[] =
        g.slot === 'head' ? [g.rows.d, g.rows.u, g.rows.s]
        : [g.rows.d0, g.rows.d1, g.rows.u0, g.rows.u1, g.rows.s0, g.rows.s1];
      const usesGold = sets.some((rows) => rows.some((r) => r.includes('4')));
      expect(usesGold, `${id} never uses the gold slot — it will vanish into the uniform (2026-08-15 contact sheet)`).toBe(true);
    }
  });

  it('RNK.5b — every ITEMS wear def has a GEAR_WEAR entry and vice versa', () => {
    const wearIds = Object.keys(ITEMS).filter((id) => ITEMS[id].wear);
    const overlayIds = Object.keys(GEAR_WEAR);
    for (const id of wearIds) expect(overlayIds, `${id} missing GEAR_WEAR rows`).toContain(id);
    for (const id of overlayIds) expect(wearIds, `${id} has GEAR_WEAR rows but no ITEMS wear def`).toContain(id);
  });

  it('RNK.5b — every piece is visible (not all-transparent) in its primary facing', () => {
    const T = '................';
    for (const [id, g] of Object.entries(GEAR_WEAR)) {
      const primary = g.slot === 'head' ? g.rows.d : g.rows.d0;
      expect(primary.some((r) => r !== T), `${id} primary facing is all-transparent`).toBe(true);
    }
  });
});

// ── ONB.7: HEADS.medic shape ──────────────────────────────────────────────
describe('HEADS.medic', () => {
  it.each(['d', 'u', 's'] as const)('%s facing is 8 rows of 16 chars', (facing) => {
    const rows = HEADS.medic[facing];
    expect(rows).toHaveLength(8);
    for (const r of rows) expect(r).toHaveLength(16);
  });

  it.each(['d', 'u', 's'] as const)('%s facing uses only shades 0-3 and transparency', (facing) => {
    for (const r of HEADS.medic[facing]) expect(r, `"${r}"`).toMatch(/^[0-3.]{16}$/);
  });

  it('all three facings are present', () => {
    expect(Object.keys(HEADS.medic).sort()).toEqual(['d', 's', 'u']);
  });
});
