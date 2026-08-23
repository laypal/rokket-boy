// SIDE.7: the LEVEL CANDY scene — the battle's level-up pipeline run outside
// a battle. Drives the scene frame-by-frame with the same IO stubs the
// battle tests use; the pipeline itself is pinned by battle.test.ts's
// seeded snapshots, so this file covers only what the scene adds: the
// candy's xp maths, the state hand-off, and that the offers actually show.
import { describe, it, expect, beforeEach, vi } from 'vitest';

const keys = { down: new Set<string>(), pressed: new Set<string>() };

vi.mock('../src/engine/renderer', () => ({
  ctx: { drawImage: vi.fn() },
  decode: vi.fn(),
  fill: vi.fn(),
  rect: vi.fn(),
  text: vi.fn(),
  drawWindow: vi.fn(),
  clamp: (v: number, a: number, z: number) => Math.max(a, Math.min(z, v)),
  startFade: (cb: () => void) => cb(),
  W: 160,
  H: 144,
  TILE: 16,
}));
vi.mock('../src/engine/audio', () => ({
  Audio2: { play: vi.fn(), sfx: vi.fn() },
}));
vi.mock('../src/engine/input', () => ({
  Input: {
    held: (k: string): boolean => keys.down.has(k),
    hit: (k: string): boolean => keys.pressed.has(k),
    endFrame: (): void => keys.pressed.clear(),
    dirHeld: (): null => null,
  },
}));

import { G } from '../src/state';
import { SPECIES } from '../src/data/mons';
import { makeMon, maxHp, xpForLevel, LEVEL_CAP } from '../src/systems/mon';
import { useLevelCandy, levelUpUpdate, levelUpDraw, levelUpState } from '../src/systems/levelUpScene';
import { resetQuest } from '../src/systems/quest';

function frame(): void {
  levelUpUpdate();
  levelUpDraw();
  keys.pressed.clear();
}
function tap(k: string): void {
  keys.pressed.add(k);
  frame();
}
/** Run until the scene is waiting on the player with no message up. */
function settle(): void {
  let guard = 0;
  while (G.state === 'levelup' && guard++ < 400) {
    const h = levelUpState()!;
    if (h.msg) {
      const total = h.msg.lines.join('').length;
      keys.down.add('a');
      let g2 = 0;
      while (h.msgChars < total && g2++ < 200) frame();
      keys.down.delete('a');
      tap('a');
    } else if (h.queue.length || h.phase === 'anim') frame();
    else return;
  }
}

beforeEach(() => {
  resetQuest();
  G.state = 'world';
  G.box = [];
  keys.down.clear();
  keys.pressed.clear();
});

describe('useLevelCandy', () => {
  it('grants exactly +1 level (xp lands on the next cube) and full-heals', () => {
    const mon = makeMon(SPECIES.koffink, 7);
    mon.xp = xpForLevel(7) + 5;
    mon.hp = 3;
    G.party = [mon];
    expect(useLevelCandy(mon)).toBe(true);
    expect(mon.lv).toBe(8);
    expect(mon.xp).toBe(xpForLevel(8));
    expect(mon.hp).toBe(maxHp(SPECIES.koffink, 8));
    expect(G.state).toBe('levelup');
    settle(); // hand back so the module's scene slot is clear for the next test
    expect(levelUpState()).toBeNull();
  });

  it('refuses at LEVEL_CAP without starting the scene', () => {
    const mon = makeMon(SPECIES.koffink, LEVEL_CAP);
    G.party = [mon];
    expect(useLevelCandy(mon)).toBe(false);
    expect(mon.lv).toBe(LEVEL_CAP);
    expect(G.state).toBe('world');
    expect(levelUpState()).toBeNull();
  });

  it('plays the grew message then hands back to the world (done fires once)', () => {
    const mon = makeMon(SPECIES.koffink, 3);
    G.party = [mon];
    let done = 0;
    useLevelCandy(mon, () => done++);
    settle();
    expect(G.state).toBe('world');
    expect(levelUpState()).toBeNull();
    expect(done).toBe(1);
  });

  it('BDD: RATIKATT lv15 + candy reaches the lv-16 evolution offer, in the scene', () => {
    const sp = SPECIES.ratikatt;
    expect(sp.evolvesTo?.lv).toBe(16); // UX2.5 threshold — the card's own example
    const mon = makeMon(sp, 15);
    G.party = [makeMon(SPECIES.koffink, 5), mon]; // benched, not slot 0 — QA.6's lesson
    useLevelCandy(mon);
    settle();
    const h = levelUpState()!;
    expect(mon.lv).toBe(16);
    expect(h.phase).toBe('evolve');
    expect(h.evolve?.to).toBe(sp.evolvesTo!.id);
    // STOP → NEVER EVOLVE? → YES makes the refusal permanent, then hands back
    tap('down');
    tap('a'); // STOP → evoConfirm
    expect(h.phase).toBe('evoConfirm');
    tap('down');
    tap('a'); // YES
    settle();
    expect(mon.noEvolve).toBe(true);
    expect(G.state).toBe('world');
  });
});
