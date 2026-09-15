// F46 ART.6 — the intro sky's pure parts: cloud drift + parallax, the sky
// clip, the birds' single pass. drawIntroSky itself needs a canvas.
import { describe, it, expect } from 'vitest';
import { BIRD, BIRD_T0, CLOUDS, FLOOR_Y, PARALLAX, ROOF_Y, SKY_L, SKY_R, birdAt, cloudAt, skyRects } from '../src/systems/introSky';
import { INTRO_CARDS } from '../src/systems/scenes';

describe('intro sky data', () => {
  it('every cloud and bird frame is rectangular and uses shades or `.`', () => {
    for (const rows of [...CLOUDS.map((c) => c.rows), ...BIRD]) {
      for (const r of rows) expect(r, rows._id).toMatch(new RegExp(`^[0-3.]{${rows[0].length}}$`));
    }
  });

  it('clouds sit between the words band and the prompt floor at the top of the climb', () => {
    for (const [i, c] of CLOUDS.entries()) {
      const { y } = cloudAt(i, 0, 0);
      expect(y, `cloud ${i}`).toBeGreaterThanOrEqual(76);
      expect(y + c.rows.length, `cloud ${i}`).toBeLessThanOrEqual(FLOOR_Y + 4);
    }
  });
});

describe('cloud drift + parallax', () => {
  it('drifts right one pixel every `slow` frames and wraps past the right edge', () => {
    const c = CLOUDS[0];
    const x0 = cloudAt(0, 0, 0).x;
    expect(cloudAt(0, c.slow - 1, 0).x).toBe(x0);
    expect(cloudAt(0, c.slow, 0).x).toBe(x0 + 1);
    const w = c.rows[0].length;
    expect(cloudAt(0, (160 + w) * c.slow, 0).x).toBe(x0); // one full lap
  });

  it('rides a quarter of the camera: the street-level card lifts them above the band', () => {
    for (const [i] of CLOUDS.entries()) {
      const top = cloudAt(i, 0, 0).y, street = cloudAt(i, 0, 336).y;
      expect(top - street).toBe(Math.floor(336 / PARALLAX));
      expect(street).toBeLessThan(28); // above the words band
    }
  });
});

describe('sky clip', () => {
  it('always keeps the two side strips, never below the prompt floor', () => {
    for (const camY of [336, 232, 160, 80, 0]) {
      const rects = skyRects(camY);
      expect(rects[0]).toEqual([0, 0, SKY_L, FLOOR_Y]);
      expect(rects[1]).toEqual([SKY_R, 0, 160 - SKY_R, FLOOR_Y]);
      for (const [, y, , h] of rects) expect(y + h).toBeLessThanOrEqual(FLOOR_Y);
    }
  });

  it('opens the full-width band above the roof only once the climb brings it on screen', () => {
    expect(skyRects(336)).toHaveLength(2);
    expect(skyRects(ROOF_Y)).toHaveLength(2);
    expect(skyRects(40)[2]).toEqual([0, 0, 160, 40]);
    expect(skyRects(0)[2]).toEqual([0, 0, 160, ROOF_Y]);
  });
});

describe('the birds', () => {
  const last = INTRO_CARDS.filter((c) => c.map === 'tower').slice(-1)[0];

  it('are absent before they set off, then cross the whole frame within the last tower card', () => {
    expect(birdAt(BIRD_T0 - 1)).toBeNull();
    expect(birdAt(BIRD_T0)![0].x).toBeLessThan(0);
    const end = birdAt(last.frames - 1)!;
    expect(end[1].x).toBeGreaterThanOrEqual(160); // the trailing bird is off the right edge too
  });

  it('flap every eight frames and fly above the words band', () => {
    expect(birdAt(BIRD_T0)![0].frame).not.toBe(birdAt(BIRD_T0 + 8)![0].frame);
    for (const b of birdAt(BIRD_T0 + 20)!) expect(b.y + BIRD[0].length).toBeLessThanOrEqual(28);
  });
});
