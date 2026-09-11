// F44 — the world screen: cursor rules (kept from MAP.1), the fog mask,
// footprints, camera, open/close/drill, and a seeded draw through the mocked
// renderer. Pixels are the playtester's.
import { describe, it, expect, beforeEach, vi } from 'vitest';

const keys = { down: new Set<string>(), pressed: new Set<string>() };
vi.mock('../src/engine/renderer', () => ({
  drawWindow: vi.fn(), rect: vi.fn(), text: vi.fn(),
  decode: vi.fn((rows: { _id: string }) => rows), // identity → drawImage calls carry the rows
  ctx: { drawImage: vi.fn(), save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), rect: vi.fn(), clip: vi.fn() },
  W: 160, H: 144,
}));
vi.mock('../src/engine/audio', () => ({ Audio2: { play: vi.fn(), sfx: vi.fn(), setVolume: vi.fn(), setMuted: vi.fn(), volume: 1, muted: false } }));
vi.mock('../src/engine/input', () => ({ Input: { held: (k: string) => keys.down.has(k), hit: (k: string) => keys.pressed.has(k), endFrame: () => keys.pressed.clear(), dirHeld: () => null } }));

import {
  nextRegion, targetLit, worldCell, footprintPixels, worldCamera,
  openMapScreen, closeMapScreen, isMapScreenOpen, mapCursor, mapMode,
  mapScreenUpdate, mapScreenDraw, MAP_NAME_CAP, FIELD, mapDetailMap,
  tileClass, seenEdge,
} from '../src/systems/mapScreen';
import { newSeen, markSeen, seenCount } from '../src/systems/seen';
import { TILES, WALKABLE } from '../src/data/tiles';
import { REGIONS, regionById, type RegionId } from '../src/data/region';
import { WORLD_TILES, FOG_CHAR, MINI } from '../src/data/worldMap';
import { rect, text, ctx } from '../src/engine/renderer';
import { Audio2 } from '../src/engine/audio';
import { G } from '../src/state';
import { MAPS } from '../src/data/maps';
import { quest, resetQuest } from '../src/systems/quest';
import { BG_PAL } from '../src/data/palettes';
import type { MapId } from '../src/types';

const all = (): boolean => true;
const only = (...ids: RegionId[]) => (r: { id: RegionId }): boolean => ids.includes(r.id);

describe('nextRegion (rect-edge rule on world rects)', () => {
  it('orthogonal neighbours', () => {
    expect(nextRegion('edge', 'right', all)).toBe('dock');
    expect(nextRegion('edge', 'left', all)).toBe('moon');
    expect(nextRegion('edge', 'up', all)).toBe('span');
    expect(nextRegion('edge', 'down', all)).toBe('lav');
  });
  it('no wrap; skips black', () => {
    expect(nextRegion('plant', 'right', all)).toBe('plant');
    expect(nextRegion('plant', 'left', only('hq', 'plant'))).toBe('hq');
    expect(nextRegion('plant', 'up', only('plant'))).toBe('plant');
  });
  it('a region beside you is not "up" just because its centre is a few px higher', () => {
    expect(nextRegion('corner', 'up', only('hq', 'corner', 'moon'))).toBe('corner'); // moon (y16–24) overlaps corner (y18–24) vertically
    expect(nextRegion('moon', 'down', only('hq', 'corner', 'moon'))).toBe('hq');
  });
});

describe('targetLit', () => {
  it('dark for 8 of every 32 frames', () => {
    expect(targetLit(0)).toBe(false); expect(targetLit(8)).toBe(true); expect(targetLit(32)).toBe(false);
  });
});

