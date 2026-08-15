// scenes.ts: boot/title/intro/end screens. First unit tests for this module
// (HRD.8) — pins continueGame()'s fallback when the save vanishes between
// hasSave() and readSave() (a TOCTOU gap: a second tab clearing storage, or
// a corrupt write landing between the two reads). continueGame() itself is
// module-private, reached only through titleUpdate()'s CONTINUE/NEW GAME
// window — same indirection the real game uses.
//
// Mock setup follows tests/battle.test.ts's harness idiom: renderer/audio/
// input/charFrames are canvas/DOM-touching and get stubbed; './world' is
// mocked too so continueGame's success path doesn't need a real map warp.
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
  startFade: (cb: () => void) => cb(), // fades resolve instantly under test
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
}));

import { G } from '../src/state';
import { titleUpdate } from '../src/systems/scenes';
import { quest, resetQuest } from '../src/systems/quest';
import { performWarp } from '../src/systems/world';
import { type SaveStorage, setSaveStorage, writeSave } from '../src/systems/save';
import { makeMon } from '../src/systems/mon';
import { SPECIES } from '../src/data/mons';
import { MAPS } from '../src/data/maps';

function fakeStorage(): SaveStorage & { data: string | null } {
  const s = {
    data: null as string | null,
    read: () => s.data,
    write: (d: string) => {
      s.data = d;
    },
    persistent: true,
  };
  return s;
}

/** One titleUpdate() frame with the given key registered as freshly pressed. */
function tap(k: string): void {
  keys.pressed.add(k);
  titleUpdate();
  keys.pressed.clear();
}

/** titleSel is module-private; a harmless 'b' press resets it to null
 *  regardless of prior state (cancels the CONTINUE/NEW GAME window if one
 *  was open, or is silently absorbed by the konami-code scan otherwise). */
function resetTitleSel(): void {
  tap('b');
}

beforeEach(() => {
  resetQuest();
  setSaveStorage(fakeStorage());
  G.party = [makeMon(SPECIES.koffink, 5)];
  G.map = MAPS.hq;
  G.player.x = 9;
  G.player.y = 7;
  G.titleT = 0;
  G.konami = [];
  G.state = 'title';
  resetTitleSel();
  vi.clearAllMocks();
});

describe('continueGame via titleUpdate (HRD.8)', () => {
  it('a save that is still there loads normally (control)', () => {
    quest.coins = 42;
    writeSave();
    tap('a'); // opens the CONTINUE/NEW GAME window (hasSave() true)
    tap('a'); // confirm CONTINUE (titleSel defaults to 0)
    expect(performWarp).toHaveBeenCalledTimes(1);
    expect(performWarp).toHaveBeenCalledWith(['hq', 9, 7, 'down']);
  });

  it('falls back to NEW GAME when the save vanishes between hasSave() and readSave()', () => {
    writeSave(); // a real save exists — hasSave() reads true
    tap('a'); // opens the CONTINUE/NEW GAME window
    // the save vanishes from storage between the hasSave() check above and
    // continueGame's own readSave() below (a second tab, a racing clear, …)
    setSaveStorage(fakeStorage());
    tap('a'); // confirm CONTINUE (titleSel still 0) — must not crash
    expect(performWarp).not.toHaveBeenCalled();
    expect(G.state).toBe('intro'); // startIntro() ran instead of a frozen canvas
    expect(G.introPage).toBe(0);
  });
});
