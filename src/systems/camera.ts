// ONB.8: where the world draw is centred. Pulled out of worldDraw() so the
// cutscene camera and the player camera share one clamp, and so both can be
// pinned by unit tests instead of screenshots. Pure: it reads a MapDef and
// returns pixels, and touches no canvas.
import type { MapDef } from '../types';
import { W, H, TILE, clamp } from '../engine/renderer';

/** Top-left draw origin, in pixels, for a camera aimed at (tx, ty).
 *  Clamped to the map; a map smaller than the screen on an axis is centred
 *  on that axis rather than pinned to 0. */
export function cameraFor(map: MapDef, tx: number, ty: number): [number, number] {
  let camX = tx - (W - TILE) / 2;
  let camY = ty - (H - TILE) / 2;
  const maxX = map.w * TILE - W;
  const maxY = map.h * TILE - H;
  camX = maxX <= 0 ? maxX / 2 : clamp(camX, 0, maxX);
  camY = maxY <= 0 ? maxY / 2 : clamp(camY, 0, maxY);
  return [Math.round(camX), Math.round(camY)];
}