describe('worldCell — the fog mask over the terrain grid', () => {
  it('returns the terrain char inside a discovered region and FOG_CHAR inside an undiscovered one', () => {
    const hq = regionById('hq').world;
    expect(worldCell(hq.x, hq.y, only('hq'))).not.toBe(FOG_CHAR);
    const syl = regionById('syl').world;
    expect(worldCell(syl.x, syl.y, only('hq'))).toBe(FOG_CHAR);
  });
  it('terrain outside every region is never fogged', () => {
    expect(worldCell(0, 0, () => false)).not.toBe(FOG_CHAR);
  });
});

describe('footprintPixels — a map at 1px a tile', () => {
  it('inks walls and void, skips floor; the count is the wall+void tile count', () => {
    const px = footprintPixels(MAPS.dock);
    const walls = MAPS.dock.grid.join('').split('').filter((c) => c === '#' || c === '=' || c === '.').length;
    expect(px.length).toBe(walls);
    expect(px.every(([x, y]) => x >= 0 && x < MAPS.dock.w && y >= 0 && y < MAPS.dock.h)).toBe(true);
  });
});

describe('worldCamera', () => {
  it('centres the cursor region and clamps to the world edge', () => {
    expect(worldCamera('hq')).toEqual([0, 288 - FIELD.h]); // bottom-left region → clamped
    const [cx, cy] = worldCamera('edge');
    expect(cx).toBeGreaterThan(0); expect(cx).toBeLessThan(320 - 160);
    expect(cy).toBeGreaterThan(0); expect(cy).toBeLessThan(288 - FIELD.h);
  });
});

describe('the world screen', () => {
  const pal = BG_PAL.parchment;
  function frame(...ks: string[]): void { for (const k of ks) keys.pressed.add(k); mapScreenUpdate(); keys.pressed.clear(); }
  beforeEach(() => {
    resetQuest();
    vi.mocked(rect).mockClear(); vi.mocked(text).mockClear(); vi.mocked(ctx.drawImage).mockClear(); vi.mocked(Audio2.sfx).mockClear();
    G.map = MAPS.corner; G.frame = 0;
    quest.visited = new Set<MapId>(['hq', 'vault', 'corner', 'moon1']);
    if (isMapScreenOpen()) closeMapScreen();
  });

  it('opens in world mode on the player\'s region; B closes', () => {
    openMapScreen();
    expect(mapMode()).toBe('world');
    expect(mapCursor()).toBe('corner');
    frame('b');
    expect(isMapScreenOpen()).toBe(false);
    expect(mapMode()).toBeNull();
  });

  it('the cursor moves only onto lit regions and beeps only on a real move', () => {
    openMapScreen();
    frame('up'); expect(mapCursor()).toBe('corner'); expect(Audio2.sfx).not.toHaveBeenCalled();
    frame('right'); expect(mapCursor()).toBe('moon');
    frame('down'); expect(mapCursor()).toBe('hq');
    expect(Audio2.sfx).toHaveBeenCalledTimes(2);
  });

  it('seeded draw: fog tiles cover the seven black regions, footprints ink the visited maps, footer names the cursor', () => {
    openMapScreen();
    frame('right'); // → moon: the undiscovered edge rect is now on screen
    mapScreenDraw(BG_PAL.hq);
    const calls = vi.mocked(ctx.drawImage).mock.calls;
    const imgs = calls.map((c) => c[0] as unknown as { _id: string });
    const fogId = WORLD_TILES[FOG_CHAR]._id;
    // some fog, drawn INSIDE the field — an off-screen fog tile proves nothing
    expect(calls.some((c) => (c[0] as unknown as { _id: string })._id === fogId
      && (c[1] as number) >= 0 && (c[1] as number) < 160
      && (c[2] as number) >= FIELD.y && (c[2] as number) < FIELD.y + FIELD.h)).toBe(true);
    expect(imgs.some((r) => r._id !== fogId)).toBe(true);            // some terrain on screen
    // footprints: 1px rects in the ink shade for the visited maps that are in view (corner is centred → in view)
    const ink = vi.mocked(rect).mock.calls.filter((c) => c[2] === 1 && c[3] === 1 && c[4] === pal[0]).length;
    expect(ink).toBeGreaterThan(0);
    expect(text).toHaveBeenCalledWith('MT. MOON', 6, 134, pal[3]);
    // the parchment palette is used for the paper, the caller's map palette never reaches the field
    expect(vi.mocked(rect).mock.calls.some((c) => c[4] === BG_PAL.hq[2])).toBe(false);
  });

  it('A on a lit region enters detail mode on that region\'s first visited map; B returns to world', () => {
    openMapScreen();
    frame('down'); // → hq
    frame('a');
    expect(mapMode()).toBe('detail');
    expect(mapDetailMap()).toBe('hq');
    expect(isMapScreenOpen()).toBe(true);
    frame('b');
    expect(mapMode()).toBe('world');
    expect(mapCursor()).toBe('hq');
  });

  it('every region name fits the footer beside its "!"', () => {
    for (const r of REGIONS) expect(r.name.length, r.name).toBeLessThanOrEqual(MAP_NAME_CAP);
  });
});

