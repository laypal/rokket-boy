// ONB.8: the intro's page machine, driven without a canvas. Renderer, audio,
// input and world are stubbed the way tests/scenes.test.ts does it.
import { describe, it, expect, beforeEach, vi } from 'vitest';

const keys = { pressed: new Set<string>() };

vi.mock('../src/engine/renderer', () => ({
  ctx: { drawImage: vi.fn() },
  decode: vi.fn(),
  fill: vi.fn(),
  rect: vi.fn(),
  text: vi.fn(),
  textC: vi.fn(),
  glyph: vi.fn(() => null),
  startFade: (cb: () => void) => cb(),
  drawWindow: vi.fn(),
  clamp: (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v)),
  W: 160,
  H: 144,
  TILE: 16,
}));
vi.mock('../src/engine/audio', () => ({
  Audio2: { play: vi.fn(), sfx: vi.fn(), stop: vi.fn() },
}));
vi.mock('../src/engine/input', () => ({
  Input: {
    held: (): boolean => false,
    hit: (k: string): boolean => keys.pressed.has(k),
  },
}));
vi.mock('../src/engine/charFrames', () => ({
  CHAR_FRAMES: {
    jessika: { right: [{}, {}, {}, {}] },
    grunt: { right: [{}, {}, {}, {}] },
    djames: { right: [{}, {}, {}, {}] },
  },
}));
vi.mock('../src/systems/world', () => ({
  performWarp: vi.fn(),
  landAt: vi.fn(),
  worldDraw: vi.fn(),
}));

import { G } from '../src/state';
import { introUpdate, INTRO_CARDS, HOLD_FRAMES } from '../src/systems/scenes';
import { landAt, worldDraw } from '../src/systems/world';
import { rect, W, H } from '../src/engine/renderer';
import { MAPS } from '../src/data/maps';
import { BG_PAL } from '../src/data/palettes';

const MAX_CHARS = 17; // plan §5, same budget as every dialog page
const MAX_LINES = 5;  // introUpdate draws at 34 + i*14, so five fit above the prompts

/** One introUpdate() frame with the given key registered as freshly pressed. */
function tap(k: string): void {
  keys.pressed.add(k);
  introUpdate();
  keys.pressed.clear();
}

beforeEach(() => {
  G.state = 'intro';
  G.introPage = 0;
  G.introT = 0;
  G.cutscene = null;
  vi.clearAllMocks();
});

describe('intro card data (ONB.8)', () => {
  it('every line fits the box', () => {
    for (const [i, card] of INTRO_CARDS.entries()) {
      for (const line of card.lines) {
        expect(line.length, `card ${i}: "${line}"`).toBeLessThanOrEqual(MAX_CHARS);
      }
    }
  });

  it('no card has more lines than the screen has room for', () => {
    for (const [i, card] of INTRO_CARDS.entries()) {
      expect(card.lines.length, `card ${i}`).toBeLessThanOrEqual(MAX_LINES);
    }
  });

  it('every card dwells for a positive number of frames', () => {
    for (const [i, card] of INTRO_CARDS.entries()) {
      expect(card.frames, `card ${i}`).toBeGreaterThan(0);
    }
  });

  it('runs for the 990 frames the design froze', () => {
    const total = INTRO_CARDS.reduce((n, c) => n + c.frames, 0);
    expect(total).toBe(990); // 16.5s at 60fps
  });

  it('opens each of the three beats with an establishing hold', () => {
    const holds = INTRO_CARDS.filter((c) => c.hold);
    expect(holds).toHaveLength(3);
    expect(holds.length * HOLD_FRAMES).toBe(54); // the design's beat-transition budget
  });

  it('shows the player only where the map really is where they are', () => {
    for (const card of INTRO_CARDS) {
      expect(!!card.showPlayer, `${card.map}: "${card.lines[0]}"`).toBe(card.map === 'hq');
    }
  });

  it('every backdrop names a real map', () => {
    for (const card of INTRO_CARDS) expect(MAPS[card.map]).toBeDefined();
  });
});

describe('intro skip (ONB.8)', () => {
  it('START from the first page leaves the intro immediately', () => {
    tap('start');
    expect(G.state).not.toBe('intro');
    expect(G.state).toBe('worldwait');
    expect(landAt).toHaveBeenCalledWith(['hq', 9, 7, 'down']);
  });

  it('START from a later page also leaves', () => {
    G.introPage = 1;
    tap('start');
    expect(G.state).not.toBe('intro');
    expect(G.state).toBe('worldwait');
    expect(landAt).toHaveBeenCalledWith(['hq', 9, 7, 'down']);
  });

  it('A still advances one card at a time', () => {
    tap('a');
    expect(G.introPage).toBe(1);
    expect(G.state).toBe('intro');
  });
});

