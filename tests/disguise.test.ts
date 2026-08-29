// CH4.1 — the disguise, pure half (contract frozen in .paul/PLAN.md, CH4.0 §3).
// Flags in, flags out: no engine imports, so it unit-tests in Node. The
// world wiring (SELECT toggle, sighting gate, palette swap) is covered by
// tests/world.test.ts's heatTick block and e2e/chapter4.spec.ts.
import { describe, it, expect, beforeEach } from 'vitest';
import { carryingLoot, disguiseCovers, toggleDisguise, dropDisguise } from '../src/systems/disguise';
import { quest, resetQuest } from '../src/systems/quest';

const ship = { disguise: 'sailor' };
const hq = {};

beforeEach(() => resetQuest());

describe('carryingLoot', () => {
  it('is the window between the safe opening and the chief falling', () => {
    expect(carryingLoot(quest.flags)).toBe(false);
    quest.flags.ch4Safe = true;
    expect(carryingLoot(quest.flags)).toBe(true);
    quest.flags.ch4Done = true;
    expect(carryingLoot(quest.flags)).toBe(false);
  });
});

describe('disguiseCovers', () => {
  it('needs the suit ON', () => {
    expect(disguiseCovers(quest.flags, false)).toBe(false);
    quest.flags.disguised = true;
    expect(disguiseCovers(quest.flags, false)).toBe(true);
  });
  it('does not cover a running player (B held)', () => {
    quest.flags.disguised = true;
    expect(disguiseCovers(quest.flags, true)).toBe(false);
  });
  it('does not cover a player carrying the loot', () => {
    quest.flags.disguised = true;
    quest.flags.ch4Safe = true;
    expect(disguiseCovers(quest.flags, false)).toBe(false);
    quest.flags.ch4Done = true;
    expect(disguiseCovers(quest.flags, false)).toBe(true);
  });
});

describe('toggleDisguise', () => {
  it('refuses without the suit, and on a map with no disguise declared', () => {
    expect(toggleDisguise(quest.flags, ship)).toBe(false);
    expect(quest.flags.disguised).toBe(false);
    quest.flags.ch4Suit = true;
    expect(toggleDisguise(quest.flags, hq)).toBe(false);
    expect(quest.flags.disguised).toBe(false);
  });
  it('flips on and off where the map allows it', () => {
    quest.flags.ch4Suit = true;
    expect(toggleDisguise(quest.flags, ship)).toBe(true);
    expect(quest.flags.disguised).toBe(true);
    expect(toggleDisguise(quest.flags, ship)).toBe(true);
    expect(quest.flags.disguised).toBe(false);
  });
});

describe('dropDisguise', () => {
  it('takes the suit off on landing anywhere it is not declared, keeps it where it is', () => {
    quest.flags.ch4Suit = true;
    quest.flags.disguised = true;
    dropDisguise(quest.flags, ship);
    expect(quest.flags.disguised).toBe(true);
    dropDisguise(quest.flags, hq);
    expect(quest.flags.disguised).toBe(false);
  });
});
