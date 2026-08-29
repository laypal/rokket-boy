// CH5.0 §2/§4 battle contracts, driven frame-by-frame like battle.test.ts
// (same engine stubs, its own file so the registry mutations stay local):
// the unwinnable fight — hits pass through, LEG IT is refused, the ITEM list
// carries the charm and not the SMOKE BALL, the charm ends it with onWin and
// no xp, a wipe is the clean loss — plus the music override and mon talk.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

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
import { startBattle, battleUpdate, setBattleRng, battleItems, type BattleState } from '../src/systems/battle';
import { ENCOUNTERS } from '../src/data/encounters';
import { SPECIES } from '../src/data/mons';
import { makeMon, maxHp } from '../src/systems/mon';
import { mulberry32 } from '../src/engine/rng';
import { quest, resetQuest } from '../src/systems/quest';
import { Audio2 } from '../src/engine/audio';
import type { ScriptStep } from '../src/types';

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
/** Every battle message seen, in order — popped by holding A then tapping it. */
const seen: string[] = [];
function popMsg(): void {
  const s = b();
  seen.push(s.msg!.lines.join(' '));
  const total = s.msg!.lines.join('').length;
  keys.down.add('a');
  let guard = 0;
  while (s.msgChars < total && guard++ < 500) frame();
  keys.down.delete('a');
  tap('a');
}
function settle(): void {
  let guard = 0;
  while (G.battle && guard++ < 300) {
    const s = G.battle;
    if (s.msg) popMsg();
    else if (s.queue.length || s.phase === 'slide' || s.phase === 'open' || s.phase === 'anim') frame();
    else return;
  }
  if (G.battle) throw new Error('settle(): battle never became interactive');
}

let follow: ScriptStep[] | null | undefined;
function begin(encId: string): void {
  follow = undefined;
  startBattle(encId, (f) => (follow = f));
}
/** From the root menu, open ITEM (index 3) and pick the first item. */
function useFirstItem(): void {
  settle();
  tap('down');
  tap('down');
  tap('down');
  tap('a');
  tap('a');
  settle();
}

const SPIRIT_WIN: ScriptStep[] = [{ setFlag: 'ch5Spirit' }];
const SPIRIT_LOSE: ScriptStep[] = [{ say: [['A whisper.']] }];

beforeEach(() => {
  resetQuest();
  seen.length = 0;
  G.party = [makeMon(SPECIES.koffink, 5)];
  G.box = [];
  G.lastHq = { map: 'hq', x: 9, y: 7 };
  G.battle = null;
  G.state = 'world';
  keys.down.clear();
  keys.pressed.clear();
  // A weak foe for the mechanics tests (koffink lv5 would normally flatten it)
  ENCOUNTERS.test_spirit = {
    foe: { species: 'voltorbb', lv: 3 },
    uncatchable: true,
    unwinnable: { item: 'BONE CHARM', hint: ['HINT: ITEM.'] },
    music: 'victory',
    winText: [],
    onWin: SPIRIT_WIN,
    onLose: SPIRIT_LOSE,
    onFlee: [],
  };
  // A crushing one for the wipe test
  ENCOUNTERS.test_spirit_strong = { ...ENCOUNTERS.test_spirit, foe: { species: 'arbok', lv: 40 } };
});
afterEach(() => {
  setBattleRng(Math.random);
  delete ENCOUNTERS.test_spirit;
  delete ENCOUNTERS.test_spirit_strong;
});

