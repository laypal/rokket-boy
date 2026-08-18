// ONB.8: the draw origin is pure maths, so it gets pinned here rather than
// by screenshot. cameraFor is what both the player camera and the cutscene
// camera go through.
import { describe, it, expect } from 'vitest';
import { cameraFor } from '../src/systems/camera';
import { MAPS } from '../src/data/maps';

// hq is 20×14 tiles = 320×224px; the screen is 160×144, so the origin is
// free to move 0..160 horizontally and 0..80 vertically.
const hq = MAPS.hq;

describe('cameraFor', () => {
  it('centres on the target when the map is big enough', () => {
    expect(cameraFor(hq, 160, 112)).toEqual([88, 48]);
  });

  it('clamps at the top-left corner', () => {
    expect(cameraFor(hq, 0, 0)).toEqual([0, 0]);
  });

  it('clamps at the bottom-right corner', () => {
    expect(cameraFor(hq, 320, 224)).toEqual([160, 80]);
  });

  it('clamps inside a map that is only a little wider than the screen', () => {
    // bridge is 12×20 tiles = 192×320: 32px of horizontal travel, 176 vertical
    expect(cameraFor(MAPS.bridge, 96, 160)).toEqual([24, 96]);
  });

  it('centres an axis that is smaller than the screen instead of pinning it to 0', () => {
    // a 6×4 stub map = 96×64px: both axes shorter than the screen
    const stub = { ...hq, w: 6, h: 4 };
    expect(cameraFor(stub, 48, 32)).toEqual([-32, -40]);
  });

  it('rounds to whole pixels', () => {
    expect(cameraFor(hq, 160.4, 112.6)).toEqual([88, 49]);
  });
});
