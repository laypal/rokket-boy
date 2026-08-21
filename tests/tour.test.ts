// ONB.2/FLW.5 (2026-08-21): the { tour } guided-camera machine. The camera
// pans stop to stop (G.cutscene targets, cameraFor clamps at draw time),
// holds with a band, A advances, B/START exits early, and the camera always
// returns to the player before the script resumes. Same mock/harness idiom
// as dialog-advance.test.ts; ticks driven directly.
import { describe, it, expect, beforeEach, vi } from 'vitest';

const keys = { down: new Set<string>(), pressed: new Set<string>() };
vi.mock('../src/engine/renderer', () => ({
  rect: vi.fn(),
  textC: vi.fn(),
  clamp: (v: number, a: number, z: number) => Math.max(a, Math.min(z, v)),
  W: 160,
  H: 144,
  TILE: 16,
}));
vi.mock('../src/engine/audio', () => ({ Audio2: { play: vi.fn(), sfx: vi.fn() } }));
vi.mock('../src/engine/input', () => ({
  Input: {
    held: (k: string): boolean => keys.down.has(k),
    hit: (k: string): boolean => keys.pressed.has(k),
    endFrame: (): void => keys.pressed.clear(),
    dirHeld: (): null => null,
  },
}));

import { G } from '../src/state';
import { MAPS } from '../src/data/maps';
import { rect, textC } from '../src/engine/renderer';
import {
  startTour, tourTick, tourDraw, tourActive, resetTour, TOUR_PAN_SPEED,
} from '../src/systems/tour';

function frame(): void {
  tourTick();
  keys.pressed.clear();
}
function tap(k: string): void {
  keys.pressed.add(k);
  frame();
}
function runFrames(n: number): void {
  for (let i = 0; i < n; i++) frame();
}
/** Ticks until the current leg settles: either the camera holds still (a
 *  stop's hold phase) or the tour resolves (the return leg finishing). */
function panUntilHold(): void {
  let guard = 0;
  let last: [number, number] | null = null;
  for (;;) {
    frame();
    if (!tourActive()) return; // return leg finished — the step resolved
    const c = G.cutscene;
    expect(c).not.toBeNull();
    const now: [number, number] = [c!.camX, c!.camY];
    if (last && now[0] === last[0] && now[1] === last[1]) return; // settled
    last = now;
    expect(guard++).toBeLessThan(300); // a pan must terminate
  }
}

beforeEach(() => {
  keys.down.clear();
  keys.pressed.clear();
  resetTour();
  G.state = 'world';
  G.map = MAPS.hq; // 20×14 tiles — camY clamps at 80, camX at 160
  G.player.x = 2;
  G.player.y = 2; // pixel origin (32, 32)
  G.player.moving = false;
  vi.mocked(rect).mockClear();
  vi.mocked(textC).mockClear();
});

describe('the { tour } machine (ONB.2/FLW.5)', () => {
  it('an empty stops list resolves immediately (the missing-npcRun rule)', () => {
    let done = false;
    startTour([], () => (done = true));
    expect(done).toBe(true);
    expect(tourActive()).toBe(false);
    expect(tourTick()).toBe(false); // inactive: the world keeps the frame
  });

  it('pans the camera target toward the stop at TOUR_PAN_SPEED per axis, then holds', () => {
    startTour([{ cam: [62, 32], lines: ['STOP ONE'] }], () => {});
    expect(tourActive()).toBe(true);
    expect(tourTick()).toBe(true); // owns the frame from the first tick
    expect(G.cutscene).not.toBeNull();
    expect(G.cutscene!.camX).toBe(32 + TOUR_PAN_SPEED); // one step from the player
    expect(G.cutscene!.camY).toBe(32);
    runFrames(9); // 30px total / 3px per frame = 10 ticks to arrive
    expect(G.cutscene!.camX).toBe(62);
    runFrames(5); // holding: the camera stays put without input
    expect(G.cutscene!.camX).toBe(62);
    expect(tourActive()).toBe(true);
  });

  it('A advances stops; A on the last stop returns the camera and resolves', () => {
    let done = false;
    startTour(
      [
        { cam: [62, 32], lines: ['ONE'] },
        { cam: [62, 62], lines: ['TWO'] },
      ],
      () => (done = true),
    );
    panUntilHold();
    expect(G.cutscene!.camX).toBe(62);
    tap('a'); // advance: pan resumes toward stop two
    expect(done).toBe(false);
    panUntilHold();
    expect(G.cutscene!.camY).toBe(62);
    tap('a'); // last stop: return leg starts
    expect(done).toBe(false);
    panUntilHold(); // settles back at the player...
    expect(done).toBe(true); // ...which resolves the step
    expect(tourActive()).toBe(false);
    expect(G.cutscene).toBeNull(); // camera handed back to the player
  });

  it('A during a pan is ignored — the pan keeps moving, the stop index holds', () => {
    startTour([{ cam: [92, 32], lines: ['FAR'] }], () => {});
    frame();
    const midX = G.cutscene!.camX;
    tap('a'); // mid-pan press
    expect(G.cutscene!.camX).toBe(midX + TOUR_PAN_SPEED); // still panning
    expect(tourActive()).toBe(true);
  });

  it('B mid-hold exits the whole sequence early — later stops never shown', () => {
    let done = false;
    startTour(
      [
        { cam: [62, 32], lines: ['ONE'] },
        { cam: [122, 92], lines: ['NEVER SEEN'] },
      ],
      () => (done = true),
    );
    panUntilHold();
    tap('b');
    expect(done).toBe(false); // return leg still to run
    panUntilHold();
    expect(done).toBe(true);
    expect(tourActive()).toBe(false);
    expect(G.cutscene).toBeNull();
    // the second stop was never reached: nothing ever panned past stop one
  });

  it('START during the pan leg also exits early', () => {
    let done = false;
    startTour([{ cam: [92, 92], lines: ['X'] }], () => (done = true));
    runFrames(3); // part-way out
    tap('start');
    panUntilHold(); // return leg settles at the player
    expect(done).toBe(true);
    expect(G.cutscene).toBeNull();
  });

  it('tourDraw: band + prompt only while holding, nothing during a pan', () => {
    startTour([{ cam: [62, 32], lines: ['MARKET HERE'] }], () => {});
    frame(); // mid-pan
    tourDraw();
    expect(vi.mocked(rect)).not.toHaveBeenCalled();
    panUntilHold();
    tourDraw();
    expect(vi.mocked(rect)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(rect).mock.calls[0][1]).toBe(112); // bottom band: H - (1*14+6) - 12
    const drawn = vi.mocked(textC).mock.calls.map((c) => c[0]);
    expect(drawn).toContain('MARKET HERE');
    expect(drawn).toContain('A: NEXT  B: SKIP'); // the skip is printed, not a secret
  });

  it('the band flips to the top when the clamped target would sit inside it', () => {
    // The real market stop: target [96,176] on hq (maxY camY = 80) leaves
    // the vendor at screen y 96 — under a bottom 3-line band (top y 84).
    // The playtest caught it fully hidden; the band must flip to the top.
    startTour([{ cam: [96, 176], lines: ['ONE', 'TWO', 'THREE'] }], () => {});
    panUntilHold();
    tourDraw();
    expect(vi.mocked(rect).mock.calls[0][1]).toBe(0); // top placement
    const promptY = vi.mocked(textC).mock.calls.find((c) => c[0] === 'A: NEXT  B: SKIP')![1];
    expect(promptY).toBe(3 * 14 + 6 + 2); // prompt rides inside the top band
  });
});