describe('intro card machine (ONB.8)', () => {
  it('holds a card for its full dwell, then advances on its own', () => {
    const dwell = INTRO_CARDS[0].frames;
    for (let i = 0; i < dwell - 1; i++) introUpdate();
    expect(G.introPage).toBe(0);
    introUpdate();
    expect(G.introPage).toBe(1);
    expect(G.introT).toBe(0);
  });

  it('drives the camera and hides the player on a backdrop card', () => {
    introUpdate();
    expect(G.cutscene).not.toBeNull();
    expect(G.cutscene?.hidePlayer).toBe(true);
    expect(G.map.id).toBe(INTRO_CARDS[0].map);
  });

  it('shows the player on the HQ cards', () => {
    G.introPage = INTRO_CARDS.findIndex((c) => c.map === 'hq');
    introUpdate();
    expect(G.cutscene?.hidePlayer).toBe(false);
  });

  it('pans across a card that names two camera targets and lands on the end target', () => {
    G.introPage = 4; // 2b: [80, 400] → [80, 232]
    G.introT = 0;
    introUpdate();
    expect(G.cutscene!.camY).toBe(400);
    for (let i = 0; i < INTRO_CARDS[4].frames - 2; i++) introUpdate();
    expect(G.cutscene!.camY).toBeLessThan(400);
    expect(G.cutscene!.camY).toBeGreaterThan(232);
    introUpdate(); // the last frame of the card draws at the end target, then advances
    expect(G.cutscene!.camY).toBe(232);
    expect(G.cutscene!.camX).toBe(80);
    expect(G.introPage).toBe(5);
  });

  it('withholds the words band for HOLD_FRAMES on a hold card, but always paints the prompt floor', () => {
    // ONB.8-FB: the prompt floor (rect at y 116) is unconditional, unlike
    // the words band which waits out the hold — so "bare" now means one
    // rect per frame (the floor), not zero.
    for (let i = 0; i < HOLD_FRAMES; i++) introUpdate(); // introT 0..HOLD_FRAMES-1: floor only
    expect(rect).toHaveBeenCalledTimes(HOLD_FRAMES);
    expect(rect).not.toHaveBeenCalledWith(0, 28, expect.anything(), expect.anything(), expect.anything());
    introUpdate(); // introT === HOLD_FRAMES: the words band lands too
    expect(rect).toHaveBeenCalledTimes(HOLD_FRAMES + 2);
  });

  it('paints the prompt floor at y 116 in night[0] every frame, on every card', () => {
    for (const [i] of INTRO_CARDS.entries()) {
      G.introPage = i;
      G.introT = 0;
      vi.clearAllMocks();
      introUpdate();
      expect(rect).toHaveBeenCalledWith(0, 116, W, H - 116, BG_PAL.night[0]);
    }
  });

  it('draws the world every frame', () => {
    introUpdate();
    expect(worldDraw).toHaveBeenCalledTimes(1);
  });

  it('clears the cutscene when it ends', () => {
    G.introPage = INTRO_CARDS.length - 1;
    tap('start');
    expect(G.cutscene).toBeNull();
    expect(G.introT).toBe(0);
  });

  it('leaves the intro after the last card without any input', () => {
    G.introPage = INTRO_CARDS.length - 1;
    // captured once: nextCard() pushes G.introPage past the array's end on
    // the call that ends the cinematic, so re-reading INTRO_CARDS[G.introPage]
    // from the loop condition itself would index undefined
    const frames = INTRO_CARDS[G.introPage].frames;
    for (let i = 0; i < frames + 1; i++) {
      if (G.state !== 'intro') break;
      introUpdate();
    }
    expect(G.state).toBe('worldwait');
    expect(landAt).toHaveBeenCalledWith(['hq', 9, 7, 'down']);
  });
});

describe('the seam to Giovanni (ONB.8)', () => {
  it('HQ has an enter script that fires once, behind introSeen', async () => {
    const { hqScripts } = await import('../src/data/dialog/hq');
    const enter = hqScripts['enter'];
    expect(enter, 'hq has no enter script').toBeDefined();
    const json = JSON.stringify(enter);
    expect(json).toContain('"notFlag":"introSeen"');
    expect(json).toContain('"setFlag":"introSeen"');
    expect(json).toContain('FIRST JOB.');
  });
});
