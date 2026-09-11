// F42 MAP.0 — the region table lint: every MapId lives in exactly one region,
// no two share a cell, and every chapter names a real region (PLAN §4).
// F44 WM.1: the rect-on-a-grid test moved to tests/worldMap.test.ts (rects
// are now WORLD tiles, not fixed five-column cells).
import { describe, it, expect } from 'vitest';
import { REGIONS, regionOf, regionById, regionDiscovered } from '../src/data/region';
import { MAPS } from '../src/data/maps';
import { CHAPTERS } from '../src/systems/quest';
import type { MapId } from '../src/types';

describe('region table (F42 MAP.0)', () => {
  it('covers every MapId exactly once', () => {
    const seen = new Map<string, number>();
    for (const r of REGIONS) for (const m of r.maps) seen.set(m, (seen.get(m) ?? 0) + 1);
    for (const id of Object.keys(MAPS)) expect(seen.get(id), `${id} is in ${seen.get(id) ?? 0} regions`).toBe(1);
    for (const [m] of seen) expect(MAPS[m as MapId], `region map ${m} is not a real map`).toBeDefined();
  });

  it('every chapter names a real region', () => {
    for (const ch of CHAPTERS) expect(regionById(ch.region)?.id, `${ch.id} → ${ch.region}`).toBe(ch.region);
  });

  it('regionOf resolves interiors onto their building; discovery is any-map-visited', () => {
    expect(regionOf('vault')!.id).toBe('hq');
    expect(regionOf('cabin')!.id).toBe('ann');
    const syl = regionById('syl');
    expect(regionDiscovered(syl, new Set())).toBe(false);
    expect(regionDiscovered(syl, new Set<MapId>(['syl3']))).toBe(true);
  });
});