describe('unwinnable fight (CH5.0 §2)', () => {
  it('plays the encounter music instead of battle', () => {
    begin('test_spirit');
    expect(vi.mocked(Audio2.play)).toHaveBeenLastCalledWith('victory');
    begin('guard_voltorbb');
    expect(vi.mocked(Audio2.play)).toHaveBeenLastCalledWith('battle');
  });

  it('a hit passes straight through: foe hp untouched, the foe still gets its turn', () => {
    setBattleRng(mulberry32(7));
    begin('test_spirit');
    settle();
    const foeMax = maxHp(SPECIES.voltorbb, 3);
    expect(b().foe.hp).toBe(foeMax);
    tap('a'); // FIGHT
    tap('a'); // first move
    settle();
    expect(G.battle).not.toBeNull();
    expect(b().foe.hp).toBe(foeMax);
    expect(seen.some((m) => m.includes('passed right through'))).toBe(true);
    expect(seen.some((m) => m.startsWith('Wild VOLTORBB used'))).toBe(true); // it answered
    // CH5-FB: the hint is said at the open (after "Go!") and again after the pass-through
    const go = seen.indexOf('Go! KOFFINK!');
    expect(seen[go + 1]).toBe('HINT: ITEM.');
    expect(seen[seen.indexOf('But it passed right through!') + 1]).toBe('HINT: ITEM.');
  });

  it('LEG IT is refused and costs no turn', () => {
    setBattleRng(mulberry32(7));
    begin('test_spirit');
    settle();
    const hp = G.party[0].hp;
    for (let i = 0; i < 4; i++) tap('down'); // 0→4 = LEG IT
    tap('a');
    settle();
    expect(G.battle).not.toBeNull();
    expect(b().phase).toBe('menu');
    expect(G.party[0].hp).toBe(hp);
    expect(seen).toContain("Can't escape!");
  });

  it('SWIPE says it cannot be caught (uncatchable is required by the lint)', () => {
    setBattleRng(mulberry32(7));
    quest.items.push('ROKKET BALL');
    begin('test_spirit');
    settle();
    tap('down');
    tap('a');
    settle();
    expect(G.battle).not.toBeNull();
    expect(quest.items).toContain('ROKKET BALL');
  });

  it('the ITEM list carries the charm and hides the SMOKE BALL', () => {
    quest.items.push('SMOKE BALL', 'SODA', 'BONE CHARM', 'SILF SCOPE');
    begin('test_spirit');
    expect(battleItems().map((e) => e.id)).toEqual(['SODA', 'BONE CHARM']);
    begin('guard_voltorbb');
    expect(battleItems().map((e) => e.id)).toEqual(['SMOKE BALL', 'SODA']);
  });

  it('using the charm ends the fight with onWin, consumes it, and awards no xp', () => {
    setBattleRng(mulberry32(7));
    quest.items.push('BONE CHARM');
    begin('test_spirit');
    const xp = G.party[0].xp;
    useFirstItem();
    expect(G.battle).toBeNull();
    expect(G.state).toBe('world');
    expect(follow).toBe(SPIRIT_WIN);
    expect(quest.items).not.toContain('BONE CHARM');
    expect(G.party[0].xp).toBe(xp);
    expect(seen).toContain('The BONE CHARM glows softly...');
    expect(seen.some((m) => m.includes('fainted'))).toBe(false);
  });

  it('a wipe is the clean loss: coins kept, party healed in place, onLose as the epilogue', () => {
    setBattleRng(mulberry32(7));
    quest.coins = 500;
    begin('test_spirit_strong');
    let turns = 0;
    settle();
    while (G.battle && turns++ < 30) {
      tap('a');
      tap('a');
      settle();
    }
    expect(G.battle).toBeNull();
    expect(quest.coins).toBe(500);
    expect(G.party[0].hp).toBe(maxHp(SPECIES.koffink, 5));
    expect(G.state).toBe('world');
    expect(follow).toBe(SPIRIT_LOSE);
    expect(seen.some((m) => m.startsWith('Overwhelmed...'))).toBe(true);
    expect(seen.some((m) => m.includes('disgrace'))).toBe(false);
  });
});

describe('mon talk (CH5.0 §4)', () => {
  beforeEach(() => {
    SPECIES.talky = {
      ...SPECIES.koffink,
      id: 'talky',
      name: 'TALKY',
      talk: [['TALKY: One.'], ['TALKY: Two.']],
    };
    G.party = [makeMon(SPECIES.talky, 5)];
  });
  afterEach(() => {
    delete SPECIES.talky;
  });

  it('speaks right after "Go!" at battle open and rotates through its pages across battles', () => {
    setBattleRng(mulberry32(42));
    begin('guard_voltorbb');
    settle();
    const go = seen.indexOf('Go! TALKY!');
    expect(go).toBeGreaterThanOrEqual(0);
    expect(seen[go + 1]).toBe('TALKY: One.');
    expect(quest.vars.talk_talky).toBe(1);
    G.battle = null;
    seen.length = 0;
    begin('guard_voltorbb');
    settle();
    expect(seen[seen.indexOf('Go! TALKY!') + 1]).toBe('TALKY: Two.');
    G.battle = null;
    seen.length = 0;
    begin('guard_voltorbb');
    settle();
    expect(seen[seen.indexOf('Go! TALKY!') + 1]).toBe('TALKY: One.'); // wrapped
  });

  it('speaks on a switch-in too, and a mute species says nothing', () => {
    setBattleRng(mulberry32(42));
    G.party = [makeMon(SPECIES.koffink, 5), makeMon(SPECIES.talky, 5)];
    begin('guard_voltorbb');
    settle();
    expect(seen.some((m) => m.startsWith('TALKY:'))).toBe(false);
    tap('down');
    tap('down'); // SWITCH
    tap('a');
    tap('down'); // slot 1
    tap('a');
    settle();
    const go = seen.indexOf('Go! TALKY!');
    expect(go).toBeGreaterThanOrEqual(0);
    expect(seen[go + 1]).toBe('TALKY: One.');
  });
});
