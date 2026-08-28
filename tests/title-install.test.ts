// PKG.4: the title screen draws SELECT: INSTALL APP only while an install
// can actually be offered, hides it under the CONTINUE/NEW GAME window, and
// SELECT triggers the prompt. Harness idiom = tests/scenes.test.ts (renderer/
// audio/input stubbed); install.ts is mocked so no Event plumbing is needed.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const keys = { pressed: new Set<string>() };
const install = { can: false, prompt: vi.fn() };

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
  W: 160,
  H: 144,
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
vi.mock('../src/engine/install', () => ({
  canInstall: () => install.can,
  promptInstall: () => install.prompt(),
}));

import { textC } from '../src/engine/renderer';
import { Audio2 } from '../src/engine/audio';
import { G } from '../src/state';
import { titleUpdate } from '../src/systems/scenes';
import { setSaveStorage } from '../src/systems/save';

const LINE = 'SELECT: INSTALL APP';
const drewLine = (): boolean => vi.mocked(textC).mock.calls.some(([s]) => s === LINE);

describe('title screen install nudge', () => {
  beforeEach(() => {
    keys.pressed.clear();
    install.can = false;
    install.prompt.mockClear();
    vi.mocked(textC).mockClear();
    vi.mocked(Audio2.sfx).mockClear();
    G.state = 'title';
    G.titleT = 0;
    // no save → START goes to the intro, never the CONTINUE window (node env has no localStorage)
    setSaveStorage({ read: () => null, write: () => {}, persistent: true });
  });

  it('draws nothing when the browser has not offered an install', () => {
    titleUpdate();
    expect(drewLine()).toBe(false);
  });

  it('draws SELECT: INSTALL APP at y=126 when installable', () => {
    install.can = true;
    titleUpdate();
    const call = vi.mocked(textC).mock.calls.find(([s]) => s === LINE);
    expect(call?.[1]).toBe(126);
  });

  it('SELECT prompts the install with the confirm sfx', () => {
    install.can = true;
    keys.pressed.add('select');
    titleUpdate();
    expect(install.prompt).toHaveBeenCalledTimes(1);
    expect(Audio2.sfx).toHaveBeenCalledWith('confirm');
  });

  it('SELECT does nothing when not installable', () => {
    keys.pressed.add('select');
    titleUpdate();
    expect(install.prompt).not.toHaveBeenCalled();
  });

  it('a same-frame START is not swallowed by SELECT', () => {
    install.can = true;
    keys.pressed.add('select');
    keys.pressed.add('start');
    titleUpdate();
    expect(install.prompt).toHaveBeenCalledTimes(1);
    expect(G.state).toBe('intro'); // START → startIntro() on a fresh save
  });
});
