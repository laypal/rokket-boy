// F42 MAP.0 — the start-menu MAP's region table. F44 WM.1: rects are now
// WORLD tiles (8px each) on a scrolling 40×36 parchment, not a fixed
// five-column grid — see worldMap.ts. Every MapId lives in exactly ONE
// region (tests/region.test.ts lints it); interiors collapse onto their
// building's rectangle. Pure data — no engine imports.
import type { MapId } from '../types';

export type RegionId =
  | 'hq' | 'corner' | 'moon' | 'edge' | 'span'
  | 'lav' | 'dock' | 'ann' | 'syl' | 'plant';

export interface RegionDef {
  id: RegionId;
  /** Footer name — ≤17 glyphs (the footer bar's capacity, lint-pinned). */
  name: string;
  /** F44: the region's rect in WORLD tiles (8px each) — fog mask + cursor centre. */
  world: { x: number; y: number; w: number; h: number };
  /** F44: where each map's 1px-per-tile footprint sits, in world PIXELS. */
  anchors: Partial<Record<MapId, [number, number]>>;
  maps: MapId[];
  /** Unused since F44 — MAP.1's glyph row (H / $ / +) was dropped in the
   *  WM.3 world-screen rewrite, which draws footprints, not per-region
   *  glyphs. Kept pending Lyall's call: delete, or give them a reader. */
  hq?: true;
  shop?: true;
  heal?: true;
}

/** World tiles are 8px; region rects and anchors both count from it. */
export const REGION_TILE = 8;

export const REGIONS: RegionDef[] = [
  { id: 'hq',     name: 'ROKKET HQ',      world: { x: 2,  y: 26, w: 8, h: 6 }, maps: ['hq', 'vault', 'hqDrill', 'tower'],
    anchors: { hq: [16, 208], vault: [38, 208], hqDrill: [38, 216], tower: [52, 208] }, hq: true, heal: true },
  { id: 'corner', name: 'GAMEZ CORNER',   world: { x: 2,  y: 18, w: 8, h: 6 }, maps: ['corner'], anchors: { corner: [38, 162] }, shop: true },
  { id: 'moon',   name: 'MT. MOON',       world: { x: 12, y: 16, w: 8, h: 8 }, maps: ['moon1', 'moon2', 'moonDig'],
    anchors: { moon1: [96, 128], moon2: [120, 128], moonDig: [96, 141] } },
  { id: 'edge',   name: 'CERULEUN EDGE',  world: { x: 20, y: 18, w: 8, h: 6 }, maps: ['outskirts'], anchors: { outskirts: [181, 163] } },
  { id: 'span',   name: 'NUGGET SPAN',    world: { x: 20, y: 8,  w: 8, h: 8 }, maps: ['bridge'], anchors: { bridge: [186, 86] } },
  { id: 'lav',    name: 'LAVENDAR TOWER', world: { x: 20, y: 26, w: 8, h: 6 }, maps: ['lav1', 'lav2', 'lav3'],
    anchors: { lav1: [160, 208], lav2: [160, 221], lav3: [160, 234] } },
  { id: 'dock',   name: 'ANN DOCK',       world: { x: 30, y: 18, w: 6, h: 6 }, maps: ['dock'], anchors: { dock: [254, 163] }, shop: true },
  { id: 'ann',    name: 'S.S. ANN',       world: { x: 30, y: 8,  w: 6, h: 8 }, maps: ['deck1', 'deck2', 'cabin'],
    anchors: { deck1: [240, 64], deck2: [240, 77], cabin: [240, 88] } },
  { id: 'syl',    name: 'SYLPHCO',        world: { x: 30, y: 2,  w: 6, h: 5 }, maps: ['syl1', 'syl2', 'syl3', 'syl4', 'syl5'],
    anchors: { syl1: [240, 16], syl2: [264, 16], syl3: [240, 29], syl4: [264, 29], syl5: [240, 42] }, heal: true },
  { id: 'plant',  name: 'POWER PLANT',    world: { x: 30, y: 26, w: 6, h: 6 }, maps: ['plant1', 'plant2', 'plant3'],
    anchors: { plant1: [240, 208], plant2: [264, 208], plant3: [240, 221] } },
];

const BY_MAP: Partial<Record<MapId, RegionDef>> = {};
for (const r of REGIONS) for (const m of r.maps) BY_MAP[m] = r;

/** The region a map belongs to. Every MapId is covered (lint), so a miss is
 *  a programming error — callers may `!` it. */
export function regionOf(map: MapId): RegionDef | undefined {
  return BY_MAP[map];
}

export function regionById(id: RegionId): RegionDef {
  return REGIONS.find((r) => r.id === id)!;
}

/** A region is discovered once ANY of its maps has been landed on. */
export function regionDiscovered(r: RegionDef, visited: ReadonlySet<MapId>): boolean {
  return r.maps.some((m) => visited.has(m));
}
