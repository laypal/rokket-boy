// F44 WM.1 — the world grid + terrain tile lints (PLAN spec §3).
import { describe, it, expect } from 'vitest';
import { WORLD_ROWS, WORLD_W, WORLD_H, WORLD_TILES, MINI, FOG_CHAR } from '../src/data/worldMap';
import { REGIONS, REGION_TILE, regionOf } from '../src/data/region';
import { MAPS } from '../src/data/maps';

describe('world grid', () => {
  it('is 40×36 and only uses registered terrain chars', () => {
    expect(WORLD_W).toBe(40);
    expect(WORLD_H).toBe(36);
    expect(WORLD_ROWS.length).toBe(WORLD_H);
    for (const [y, row] of WORLD_ROWS.entries()) {
      expect(row.length, `row ${y}`).toBe(WORLD_W);
      for (const ch of row) expect(WORLD_TILES[ch], `row ${y} char "${ch}"`).toBeDefined();
    }
    expect(WORLD_TILES[FOG_CHAR]).toBeDefined();
  });

  it('every terrain tile and mini glyph is 8×8 in the shade grammar', () => {
    for (const [k, rows] of [...Object.entries(WORLD_TILES), ...Object.entries(MINI)]) {
      expect(rows.length, k).toBe(8);
      for (const r of rows) expect(r, k).toMatch(/^[0-3.]{8}$/);
    }
  });
});

describe('region world rects', () => {
  it('sit inside the world and are pairwise disjoint', () => {
    for (const a of REGIONS) {
      expect(a.world.x).toBeGreaterThanOrEqual(0);
      expect(a.world.y).toBeGreaterThanOrEqual(0);
      expect(a.world.x + a.world.w, a.id).toBeLessThanOrEqual(WORLD_W);
      expect(a.world.y + a.world.h, a.id).toBeLessThanOrEqual(WORLD_H);
      for (const b of REGIONS) {
        if (a === b) continue;
        const apart = a.world.x + a.world.w <= b.world.x || b.world.x + b.world.w <= a.world.x
          || a.world.y + a.world.h <= b.world.y || b.world.y + b.world.h <= a.world.y;
        expect(apart, `${a.id} overlaps ${b.id}`).toBe(true);
      }
    }
  });

  it('every map has an anchor and its 1px footprint fits inside its region rect', () => {
    for (const r of REGIONS) {
      for (const id of r.maps) {
        const a = r.anchors[id];
        expect(a, `${r.id} anchor for ${id}`).toBeDefined();
        const [px, py] = a!;
        const m = MAPS[id];
        expect(px, `${id} anchor x`).toBeGreaterThanOrEqual(r.world.x * REGION_TILE);
        expect(py, `${id} anchor y`).toBeGreaterThanOrEqual(r.world.y * REGION_TILE);
        expect(px + m.w, `${id} footprint right`).toBeLessThanOrEqual((r.world.x + r.world.w) * REGION_TILE);
        expect(py + m.h, `${id} footprint bottom`).toBeLessThanOrEqual((r.world.y + r.world.h) * REGION_TILE);
        expect(regionOf(id)!.id).toBe(r.id);
      }
    }
  });

  it('footprints in one region never overlap', () => {
    for (const r of REGIONS) {
      for (const a of r.maps) {
        for (const b of r.maps) {
          if (a === b) continue;
          const [ax, ay] = r.anchors[a]!;
          const [bx, by] = r.anchors[b]!;
          const apart = ax + MAPS[a].w <= bx || bx + MAPS[b].w <= ax
            || ay + MAPS[a].h <= by || by + MAPS[b].h <= ay;
          expect(apart, `${a} overlaps ${b}`).toBe(true);
        }
      }
    }
  });
});
