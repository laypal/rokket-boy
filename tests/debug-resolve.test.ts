import { describe, it, expect } from 'vitest';
import { findPartyMon, xpToReach, hpFromArg } from '../src/systems/debugResolve';
import { xpForLevel, LEVEL_CAP } from '../src/systems/mon';
import type { MonInstance } from '../src/types';

function makeInstance(over: Partial<MonInstance> = {}): MonInstance {
  return { species: 'testmon', lv: 5, hp: 20, xp: 125, moves: [], ...over };
}

describe('findPartyMon', () => {
  const party = [makeInstance({ species: 'koffink' }), makeInstance({ species: 'ratikatt' })];

  it('resolves by slot number', () => {
    expect(findPartyMon(party, 1)).toBe(party[1]);
  });

  it('resolves by species id, first match', () => {
    expect(findPartyMon(party, 'ratikatt')).toBe(party[1]);
  });

  it('returns undefined on a slot miss', () => {
    expect(findPartyMon(party, 9)).toBeUndefined();
  });

  it('returns undefined on a species miss', () => {
    expect(findPartyMon(party, 'nope')).toBeUndefined();
  });
});

describe('xpToReach', () => {
  it('is one short of the level floor', () => {
    expect(xpToReach(2)).toBe(xpForLevel(2) - 1);
    expect(xpToReach(16)).toBe(4095); // UX2.5 evolution recipe (PLAN)
  });

  it('clamps the low end to 2 (never below the intended next-win boundary)', () => {
    expect(xpToReach(1)).toBe(xpToReach(2));
    expect(xpToReach(0)).toBe(xpToReach(2));
  });

  it('clamps the high end to LEVEL_CAP', () => {
    expect(xpToReach(LEVEL_CAP)).toBe(xpForLevel(LEVEL_CAP) - 1);
    expect(xpToReach(51)).toBe(xpToReach(LEVEL_CAP));
  });
});

describe('hpFromArg', () => {
  it('reads <= 1 as a fraction of max', () => {
    expect(hpFromArg(100, 0.25)).toBe(25);
    expect(hpFromArg(100, 1)).toBe(1); // documented: 1 = 1 hp, not full
  });

  it('reads > 1 as an absolute value', () => {
    expect(hpFromArg(100, 40)).toBe(40);
  });

  it('clamps to [0, max]', () => {
    expect(hpFromArg(50, 200)).toBe(50);
    expect(hpFromArg(50, -5)).toBe(0);
  });
});
