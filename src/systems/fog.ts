// CH5.0 §1 — fog of war for the LAVENDAR TOWER, pure (no engine imports).
// The world draws a mask, not different tiles: everything world-space
// outside the lantern ring is painted over in the map's darkest shade until
// the SILF SCOPE is in the PACK. Data in, data out, so it tests in Node.
import type { MapDef } from '../types';
import { SCOPE_ITEM } from '../data/items';

export const FOG_RADIUS = 3;

/** Is the tile at (dx, dy) from the player inside the lantern? A rounded
 *  ring, not a square: dx² + dy² ≤ r² + r. At r=3 that is 37 tiles — rows
 *  of 7, 7, 7, 5, 3 outward from the centre row (hand-derived, pinned in
 *  tests/fog.test.ts). */
export function fogVisible(dx: number, dy: number, r = FOG_RADIUS): boolean {
  return dx * dx + dy * dy <= r * r + r;
}

/** Fog is on for a `fog` map until the SCOPE is held. `items` is the PACK
 *  (`quest.items`, duplicates and all — `includes` is enough). */
export function fogActive(map: Pick<MapDef, 'fog'>, items: readonly string[]): boolean {
  return !!map.fog && !items.includes(SCOPE_ITEM);
}
