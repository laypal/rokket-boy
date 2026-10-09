// CH8-FB.4: the lockdown bust swarm — twelve sprites start off-screen on the
// four edges, close on the player every tick, and the whiteout callback
// fires exactly once when the swarm's clock runs out. The tick is pure; the
// draw (frame decoding) is the playtester's.
import { describe, it, expect, beforeEach } from 'vitest';
import { startSwarm, swarmTick, swarmActive, swarmSprites, clearSwarm, SWARM_COUNT, SWARM_FRAMES } from '../src/systems/swarm';
import { TILE } from '../src/engine/renderer';

const dist = (s: { x: number; y: number }, tx: number, ty: number) => Math.hypot(s.x - tx, s.y - ty);

describe('swarm (CH8-FB.4)', () => {
  beforeEach(() => clearSwarm());

  it('is inert until started', () => {
    expect(swarmActive()).toBe(false);
    expect(swarmTick()).toBe(false);
    expect(swarmSprites()).toHaveLength(0);
  });

  it('starts twelve guards off-screen on all four sides of the player', () => {
    startSwarm('guard', 'safari', 10, 8, () => {});
    const s = swarmSprites();
    expect(s).toHaveLength(SWARM_COUNT);
    const tx = 10 * TILE;
    const ty = 8 * TILE;
    expect(s.some((g) => g.y < ty - 72)).toBe(true); // from above
    expect(s.some((g) => g.y > ty + 72)).toBe(true); // from below
    expect(s.some((g) => g.x < tx - 80)).toBe(true); // from the left
    expect(s.some((g) => g.x > tx + 80)).toBe(true); // from the right
    expect(new Set(s.map((g) => g.dir)).size).toBe(4);
  });

  it('every guard closes on the player each tick and stops a tile short', () => {
    startSwarm('guard', undefined, 10, 8, () => {});
    const tx = 10 * TILE;
    const ty = 8 * TILE;
    const before = swarmSprites().map((g) => dist(g, tx, ty));
    swarmTick();
    const after = swarmSprites().map((g) => dist(g, tx, ty));
    for (let i = 0; i < before.length; i++) expect(after[i]).toBeLessThan(before[i]);
    for (let t = 0; t < SWARM_FRAMES - 2; t++) swarmTick();
    for (const g of swarmSprites()) expect(dist(g, tx, ty)).toBeGreaterThanOrEqual(TILE - 3);
  });

  it('owns the frame for SWARM_FRAMES ticks, then fires onDone exactly once and goes inert', () => {
    let done = 0;
    startSwarm('guard', undefined, 3, 3, () => done++);
    for (let t = 0; t < SWARM_FRAMES - 1; t++) {
      expect(swarmTick()).toBe(true);
      expect(done).toBe(0);
    }
    expect(swarmTick()).toBe(true); // the last owned frame
    expect(done).toBe(1);
    expect(swarmActive()).toBe(false);
    expect(swarmTick()).toBe(false);
    expect(done).toBe(1);
  });
});
