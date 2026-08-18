// SIDE.2 — PICKPOCKET content: the DEALER's script (interpreter + fake
// hooks, the training-content idiom) and the screen's own state machine
// (the menu.test.ts tap harness, real openCardFlip/cardFlipUpdate with
// renderer/input/audio mocked out — cardFlipScreen.ts touches the DOM via
// those modules, which Node's vitest environment can't provide).
import { describe, it, expect, beforeEach, vi } from 'vitest';

const keys = { pressed: new Set<string>() };

vi.mock('../src/engine/renderer', () => ({
  drawWindow: vi.fn(),
  text: vi.fn(),
  rect: vi.fn(),
  W: 160,
  H: 144,
}));
vi.mock('../src/engine/audio', () => ({
  Audio2: { play: vi.fn(), sfx: vi.fn(), setVolume: vi.fn(), setMuted: vi.fn(), volume: 1, muted: false },
}));
vi.mock('../src/engine/input', () => ({
  Input: {
    held: (): boolean => false,
    hit: (k: string): boolean => keys.pressed.has(k),
    endFrame: (): void => keys.pressed.clear(),
    dirHeld: (): null => null,
  },
}));

import { runScript, type ScriptHooks } from '../src/systems/script';
import { cornerScripts } from '../src/data/dialog/corner';
import { quest, resetQuest } from '../src/systems/quest';
import { G } from '../src/state';
import { openCardFlip, cardFlipUpdate, cardFlipDraw } from '../src/systems/cardFlipScreen';
import { payout } from '../src/systems/cardFlip';

function dealerHooks(answer: boolean) {
  const events: string[] = [];
  let pages: string[][] | null = null;
  const hooks: ScriptHooks = {
    say: (_p, done) => { events.push('say'); done(); },
    battle: (id, done) => { events.push('battle:' + id); done(null); },
    warp: (w, done) => { events.push('warp:' + w[0]); done(); },
    sfx: () => {},
    music: () => {},
    setTile: () => {},
    addWarp: () => {},
    locker: (done) => done(),
    shop: (id, done) => { events.push('shop:' + id); done(); },
    endScreen: () => events.push('endScreen'),
    rankUp: (_r, done) => { events.push('rankUp'); done(); },
    heat: (n) => events.push('heat:' + n),
    giveMon: () => {},
    npcRun: (id, done) => { events.push('npcRun:' + id); done(); },
    healParty: () => {},
    sysMsg: () => events.push('sysMsg'),
    jobs: (done) => { events.push('jobs'); done(); },
    cardFlip: (done) => { events.push('cardFlip'); done(); },
    choice: (p, done) => { events.push('choice'); pages = p; done(answer); },
  };
  return { hooks, events, getPages: () => pages };
}

beforeEach(() => resetQuest());

describe('npc:dealer script (SIDE.2)', () => {
  it('the choice hook receives both pages; YES opens cardFlip once', () => {
    const { hooks, events, getPages } = dealerHooks(true);
    runScript(cornerScripts['npc:dealer'], hooks);
    expect(events).toEqual(['say', 'choice', 'cardFlip']);
    expect(getPages()).toEqual([
      ['...But I run a', 'little game.', 'PICKPOCKET.'],
      ['30 COINS a hand.', 'Sit down?'],
    ]);
  });

  it('NO refuses: cardFlip never called, the refusal page is said', () => {
    const { hooks, events } = dealerHooks(false);
    runScript(cornerScripts['npc:dealer'], hooks);
    expect(events).toEqual(['say', 'choice', 'say']);
    expect(events).not.toContain('cardFlip');
  });
});

describe('cardFlipScreen — round trip (input harness, seed 7 pin)', () => {
  function frame(): void {
    cardFlipUpdate();
    keys.pressed.clear();
  }
  function tap(k: string): void {
    keys.pressed.add(k);
    frame();
  }

  beforeEach(() => {
    keys.pressed.clear();
  });

  it('DEAL charges STAKE, flipping card 0 (LOOT) then bagging pays out and flipWon tracks it, then LEAVE returns to world', () => {
    quest.coins = 100;
    let doneCalls = 0;
    openCardFlip(() => { doneCalls++; }, 7);
    expect(G.state).toBe('cardflip');

    tap('a'); // DEAL
    expect(quest.coins).toBe(70);
    expect(quest.vars.flipHands).toBe(1);
    // The dealt hand seeds off (openSeed + flipHands) — DEAL just bumped
    // flipHands to 1, so this hand is newHand(mulberry32(7 + 1)) = seed 8,
    // NOT the mulberry32(7) board pinned in cardFlip.test.ts. Card 0 of
    // seed 8 is also LOOT (value 10) — verified by hand alongside the
    // seed-7 pin when this test was written.

    tap('a'); // flip card 0 — LOOT value 10 (seed 8's board)
    tap('b'); // bag
    const p = payout(10);
    expect(quest.coins).toBe(70 + p);
    expect(quest.vars.flipWon).toBe(p);

    // draw must not throw mid-'result' with the grid face-up
    expect(() => cardFlipDraw(['#000', '#111', '#222', '#333'])).not.toThrow();

    tap('a'); // result -> deal
    tap('b'); // deal (sel 0, DEAL row) -> B always leaves
    expect(G.state).toBe('world');
    expect(doneCalls).toBe(1);
  });

  it('DEAL with fewer than STAKE coins flashes NEED 30 COINS. and takes no coins', () => {
    quest.coins = 10;
    openCardFlip(() => {}, 7);
    tap('a'); // DEAL, refused
    expect(quest.coins).toBe(10);
    expect(quest.vars.flipHands).toBeUndefined();
    expect(G.state).toBe('cardflip'); // still on the deal screen
  });
});