describe('tileClass — the symbolic legend, lint-pinned to tiles.ts', () => {
  // The only chars allowed to read as paper despite blocking: the building
  // facade set, which appears ONLY on `tower` — the cutscene backdrop map the
  // player never walks, and which therefore never reaches the drill-in.
  const OK_AS_FLOOR = new Set(['F', 'l', 'k', 'A']);

  it('every blocking tile in the table reads as something other than floor', () => {
    for (const ch of Object.keys(TILES)) {
      if (WALKABLE.has(ch) || OK_AS_FLOOR.has(ch)) continue;
      expect(tileClass(ch), `blocking '${ch}' must not draw as floor`).not.toBe('floor');
    }
  });

  it('every walkable tile reads as ground, never as an obstacle', () => {
    for (const ch of WALKABLE) {
      expect(tileClass(ch), `walkable '${ch}' must not draw as wall`).not.toBe('wall');
      expect(tileClass(ch), `walkable '${ch}' must not draw as furniture`).not.toBe('furniture');
    }
  });

  it('the spot checks that pin the glyph choices', () => {
    expect(tileClass('#')).toBe('wall'); expect(tileClass('=')).toBe('wall');
    expect(tileClass(' ')).toBe('floor'); expect(tileClass(',')).toBe('floor'); expect(tileClass('_')).toBe('floor');
    expect(tileClass('w')).toBe('water'); expect(tileClass('.')).toBe('void');
    expect(tileClass('~')).toBe('floor'); // RUBBLE is walkable, not water
    expect(tileClass('o')).toBe('door'); expect(tileClass('d')).toBe('door'); // d = the card-key door
    expect(tileClass('>')).toBe('stairs'); expect(tileClass('s')).toBe('sign');
    expect(tileClass('$')).toBe('chest'); expect(tileClass('b')).toBe('chest'); // b = item ball
    expect(tileClass('W')).toBe('pad'); expect(tileClass('h')).toBe('pad');     // h = heal pad
    expect(tileClass('t')).toBe('furniture'); expect(tileClass('R')).toBe('furniture');
    expect(tileClass('?')).toBe('floor'); // anything unknown is walkable paper
  });
});

describe('seenEdge — the ragged ink line where fog starts', () => {
  it('is true for an unseen tile with a seen 4-neighbour only', () => {
    const s = newSeen(10, 10);
    markSeen(s, 10, 10, 5, 5);
    expect(seenEdge(s, 10, 10, 5, 5)).toBe(false); // seen itself
    expect(seenEdge(s, 10, 10, 9, 5)).toBe(true);  // (8,5) is seen (dx 3), (9,5) is not
    expect(seenEdge(s, 10, 10, 0, 0)).toBe(false); // nowhere near
  });
});

