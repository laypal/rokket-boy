// SIDE.6 item-ball placement lints. Checks the `b` tile / MapDef.items
// pairing is internally consistent, ids are globally unique, items resolve,
// and every ball has a walkable 4-neighbour reachable from somewhere the
// player can actually stand (a warp arrival, or one of this map's own warp
// source tiles).
//
// e2e-locked cells (derived by hand-replaying every tapDir/walk() call in
// e2e/chapter1.spec.ts, chapter2.spec.ts and chapter3.spec.ts against the
// real grids in src/data/maps — see the SIDE.3/6 task card, .paul/plan/
// side-2346/03-side3-side6-eggs-pickups.md). `hq`, `corner` and `hqDrill`
// aren't listed: hq/corner belong to worker C/A; hqDrill is never driven by
// ANY e2e spec (grepped the e2e/ dir clean of "hqDrill"/"drillguard").
//
//   vault:      {(5,4), (5,5), (5,6)}                       — chest approach + warp column
//   moon1:      {(x,5): x=0..17} ∪ {(17,y): y=5..9} ∪ {(18,9)}
//   moon2:      {(x,1): x=2..18} ∪ {(17,y): y=1..9} ∪ {(18,y): y=1..9} ∪ {(2,2),(3,2)}
//   moonDig:    {(3,y): y=2..4} ∪ {(2,y): y=2..4} ∪ {(x,4): x=2..7}
//   outskirts:  {(10,0), (10,1)}
//   bridge:     {(6,y): y=1..18}
//
// No pickup below sits on any of these cells, and none is adjacent-blocking
// to the walked path (every walked leg here is a straight row/column run
// through PLAIN floor — a `b` one row/column off it can't wall it off).
import { describe, it, expect } from 'vitest';
import { MAPS } from '../src/data/maps';
import { WALKABLE } from '../src/data/tiles';
import { ITEMS } from '../src/data/items';
import type { MapDef, MapId } from '../src/types';

function parseKey(key: string): [number, number] {
  const [xs, ys] = key.split(',');
  return [Number(xs), Number(ys)];
}

/** BFS over WALKABLE tiles on `map` from every seed in `seeds`. */
function reachable(map: MapDef, seeds: [number, number][]): Set<string> {
  const seen = new Set<string>();
  const queue: [number, number][] = [];
  for (const [sx, sy] of seeds) {
    const k = sx + ',' + sy;
    if (seen.has(k)) continue;
    if (!WALKABLE.has(map.grid[sy]?.[sx])) continue;
    seen.add(k);
    queue.push([sx, sy]);
  }
  while (queue.length) {
    const [x, y] = queue.shift()!;
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      const k = nx + ',' + ny;
      if (seen.has(k)) continue;
      if (!WALKABLE.has(map.grid[ny]?.[nx])) continue;
      seen.add(k);
      queue.push([nx, ny]);
    }
  }
  return seen;
}

/** Every seed tile the player could stand on to reach `map`: warp arrivals
 *  from ANY map's warps table that land here, plus this map's own warp
 *  source tiles (you can stand on the source tile itself before stepping
 *  onto/off it). */
function seedsFor(mapId: MapId): [number, number][] {
  const seeds: [number, number][] = [];
  for (const m of Object.values(MAPS)) {
    for (const [target, x, y] of Object.values(m.warps)) {
      if (target === mapId) seeds.push([x, y]);
    }
  }
  const self = MAPS[mapId];
  for (const key of Object.keys(self.warps)) seeds.push(parseKey(key));
  return seeds;
}

describe('pickup placement lints (SIDE.6)', () => {
  it('every items key parses inside the grid and the tile there is `b`', () => {
    for (const map of Object.values(MAPS)) {
      for (const key of Object.keys(map.items)) {
        const [x, y] = parseKey(key);
        expect(x, `${map.id} item@${key} x in bounds`).toBeGreaterThanOrEqual(0);
        expect(x, `${map.id} item@${key} x in bounds`).toBeLessThan(map.w);
        expect(y, `${map.id} item@${key} y in bounds`).toBeGreaterThanOrEqual(0);
        expect(y, `${map.id} item@${key} y in bounds`).toBeLessThan(map.h);
        expect(map.grid[y][x], `${map.id} item@${key} tile char`).toBe('b');
      }
    }
  });

  it('every `b` tile in every grid has a matching items entry', () => {
    for (const map of Object.values(MAPS)) {
      for (const [y, row] of map.grid.entries()) {
        for (const [x, ch] of row.entries()) {
          if (ch !== 'b') continue;
          expect(map.items[x + ',' + y], `${map.id} (${x},${y}) 'b' tile has no items entry`).toBeDefined();
        }
      }
    }
  });

  it('pickup ids are unique across ALL maps', () => {
    const ids: string[] = [];
    for (const map of Object.values(MAPS)) {
      for (const item of Object.values(map.items)) ids.push(item.id);
    }
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThan(0); // sanity: the walker found pickups
  });

  it('every pickup item resolves in ITEMS', () => {
    for (const map of Object.values(MAPS)) {
      for (const [key, item] of Object.entries(map.items)) {
        expect(ITEMS[item.item], `${map.id} item@${key} unknown item "${item.item}"`).toBeDefined();
      }
    }
  });

  it('every `b` has a walkable 4-neighbour reachable from a warp arrival or this map\'s own warp sources', () => {
    for (const map of Object.values(MAPS)) {
      if (Object.keys(map.items).length === 0) continue;
      const reach = reachable(map, seedsFor(map.id));
      for (const key of Object.keys(map.items)) {
        const [x, y] = parseKey(key);
        const neighbours: [number, number][] = [[x, y - 1], [x, y + 1], [x - 1, y], [x + 1, y]];
        const ok = neighbours.some(([nx, ny]) => reach.has(nx + ',' + ny));
        expect(ok, `${map.id} item@${key} has no reachable walkable neighbour`).toBe(true);
      }
    }
  });

  // SIDE.3/6 leaf: no pickups at all on vault, hq, hqDrill, corner.
  it('vault and hqDrill carry no pickups', () => {
    expect(Object.keys(MAPS.vault.items)).toEqual([]);
    expect(Object.keys(MAPS.hqDrill.items)).toEqual([]);
  });
});
