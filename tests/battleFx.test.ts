// Battle FX tests (card BFX.1, .paul/PLAN.md "PLAN — BFX.1"). Red-phase: the
// module under test (src/systems/battleFx.ts) does not exist yet — every test
// here must compile-fail/import-fail today and pass verbatim once the frozen
// spec lands. Mock setup and frame/tap/popMsg/settle drivers copied from
// tests/battle.test.ts's harness idioms (mulberry32-seeded, engine IO stubbed).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const keys = { down: new Set<string>(), pressed: new Set<string>() };

vi.mock('../src/engine/renderer', () => ({
  ctx: null,
  decode: vi.fn(),
  fill: vi.fn(),
  rect: vi.fn(),
  text: vi.fn(),
  drawWindow: vi.fn(),
  clamp: (v: number, a: number, z: number) => Math.max(a, Math.min(z, v)),
  startFade: (cb: () => void) => cb(), // fades resolve instantly under test
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

import {
  FX_IDS,
  fxLength,
  fxFrame,
  playFx,
  ME_ANCHOR,
  FOE_ANCHOR,
  SCENE_FX_IDS,
  spriteShown,
  tweenHp,
  floatFrame,
  FLOAT_LEN,
  FLOAT_RISE,
  FLOAT_LEN_SUPER,
  FLOAT_RISE_SUPER,
  xpFillFrame,
  XP_SEG_LEN,
  XP_FLASH_LEN,
  evolveFrame,
  EVO_FLIPS,
  EVO_HOLD,
  EVO_RAMP_END,
  EVO_WHITE_END,
  EVO_END,
  EVO_REVEAL_STEP,
  EVO_SKIP_TO,
  EVO_SKIP_ARM,
} from '../src/systems/battleFx';
import { startBattle, battleUpdate, setBattleRng, type BattleState } from '../src/systems/battle';
import { MOVES } from '../src/data/moves';
import { typePal, OBJ_PAL } from '../src/data/palettes';
import { TYPE_IDS } from '../src/data/typeChart';
import { mulberry32 } from '../src/engine/rng';
import { G } from '../src/state';
import { quest, resetQuest } from '../src/systems/quest';
import { makeMon } from '../src/systems/mon';
import { SPECIES } from '../src/data/mons';

// ── frame drivers (copied idiom from tests/battle.test.ts) ─────────────────
function frame(): void {
  battleUpdate();
  keys.pressed.clear();
}
function tap(k: string): void {
  keys.pressed.add(k);
  frame();
}
function b(): BattleState {
  return G.battle!;
}
/** Fast-forward the current message (hold A) and dismiss it. */
function popMsg(): void {
  const s = b();
  const total = s.msg!.lines.join('').length;
  keys.down.add('a');
  let guard = 0;
  while (s.msgChars < total && guard++ < 500) frame();
  keys.down.delete('a');
  tap('a');
}
/** Run until the battle waits for player input (or has ended). */
function settle(): void {
  let guard = 0;
  while (G.battle && guard++ < 300) {
    const s = G.battle;
    if (s.msg) popMsg();
    else if (s.queue.length || s.phase === 'slide' || s.phase === 'open' || s.phase === 'anim') frame();
    else return; // menu / moves / switch / replace
  }
  if (G.battle) throw new Error('settle(): battle never became interactive');
}

beforeEach(() => {
  G.battle = null;
  G.state = 'world';
  keys.down.clear();
  keys.pressed.clear();
});
// HRD.11: this file seeds battleRng via setBattleRng(mulberry32(...)) in a
// couple of describe blocks below; reset it after every test so a forgotten
// seed can never leak an unseeded (Math.random-backed) battleRng onward.
afterEach(() => {
  setBattleRng(Math.random);
});

// ── FX_IDS ────────────────────────────────────────────────────────────────
describe('FX_IDS', () => {
  it('is exactly the six ids the card defines', () => {
    expect(FX_IDS).toEqual(['lunge', 'rings', 'gas', 'lob', 'bolt', 'blast']);
  });
});

// ── fxLength ─────────────────────────────────────────────────────────────
describe('fxLength', () => {
  it('is an integer in 1..45 for every FX_IDS id', () => {
    for (const id of FX_IDS) {
      const len = fxLength(id);
      expect(Number.isInteger(len)).toBe(true);
      expect(len).toBeGreaterThanOrEqual(1);
      expect(len).toBeLessThanOrEqual(45);
    }
  });
});

// ── offset settles at the last frame ────────────────────────────────────
describe('fxFrame offset settle', () => {
  it('dx===0 && dy===0 on the final frame, both sides, every id', () => {
    for (const id of FX_IDS) {
      const len = fxLength(id);
      for (const side of ['me', 'foe'] as const) {
        const f = fxFrame(id, len - 1, side, 'NORMAL');
        expect(f.dx).toBe(0);
        expect(f.dy).toBe(0);
      }
    }
  });
});

// ── determinism ──────────────────────────────────────────────────────────
describe('fxFrame determinism', () => {
  it('two identical calls are deep-equal at frames 0, mid, and last', () => {
    for (const id of FX_IDS) {
      const len = fxLength(id);
      const sampleFrames = [0, Math.floor(len / 2), len - 1];
      for (const side of ['me', 'foe'] as const) {
        for (const t of sampleFrames) {
          const a = fxFrame(id, t, side, 'NORMAL');
          const again = fxFrame(id, t, side, 'NORMAL');
          expect(a).toEqual(again);
        }
      }
    }
  });
});

// ── mirror (lunge) ───────────────────────────────────────────────────────
describe('fxFrame mirror (lunge)', () => {
  it("foe's dx is the negation of me's dx at every frame", () => {
    const len = fxLength('lunge');
    for (let t = 0; t < len; t++) {
      const foeFrame = fxFrame('lunge', t, 'foe', 'NORMAL');
      const meFrame = fxFrame('lunge', t, 'me', 'NORMAL');
      // `|| 0` normalises the -0 that negating a zero dx produces: toBe is
      // Object.is, which (unlike the spec's ===) tells -0 and 0 apart.
      expect(foeFrame.dx).toBe(-meFrame.dx || 0);
    }
  });
});

// ── data lint: MOVES <-> FX_IDS ───────────────────────────────────────────
describe('move -> fx data lint', () => {
  it('every MOVES[*].anim is a valid FxId', () => {
    for (const mv of Object.values(MOVES)) {
      expect(FX_IDS).toContain(mv.anim);
    }
  });

  it('every FxId is used by at least one move', () => {
    const used = new Set(Object.values(MOVES).map((mv) => mv.anim));
    for (const id of FX_IDS) {
      expect(used.has(id)).toBe(true);
    }
  });
});

// ── typePal ──────────────────────────────────────────────────────────────
describe('typePal', () => {
  it('returns a 4-colour palette for all 9 TYPE_IDS', () => {
    for (const t of TYPE_IDS) {
      const pal = typePal(t);
      expect(Array.isArray(pal)).toBe(true);
      expect(pal).toHaveLength(4);
      for (const c of pal) expect(typeof c).toBe('string');
    }
  });
});

// ── integration: seeded TACKLE turn (harness idioms from battle.test.ts) ──
describe('battle integration: fx plays before damage lands', () => {
  it('fx is active with foe hp unchanged right after the move message, then hp drops on settle', () => {
    setBattleRng(mulberry32(42));
    let follow: unknown;
    startBattle('guard_voltorbb', (f) => (follow = f));
    settle();
    const startHp = G.battle!.foe.hp;
    tap('a'); // FIGHT
    tap('a'); // first move (TACKLE) — useMove() queues the "used TACKLE!" message
    frame(); // shift the queued message into b.msg (battle.ts's queue pump)
    popMsg(); // pop "used TACKLE!" and run its accuracy-check `after()`
    expect(G.battle!.fx).toBeTruthy();
    expect(G.battle!.foe.hp).toBe(startHp);
    settle();
    expect(G.battle!.foe.hp).toBeLessThan(startHp);
    void follow;
  });
});

// ── BFX.2: per-effect shapes (card §BFX.2, .paul/PLAN.md "PLAN — BFX.2") ───

// ── rings expands ────────────────────────────────────────────────────────
describe('rings expands', () => {
  it("ring 0's flankers get farther from the centre as it travels (t=2 vs t=14)", () => {
    const early = fxFrame('rings', 2, 'me', 'NORMAL').particles;
    const late = fxFrame('rings', 14, 'me', 'NORMAL').particles;
    // particles[0] is ring 0's centre, particles[1] its "+spread" flanker.
    const flankerDist = (pts: typeof early) => Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
    expect(flankerDist(late)).toBeGreaterThan(flankerDist(early));
  });
});

// ── gas ──────────────────────────────────────────────────────────────────
describe('gas', () => {
  it('≥3 puffs alive at t=16, all sprite puff, all drifting up (never down)', () => {
    const peak = fxFrame('gas', 16, 'me', 'POISON');
    expect(peak.particles.length).toBeGreaterThanOrEqual(3);
    for (const pt of peak.particles) {
      expect(pt.sprite).toBe('puff');
      expect(pt.y).toBeLessThanOrEqual(FOE_ANCHOR.y); // side 'me': def is FOE_ANCHOR
    }
  });

  // The plan first froze LEN 36, which made the last puff's death frame land ON
  // the final frame — i.e. the effect ended with a puff still drawn, the exact
  // pop this card exists to remove. LEN is 37 so the timeline outlives its last
  // puff by a frame and the hand-back to the damage chain is visually clean.
  it('decays from the t=16 peak to zero on the final frame (no immortal puffs)', () => {
    const peakCount = fxFrame('gas', 16, 'me', 'POISON').particles.length;
    const lastCount = fxFrame('gas', fxLength('gas') - 1, 'me', 'POISON').particles.length;
    expect(lastCount).toBeLessThan(peakCount);
    expect(lastCount).toBe(0);
  });
});

// ── lob ──────────────────────────────────────────────────────────────────
describe('lob', () => {
  it('exactly 1 particle in flight, ≥3 after the splat, arcing above the straight line', () => {
    for (let t = 0; t < 18; t++) {
      expect(fxFrame('lob', t, 'me', 'NORMAL').particles).toHaveLength(1);
    }
    for (let t = 18; t < fxLength('lob'); t++) {
      expect(fxFrame('lob', t, 'me', 'NORMAL').particles.length).toBeGreaterThanOrEqual(3);
    }
    const midT = 9; // mid-flight
    const mid = fxFrame('lob', midT, 'me', 'NORMAL').particles[0];
    const f = midT / 17;
    const straightY = ME_ANCHOR.y + (FOE_ANCHOR.y - ME_ANCHOR.y) * f;
    expect(mid.y).toBeLessThan(straightY); // apex lifts it above the lerp line
  });
});

// ── bolt ─────────────────────────────────────────────────────────────────
describe('bolt', () => {
  it('touches both anchors at t=0 (both sides), never flashes, crackles ≥4 at t=12', () => {
    for (const side of ['me', 'foe'] as const) {
      const atk = side === 'me' ? ME_ANCHOR : FOE_ANCHOR;
      const def = side === 'me' ? FOE_ANCHOR : ME_ANCHOR;
      const f0 = fxFrame('bolt', 0, side, 'NORMAL');
      expect(f0.particles.some((pt) => Math.hypot(pt.x - atk.x, pt.y - atk.y) <= 1)).toBe(true);
      expect(f0.particles.some((pt) => Math.hypot(pt.x - def.x, pt.y - def.y) <= 1)).toBe(true);
    }
    for (let t = 0; t < fxLength('bolt'); t++) {
      expect(fxFrame('bolt', t, 'me', 'NORMAL').flash).toBe(false);
    }
    expect(fxFrame('bolt', 12, 'me', 'NORMAL').particles.length).toBeGreaterThanOrEqual(4);
  });
});

// ── blast ────────────────────────────────────────────────────────────────
describe('blast', () => {
  it('flashes at t=0, peaks shake at 3, decays monotonically to 0, highest of all six', () => {
    expect(fxFrame('blast', 0, 'me', 'NORMAL').flash).toBe(true);
    expect(fxFrame('blast', 4, 'me', 'NORMAL').shake).toBe(3);
    let prev = fxFrame('blast', 4, 'me', 'NORMAL').shake;
    for (let t = 5; t < fxLength('blast'); t++) {
      const s = fxFrame('blast', t, 'me', 'NORMAL').shake;
      expect(s).toBeLessThanOrEqual(prev);
      prev = s;
    }
    expect(fxFrame('blast', fxLength('blast') - 1, 'me', 'NORMAL').shake).toBe(0);
    const peakShake = (id: (typeof FX_IDS)[number]): number => {
      let max = 0;
      for (let t = 0; t < fxLength(id); t++) max = Math.max(max, fxFrame(id, t, 'me', 'NORMAL').shake);
      return max;
    };
    const blastPeak = peakShake('blast');
    for (const id of FX_IDS) {
      if (id === 'blast') continue;
      expect(blastPeak).toBeGreaterThan(peakShake(id));
    }
  });
});

// ── mirror, all six ids ──────────────────────────────────────────────────
describe('fxFrame mirror, all six ids', () => {
  it('dx negates and particle counts match between sides, every id and frame', () => {
    for (const id of FX_IDS) {
      const len = fxLength(id);
      for (let t = 0; t < len; t++) {
        const meFrame = fxFrame(id, t, 'me', 'NORMAL');
        const foeFrame = fxFrame(id, t, 'foe', 'NORMAL');
        // `|| 0` normalises the -0 the negation mints (Object.is again).
        expect(foeFrame.dx).toBe(-meFrame.dx || 0);
        expect(foeFrame.particles.length).toBe(meFrame.particles.length);
      }
    }
  });
});

// ── playFx sets the right effect for every id ────────────────────────────
describe('playFx sets the right effect for every id', () => {
  it('stores { id, t: 0, side, type } for all six ids, both sides', () => {
    for (const id of FX_IDS) {
      for (const side of ['me', 'foe'] as const) {
        const fake = { fx: null } as unknown as BattleState;
        const done = (): void => {};
        playFx(fake, id, side, 'NORMAL', done);
        expect(fake.fx).toEqual({ id, t: 0, side, type: 'NORMAL', done });
      }
    }
  });
});

// ── BDD substitute: direction integration (foe side) ─────────────────────
describe('battle integration: foe fx plays on the foe side', () => {
  it("foe attacks trigger a foe-side fx matching that move's anim (seed 42)", () => {
    setBattleRng(mulberry32(42));
    let follow: unknown;
    startBattle('guard_voltorbb', (f) => (follow = f));
    settle();
    tap('a'); // FIGHT
    tap('a'); // first move (TACKLE) — plays out me-side fx first
    let foeMoveName = '';
    let guard = 0;
    while (guard++ < 300) {
      const s = b();
      if (s.fx && s.fx.side === 'foe') break;
      if (s.msg) {
        // enemyTurn's message is [foeLabel, 'used MOVE!'] — capture the name
        // before popping so we can look up its anim after the fact.
        if (s.msg.lines[1]?.startsWith('used ')) {
          foeMoveName = s.msg.lines[1].slice(5, -1);
        }
        popMsg();
      } else {
        frame();
      }
    }
    expect(b().fx).toBeTruthy();
    expect(b().fx!.side).toBe('foe');
    const foeMove = Object.values(MOVES).find((mv) => mv.name === foeMoveName);
    expect(foeMove).toBeTruthy();
    expect(b().fx!.id).toBe(foeMove!.anim);
    void follow;
  });
});

// ── BFX.3: item, ball-throw & faint feel (card §BFX.3, .paul/PLAN.md "PLAN — BFX.3") ──

// ── SCENE_FX_IDS ─────────────────────────────────────────────────────────
describe('SCENE_FX_IDS', () => {
  it('is exactly the five scene ids the card defines', () => {
    expect(SCENE_FX_IDS).toEqual(['heal', 'smoke', 'throwOk', 'throwFail', 'faint']);
  });

  it('shares no id with FX_IDS (move anims and scene fx are disjoint unions)', () => {
    for (const id of SCENE_FX_IDS) expect(FX_IDS as readonly string[]).not.toContain(id);
    for (const id of FX_IDS) expect(SCENE_FX_IDS as readonly string[]).not.toContain(id);
  });
});

// ── fxLength on scene ids ────────────────────────────────────────────────
describe('fxLength (scene ids)', () => {
  it('is an integer in 1..90 for every SCENE_FX_IDS id', () => {
    for (const id of SCENE_FX_IDS) {
      const len = fxLength(id);
      expect(Number.isInteger(len)).toBe(true);
      expect(len).toBeGreaterThanOrEqual(1);
      expect(len).toBeLessThanOrEqual(90);
    }
  });
});

// ── clean handback: the generalised `gas` lesson, applied to every scene id ─
describe('scene fx clean handback', () => {
  // QOL.2 pin change: throwOk's glow (ball + pulsing stars, BFX.2 §QOL.2) now
  // holds all the way to the final frame instead of going dark at t74 — it
  // hands straight into "Gotcha!" the same way hideDefender already overlaps
  // b.caught below. Every other scene id still ends with nothing drawn.
  it('every scene id emits zero particles on its final frame, except throwOk (glow holds to "Gotcha!")', () => {
    for (const id of SCENE_FX_IDS) {
      const count = fxFrame(id, fxLength(id) - 1, 'me', 'NORMAL').particles.length;
      if (id === 'throwOk') expect(count).toBeGreaterThan(0);
      else expect(count).toBe(0);
    }
  });

  // hideDefender is NOT part of the clean-handback rule. That rule is about
  // nothing being DRAWN when the effect ends; hideDefender is a suppression
  // flag, and `throwOk` must hold it to the final frame so it overlaps
  // battle.ts's `b.caught` instead of leaving a gap the caught mon flashes
  // through. Every other scene id does release it.
  it('releases hideDefender on the final frame — except throwOk, which hands over to b.caught', () => {
    for (const id of SCENE_FX_IDS) {
      const f = fxFrame(id, fxLength(id) - 1, 'me', 'NORMAL');
      expect(f.hideDefender).toBe(id === 'throwOk');
    }
  });
});

// ── throwOk vs throwFail ─────────────────────────────────────────────────
describe('throwOk vs throwFail', () => {
  it('differ in length, and throwOk has strictly more wobble frames than throwFail', () => {
    expect(fxLength('throwOk')).not.toBe(fxLength('throwFail'));
    const wobbleFrames = (id: 'throwOk' | 'throwFail'): number => {
      let n = 0;
      for (let t = 0; t < fxLength(id); t++) {
        const ball = fxFrame(id, t, 'me', 'NORMAL').particles.find((p) => p.sprite === 'ball');
        if (ball && ball.x !== FOE_ANCHOR.x) n++;
      }
      return n;
    };
    expect(wobbleFrames('throwOk')).toBeGreaterThan(wobbleFrames('throwFail'));
  });

  it('never calls Math.random — the id IS the already-rolled outcome', () => {
    const spy = vi.spyOn(Math, 'random');
    for (const id of ['throwOk', 'throwFail'] as const) {
      for (let t = 0; t < fxLength(id); t++) fxFrame(id, t, 'me', 'NORMAL');
    }
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('throwFail brings the mon back; throwOk hides it from frame 18 to the very last frame', () => {
    for (let t = 18; t < fxLength('throwOk'); t++) {
      expect(fxFrame('throwOk', t, 'me', 'NORMAL').hideDefender).toBe(true);
    }
    expect(fxFrame('throwFail', fxLength('throwFail') - 1, 'me', 'NORMAL').hideDefender).toBe(false);
  });
});

// ── QOL.2: wobble amplitude decay (13-battle-fx.md hard rule: the wobble
// reads the outcome, never decides it — pure function of t, no rng) ────────
describe('QOL.2 wobble amplitude', () => {
  const OLD_WOB = [0, -3, -4, -3, 0, 3, 4, 3, 0, 0, 0, 0];
  const ballX = (id: 'throwOk' | 'throwFail', t: number): number =>
    fxFrame(id, t, 'me', 'NORMAL').particles.find((p) => p.sprite === 'ball')!.x - FOE_ANCHOR.x;

  it('cycle 0 (amp 4) reproduces the pre-QOL.2 wobble shape exactly, both ids', () => {
    for (let w = 0; w < 12; w++) {
      expect(ballX('throwFail', 22 + w)).toBe(OLD_WOB[w]);
      expect(ballX('throwOk', 22 + w)).toBe(OLD_WOB[w]);
    }
  });

  it('throwOk wobble amplitude decays cycle over cycle (peak cycle 1 < cycle 0 < — cycle 2 < cycle 1)', () => {
    const cyclePeak = (cycle: number): number => {
      let max = 0;
      for (let w = cycle * 12; w < cycle * 12 + 12; w++) max = Math.max(max, Math.abs(ballX('throwOk', 22 + w)));
      return max;
    };
    const p0 = cyclePeak(0);
    const p1 = cyclePeak(1);
    const p2 = cyclePeak(2);
    expect(p1).toBeLessThan(p0);
    expect(p2).toBeLessThan(p1);
  });

  it('throwFail wobble amplitude decays cycle over cycle (2 cycles: peak 1 < peak 0)', () => {
    const cyclePeak = (cycle: number): number => {
      let max = 0;
      for (let w = cycle * 12; w < cycle * 12 + 12; w++) max = Math.max(max, Math.abs(ballX('throwFail', 22 + w)));
      return max;
    };
    expect(cyclePeak(1)).toBeLessThan(cyclePeak(0));
  });
});

// ── QOL.2: throwFail pop — the ball visibly bursts open, 2 frames ─────────
describe('QOL.2 throwFail pop', () => {
  it('t=46: ball present, sparks at the ±5 diagonals; t=47: ball gone, sparks at the ±8 diagonals', () => {
    const diagOffsets = (t: number): [number, number][] =>
      fxFrame('throwFail', t, 'me', 'NORMAL')
        .particles.filter((p) => p.sprite === 'spark')
        .map((p) => [p.x - FOE_ANCHOR.x, p.y - FOE_ANCHOR.y] as [number, number])
        .sort((a, b) => a[0] - b[0] || a[1] - b[1]);

    const f46 = fxFrame('throwFail', 46, 'me', 'NORMAL');
    expect(f46.particles.some((p) => p.sprite === 'ball')).toBe(true);
    expect(diagOffsets(46)).toEqual(
      [[-5, -5], [-5, 5], [5, -5], [5, 5]].sort((a, b) => a[0] - b[0] || a[1] - b[1]),
    );

    const f47 = fxFrame('throwFail', 47, 'me', 'NORMAL');
    expect(f47.particles.some((p) => p.sprite === 'ball')).toBe(false);
    expect(diagOffsets(47)).toEqual(
      [[-8, -8], [-8, 8], [8, -8], [8, 8]].sort((a, b) => a[0] - b[0] || a[1] - b[1]),
    );
  });

  it('t=48..56 is the five-point burst growing outward, r = min(12, 3 + (t-48))', () => {
    for (let t = 48; t <= 56; t++) {
      const f = fxFrame('throwFail', t, 'me', 'NORMAL');
      expect(f.particles.every((p) => p.sprite === 'spark')).toBe(true);
      expect(f.particles).toHaveLength(5);
      const r = Math.min(12, 3 + (t - 48));
      const centre = f.particles.find((p) => p.x === FOE_ANCHOR.x + r && p.y === FOE_ANCHOR.y);
      expect(centre).toBeTruthy();
    }
  });
});

// ── QOL.2: throwOk stops dead before the glow ──────────────────────────────
describe('QOL.2 throwOk stop-dead', () => {
  it('t=58 and t=59: exactly the ball, centred on FOE_ANCHOR, no stars yet', () => {
    for (const t of [58, 59]) {
      const f = fxFrame('throwOk', t, 'me', 'NORMAL');
      expect(f.particles).toHaveLength(1);
      expect(f.particles[0].sprite).toBe('ball');
      expect(f.particles[0].x).toBe(FOE_ANCHOR.x);
      expect(f.particles[0].y).toBe(FOE_ANCHOR.y);
    }
  });
});

// ── QOL.2: throwOk glow — palette-bright pulse before "Gotcha!" ───────────
describe('QOL.2 throwOk glow', () => {
  const starRadius = (t: number): number => {
    const star = fxFrame('throwOk', t, 'me', 'NORMAL').particles.find((p) => p.sprite === 'star')!;
    return Math.abs(star.x - FOE_ANCHOR.x);
  };

  it('star radius alternates 6/9 every 4 frames, starting at 6 for t=60..63', () => {
    expect(starRadius(60)).toBe(6);
    expect(starRadius(63)).toBe(6);
    expect(starRadius(64)).toBe(9);
    expect(starRadius(67)).toBe(9);
    expect(starRadius(68)).toBe(6);
  });

  it('ball carries the gold palette, stars carry the heal palette; exactly 4 stars + 1 ball at t=60', () => {
    const f = fxFrame('throwOk', 60, 'me', 'NORMAL');
    const ball = f.particles.filter((p) => p.sprite === 'ball');
    const stars = f.particles.filter((p) => p.sprite === 'star');
    expect(ball).toHaveLength(1);
    expect(stars).toHaveLength(4);
    expect(ball[0].pal).toEqual(OBJ_PAL['gold']);
    for (const s of stars) expect(s.pal).toEqual(OBJ_PAL['heal']);
  });

  it('the ball (and glow) stays visible through the final frame t=77', () => {
    const f = fxFrame('throwOk', fxLength('throwOk') - 1, 'me', 'NORMAL');
    expect(f.particles.some((p) => p.sprite === 'ball')).toBe(true);
    expect(f.particles.some((p) => p.sprite === 'star')).toBe(true);
  });
});

// ── faint ────────────────────────────────────────────────────────────────
describe('faint', () => {
  it('reaches dy>=40 by the final frame on both sides, dx===0 throughout (deliberately does not settle to 0)', () => {
    const len = fxLength('faint');
    for (const side of ['me', 'foe'] as const) {
      for (let t = 0; t < len; t++) {
        expect(fxFrame('faint', t, side, 'NORMAL').dx).toBe(0);
      }
      expect(fxFrame('faint', len - 1, side, 'NORMAL').dy).toBeGreaterThanOrEqual(40);
    }
  });
});

// ── heal ─────────────────────────────────────────────────────────────────
describe('heal', () => {
  it('emits >=3 sparks simultaneously at some frame, all sprite spark, never flashes', () => {
    let peak = 0;
    for (let t = 0; t < fxLength('heal'); t++) {
      const f = fxFrame('heal', t, 'me', 'NORMAL');
      expect(f.flash).toBe(false);
      for (const pt of f.particles) expect(pt.sprite).toBe('spark');
      peak = Math.max(peak, f.particles.length);
    }
    expect(peak).toBeGreaterThanOrEqual(3);
  });

  it('a spark rises (y decreases) over its own lifetime, above its spawn height', () => {
    // spark 0 spawns at t=0; sample early vs late in its 18-frame life.
    const early = fxFrame('heal', 1, 'me', 'NORMAL').particles[0];
    const late = fxFrame('heal', 16, 'me', 'NORMAL').particles[0];
    expect(late.y).toBeLessThan(early.y);
    expect(late.y).toBeLessThan(ME_ANCHOR.y); // risen above the healed mon's anchor
  });
});

// ── smoke ────────────────────────────────────────────────────────────────
describe('smoke', () => {
  it('reaches >=8 simultaneous puffs at its peak, all sprite puff', () => {
    let peak = 0;
    for (let t = 0; t < fxLength('smoke'); t++) {
      const f = fxFrame('smoke', t, 'me', 'NORMAL');
      for (const pt of f.particles) expect(pt.sprite).toBe('puff');
      peak = Math.max(peak, f.particles.length);
    }
    expect(peak).toBeGreaterThanOrEqual(8);
  });
});

// ── spriteShown ──────────────────────────────────────────────────────────
describe('spriteShown', () => {
  function fakeBattle(fx: BattleState['fx'], caught?: boolean): BattleState {
    return { fx, caught } as unknown as BattleState;
  }

  it('shows the fainting side at hp 0 while its faint fx is active', () => {
    const s = fakeBattle({ id: 'faint', t: 5, side: 'me', type: 'NORMAL', done: () => {} });
    expect(spriteShown(s, 'me', 0)).toBe(true);
  });

  it('hides the foe during throwOk\'s swallow (attacker side me, defender side foe)', () => {
    const s = fakeBattle({ id: 'throwOk', t: 30, side: 'me', type: 'NORMAL', done: () => {} });
    expect(spriteShown(s, 'foe', 999)).toBe(false);
  });

  // Regression: the throwOk timeline once released hideDefender at frame 74
  // while b.caught is only set when the effect ENDS, so the caught mon flashed
  // back on screen for the closing four frames. The suppression must overlap
  // the handover, so every frame from the swallow to the last one hides it.
  it('never lets the caught foe flash back between the last fx frame and b.caught', () => {
    for (let t = 18; t < fxLength('throwOk'); t++) {
      const s = fakeBattle({ id: 'throwOk', t, side: 'me', type: 'NORMAL', done: () => {} });
      expect(spriteShown(s, 'foe', 999)).toBe(false);
    }
  });

  it('hides the foe once b.caught is set, even with no active fx', () => {
    const s = fakeBattle(null, true);
    expect(spriteShown(s, 'foe', 999)).toBe(false);
  });

  it('falls back to hp>0 otherwise', () => {
    const s = fakeBattle(null);
    expect(spriteShown(s, 'me', 0)).toBe(false);
    expect(spriteShown(s, 'me', 1)).toBe(true);
  });
});

// ── integration: SODA plays heal, SMOKE BALL plays smoke, snapshots unchanged ─
describe('battle integration: item fx (seeded)', () => {
  beforeEach(() => {
    resetQuest();
    G.party = [makeMon(SPECIES.koffink, 5)];
    G.box = [];
  });

  it('SODA plays the heal fx before the "got back N HP" message', () => {
    setBattleRng(mulberry32(42));
    quest.items.push('SODA');
    G.party[0].hp = 1;
    startBattle('guard_voltorbb', () => {});
    settle();
    tap('down'); // 0->1
    tap('down'); // 1->2
    tap('down'); // 2->3 = ITEM
    tap('a'); // open item submenu
    tap('a'); // pick SODA — opens the target list (QOL.6)
    tap('a'); // confirm the active mon
    frame(); // shift the queued "Used SODA!" message into b.msg
    popMsg(); // pop it and run its after() — plays heal
    expect(b().fx).toBeTruthy();
    expect(b().fx!.id).toBe('heal');
    expect(b().fx!.side).toBe('me');
  });

  it('SMOKE BALL plays the smoke fx before the flee message', () => {
    setBattleRng(mulberry32(42));
    quest.items.push('SMOKE BALL');
    startBattle('guard_voltorbb', () => {});
    settle();
    tap('down');
    tap('down');
    tap('down'); // ITEM
    tap('a');
    tap('a'); // use SMOKE BALL
    frame();
    popMsg(); // pop "Popped a SMOKE BALL!" — plays smoke
    expect(b().fx).toBeTruthy();
    expect(b().fx!.id).toBe('smoke');
  });
});

// ── QOL.4: tweenHp — pure hp-bar tween (13-battle-fx.md draw-only rule) ────
describe('tweenHp', () => {
  it('is `from` at t=0 and `to` at t=len', () => {
    expect(tweenHp(1, 19, 0)).toBe(1);
    expect(tweenHp(1, 19, 20)).toBe(19);
  });

  it('clamps past len — stays at `to` for any t beyond the tween length', () => {
    expect(tweenHp(1, 19, 25)).toBe(19);
    expect(tweenHp(1, 19, 1000)).toBe(19);
  });

  it('honours a custom len', () => {
    expect(tweenHp(0, 10, 5, 10)).toBe(5);
  });

  it('rounds mid-tween (lerp(0,3,0.5)=1.5 -> 2)', () => {
    expect(tweenHp(0, 3, 10, 20)).toBe(2);
  });
});

// ── QOL.11: floatFrame — pure floating-damage-number timeline ─────────────
describe('floatFrame', () => {
  it('dy rises (more negative) as t advances: t=0/15/29', () => {
    expect(floatFrame(0).dy).toBe(-10);
    expect(floatFrame(15).dy).toBe(-14);
    expect(floatFrame(29).dy).toBe(-17);
  });

  it('shows every frame before t=20', () => {
    for (const t of [0, 5, 10, 19]) expect(floatFrame(t).show).toBe(true);
  });

  it('blinks on the (t & 2) === 0 pattern from t=20..29', () => {
    // pairs of on/off every 2 frames: 20-21 on, 22-23 off, 24-25 on, 26-27 off, 28-29 on
    expect(floatFrame(20).show).toBe(true);
    expect(floatFrame(21).show).toBe(true);
    expect(floatFrame(22).show).toBe(false);
    expect(floatFrame(23).show).toBe(false);
    expect(floatFrame(24).show).toBe(true);
    expect(floatFrame(25).show).toBe(true);
    expect(floatFrame(26).show).toBe(false);
    expect(floatFrame(27).show).toBe(false);
    expect(floatFrame(28).show).toBe(true);
    expect(floatFrame(29).show).toBe(true);
  });

  it('never shows at or beyond t=30', () => {
    for (const t of [30, 31, 40, 100]) expect(floatFrame(t).show).toBe(false);
  });

  // UX2.3: the default (boosted=false) path must be bit-identical to the
  // pre-UX2.3 shape — these pins re-confirm dy/show at the spec's named
  // sample points now that floatFrame takes a second param.
  it('default path (boosted=false / omitted) is unchanged at t=0/10/19/20/29/30', () => {
    expect(floatFrame(0).dy).toBe(-10);
    expect(floatFrame(10).dy).toBe(-12);
    expect(floatFrame(19).dy).toBe(-15);
    expect(floatFrame(20).dy).toBe(-15);
    expect(floatFrame(29).dy).toBe(-17);
    expect(floatFrame(30).dy).toBe(-18);
    expect(floatFrame(0).show).toBe(true);
    expect(floatFrame(10).show).toBe(true);
    expect(floatFrame(19).show).toBe(true);
    expect(floatFrame(20).show).toBe(true);
    expect(floatFrame(29).show).toBe(true);
    expect(floatFrame(30).show).toBe(false);
    // explicit boosted=false matches the omitted-arg default exactly.
    for (const t of [0, 10, 19, 20, 29, 30]) {
      expect(floatFrame(t, false)).toEqual(floatFrame(t));
    }
  });
});

// ── UX2.3: floatFrame(t, boosted) — super-effective float timeline ────────
describe('floatFrame (boosted, super-effective)', () => {
  it('dy rises further and slower than the default timeline: t=0/21/41', () => {
    expect(floatFrame(0, true).dy).toBe(-10);
    expect(floatFrame(21, true).dy).toBe(-10 - Math.floor((21 / FLOAT_LEN_SUPER) * FLOAT_RISE_SUPER));
    expect(floatFrame(21, true).dy).toBe(-15);
    expect(floatFrame(41, true).dy).toBe(-19); // approaching -10-FLOAT_RISE_SUPER (-20) but not there yet
  });

  it('never shows at or beyond t=FLOAT_LEN_SUPER (42)', () => {
    expect(floatFrame(42, true).show).toBe(false);
    expect(floatFrame(50, true).show).toBe(false);
  });

  it('shows every frame before the final-16 blink window (t < 26)', () => {
    for (const t of [0, 10, 20, 25]) expect(floatFrame(t, true).show).toBe(true);
  });

  it('blinks on the (t & 2) === 0 pattern through the final 16 frames (t=26..41)', () => {
    expect(floatFrame(26, true).show).toBe(false); // 26 & 2 !== 0
    expect(floatFrame(27, true).show).toBe(false); // 27 & 2 !== 0
    expect(floatFrame(28, true).show).toBe(true); // 28 & 2 === 0
    expect(floatFrame(29, true).show).toBe(true); // 29 & 2 === 0
    expect(floatFrame(41, true).show).toBe(true); // 41 & 2 === 0, still < 42
  });

  it('FLOAT_LEN/FLOAT_RISE stay the pre-UX2.3 default values', () => {
    expect(FLOAT_LEN).toBe(30);
    expect(FLOAT_RISE).toBe(8);
    expect(FLOAT_LEN_SUPER).toBe(42);
    expect(FLOAT_RISE_SUPER).toBe(10);
  });
});

// ── UX2.1: post-win xp fill timeline (PLAN "UX2.1 battle XP bar") ─────────
describe('xpFillFrame', () => {
  const single = [{ from: 0.25, to: 0.75 }];
  it('starts at the segment start and lerps toward its end', () => {
    expect(xpFillFrame(single, 0)).toEqual({ fill: 0.25, show: true, done: false });
    expect(xpFillFrame(single, XP_SEG_LEN / 2).fill).toBeCloseTo(0.5);
  });

  it('a single segment finishes with no flash window', () => {
    for (let t = 0; t < XP_SEG_LEN; t++) expect(xpFillFrame(single, t).show).toBe(true);
    const end = xpFillFrame(single, XP_SEG_LEN);
    expect(end.done).toBe(true);
    expect(end.fill).toBe(0.75);
  });

  const two = [
    { from: 0.5, to: 1 },
    { from: 0, to: 0.3 },
  ];
  it('holds fill at 1 and blinks show through the level-cross flash', () => {
    const shows = new Set<boolean>();
    for (let t = XP_SEG_LEN; t < XP_SEG_LEN + XP_FLASH_LEN; t++) {
      const f = xpFillFrame(two, t);
      expect(f.fill).toBe(1);
      expect(f.done).toBe(false);
      shows.add(f.show);
    }
    expect(shows).toEqual(new Set([true, false])); // it actually blinks
  });

  it('restarts the second segment and ends the journey on time', () => {
    const secondStart = XP_SEG_LEN + XP_FLASH_LEN;
    expect(xpFillFrame(two, secondStart).fill).toBe(0);
    const total = 2 * XP_SEG_LEN + XP_FLASH_LEN;
    expect(xpFillFrame(two, total - 1).done).toBe(false);
    expect(xpFillFrame(two, total)).toEqual({ fill: 0.3, show: true, done: true });
  });
});

describe('evolveFrame (UX2.4 cinematic timeline)', () => {
  it('holds the old sprite in full colour through the opening text', () => {
    expect(evolveFrame(0)).toEqual({ phase: 'hold', showNew: false, shade: 3, white: false });
    expect(evolveFrame(EVO_HOLD - 1)).toEqual({ phase: 'hold', showNew: false, shade: 3, white: false });
  });

  it('alternates silhouettes across the ramp on a shrinking period', () => {
    // HRD.11: the flip schedule (buildEvoFlips() in src/systems/battleFx.ts)
    // is pinned by SHAPE, not by its raw numbers — first flip at EVO_HOLD,
    // strictly increasing, never reaching EVO_RAMP_END. A deliberate re-time
    // (EVO_PERIOD_FROM/TO) must not force an edit here; the shrinking-gap
    // invariant is covered separately below.
    expect(EVO_FLIPS.length).toBeGreaterThan(2);
    expect(EVO_FLIPS[0]).toBe(EVO_HOLD);
    for (let i = 1; i < EVO_FLIPS.length; i++) {
      expect(EVO_FLIPS[i], `flip ${i} must strictly increase`).toBeGreaterThan(EVO_FLIPS[i - 1]);
    }
    expect(EVO_FLIPS[EVO_FLIPS.length - 1]).toBeLessThan(EVO_RAMP_END);

    // showNew flips true/false as each scheduled frame is crossed
    expect(evolveFrame(EVO_FLIPS[0])).toEqual({ phase: 'ramp', showNew: true, shade: 0, white: false });
    expect(evolveFrame(EVO_FLIPS[1] - 1)).toEqual({ phase: 'ramp', showNew: true, shade: 0, white: false });
    expect(evolveFrame(EVO_FLIPS[1])).toEqual({ phase: 'ramp', showNew: false, shade: 0, white: false });
    expect(evolveFrame(EVO_FLIPS[2])).toEqual({ phase: 'ramp', showNew: true, shade: 0, white: false });
    const lastIdx = EVO_FLIPS.length - 1;
    expect(evolveFrame(EVO_FLIPS[lastIdx])).toEqual({
      phase: 'ramp',
      showNew: EVO_FLIPS.length % 2 === 1, // odd count of flips crossed -> showing new
      shade: 0,
      white: false,
    });
  });

  it('accelerates: every gap is shorter than or equal to the one before it', () => {
    for (let i = 2; i < EVO_FLIPS.length; i++) {
      const prev = EVO_FLIPS[i - 1] - EVO_FLIPS[i - 2];
      const cur = EVO_FLIPS[i] - EVO_FLIPS[i - 1];
      expect(cur, `gap ${i} must not grow`).toBeLessThanOrEqual(prev);
    }
  });

  it('whites out between the ramp and the reveal', () => {
    expect(evolveFrame(EVO_RAMP_END)).toEqual({ phase: 'white', showNew: true, shade: 3, white: true });
    expect(evolveFrame(EVO_WHITE_END - 1)).toEqual({ phase: 'white', showNew: true, shade: 3, white: true });
  });

  it('develops the new sprite through two SLOW flat shades (UX2.4-FB re-pin)', () => {
    // deliberately re-pinned from 15f steps: Lyall's playtest wanted the
    // reveal slow against the accelerating ramp — 30f per shade, full
    // colour arriving WITH the done hold (see EVO_END below)
    expect(evolveFrame(EVO_WHITE_END)).toEqual({ phase: 'reveal', showNew: true, shade: 2, white: false });
    expect(evolveFrame(EVO_WHITE_END + EVO_REVEAL_STEP - 1)).toEqual({ phase: 'reveal', showNew: true, shade: 2, white: false });
    expect(evolveFrame(EVO_WHITE_END + EVO_REVEAL_STEP)).toEqual({ phase: 'reveal', showNew: true, shade: 1, white: false });
    expect(evolveFrame(EVO_END - 1)).toEqual({ phase: 'reveal', showNew: true, shade: 1, white: false });
  });

  it('reports done once fully revealed — battle.ts holds there for A (UX2.4-FB)', () => {
    // HRD.11: the ONE deliberate value pin for this timeline — everything
    // else in this describe block is derived from the exported constants, so
    // a re-time only needs a human to touch this one number (same pattern as
    // mon-data-lint.test.ts's pinned evolution thresholds).
    expect(EVO_END).toBe(305); // Lyall's pacing decision (UX2.4-FB)
    expect(evolveFrame(EVO_END)).toEqual({ phase: 'done', showNew: true, shade: 3, white: false });
    expect(evolveFrame(EVO_END + 999)).toEqual({ phase: 'done', showNew: true, shade: 3, white: false });
  });

  it('skips into the reveal, never into the whiteout or past the end', () => {
    expect(evolveFrame(EVO_SKIP_TO).phase).toBe('reveal');
    expect(EVO_SKIP_TO).toBeGreaterThan(EVO_WHITE_END - 1);
    expect(EVO_SKIP_TO).toBeLessThan(EVO_END);
  });

  it('arms the skip only after the opening text has been readable', () => {
    expect(EVO_SKIP_ARM).toBeGreaterThan(0);
    expect(EVO_SKIP_ARM).toBeLessThan(EVO_HOLD);
  });
});