describe('the detail screen', () => {
  const pal = BG_PAL.parchment;
  function frame(...ks: string[]): void { for (const k of ks) keys.pressed.add(k); mapScreenUpdate(); keys.pressed.clear(); }
  beforeEach(() => {
    resetQuest();
    vi.mocked(rect).mockClear(); vi.mocked(text).mockClear(); vi.mocked(ctx.drawImage).mockClear();
    G.map = MAPS.dock; G.player.x = 8; G.player.y = 6; G.frame = 8;
    quest.visited = new Set<MapId>(['hq', 'dock']);
    quest.seen.dock = newSeen(MAPS.dock.w, MAPS.dock.h);
    markSeen(quest.seen.dock, MAPS.dock.w, MAPS.dock.h, 8, 6);
    if (isMapScreenOpen()) closeMapScreen();
    openMapScreen(); frame('a'); // cursor starts on dock (the player's region) → detail
  });

  it('opens on the player\'s own map and draws only seen tiles: 37 base rects at 8px, the grunt over the player', () => {
    expect(mapDetailMap()).toBe('dock');
    mapScreenDraw(BG_PAL.hq);
    const eight = vi.mocked(rect).mock.calls.filter((c) => c[2] === 8 && c[3] === 8);
    expect(eight.length).toBe(seenCount(quest.seen.dock!)); // one 8×8 base per SEEN tile, none for unseen
    const imgs = vi.mocked(ctx.drawImage).mock.calls.map((c) => (c[0] as unknown as { _id: string })._id);
    expect(imgs).toContain(MINI.grunt._id);
    expect(imgs).toContain(MINI.door._id); // the south door (9,9) is inside the ring of (8,6): dx 1, dy 3 → 10 ≤ 12
    expect(imgs).toContain(MINI.sign._id); // the sign at (8,8)
    expect(text).toHaveBeenCalledWith('ANN DOCK', 4, 2, pal[3]);
    expect(text).toHaveBeenCalledWith('B:BACK', 6, 134, pal[3]); // one visited floor → no A:FLOOR
  });

  it('the grunt blinks on the bob cadence', () => {
    G.frame = 0; mapScreenDraw(BG_PAL.hq);
    const ids = vi.mocked(ctx.drawImage).mock.calls.map((c) => (c[0] as unknown as { _id: string })._id);
    expect(ids).not.toContain(MINI.grunt._id);
  });

  it('A cycles to the next visited floor of the region; B returns to the world', () => {
    closeMapScreen();
    G.map = MAPS.hq; quest.visited = new Set<MapId>(['hq', 'hqDrill']);
    openMapScreen(); frame('a');
    expect(mapDetailMap()).toBe('hq');
    vi.mocked(text).mockClear(); mapScreenDraw(BG_PAL.hq);
    expect(text).toHaveBeenCalledWith('A:FLOOR B:BACK', 6, 134, pal[3]);
    frame('a'); expect(mapDetailMap()).toBe('hqDrill'); // vault is unvisited → skipped
    frame('a'); expect(mapDetailMap()).toBe('hq');      // wraps within the region
    frame('b'); expect(mapMode()).toBe('world');
  });

  it('a map taller than the field scrolls with the D-pad and clamps', () => {
    closeMapScreen();
    G.map = MAPS.bridge; quest.visited = new Set<MapId>(['bridge']); // 12×20 tiles = 96×160 px, taller than 120
    quest.seen.bridge = newSeen(MAPS.bridge.w, MAPS.bridge.h);
    markSeen(quest.seen.bridge, MAPS.bridge.w, MAPS.bridge.h, 6, 19);
    openMapScreen(); frame('a');
    for (let i = 0; i < 6; i++) frame('down');
    vi.mocked(rect).mockClear(); mapScreenDraw(BG_PAL.hq);
    // scrollY clamps at 160-120 = 40, so (6,19) sits at 32+48, 12+152-40 (48 would be 116)
    expect(rect).toHaveBeenCalledWith(80, 124, 8, 8, expect.anything());
    expect(mapMode()).toBe('detail');
  });
});
