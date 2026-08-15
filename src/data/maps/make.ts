// Map constructor: row strings → mutable char grid + size.
import type { MapDef } from '../../types';

type MapInput = Omit<MapDef, 'grid' | 'w' | 'h'> & { rows: string[] };

export function makeMap(input: MapInput): MapDef {
  const { rows, ...rest } = input;
  const grid = rows.map((r) => r.split(''));
  return { ...rest, grid, w: grid[0].length, h: grid.length };
}
