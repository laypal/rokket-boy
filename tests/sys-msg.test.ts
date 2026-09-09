// The system toast (CH2.10) waits for the player (2026-09-08, Lyall's
// playthrough): after a Giovanni briefing the NEW JOB toast sat on a 150-
// frame timer with no affordance, so the natural A press re-opened Giovanni.
// Now a toast holds until A — consumed, `interact()` does not run — or until
// the player starts a step. Movement is never blocked (the juice rule).
// Plus: every NEW JOB toast in hq.ts is announced by the `job` chime.
import { describe, it, expect, beforeEach, vi } from 'vitest';

const keys = { pressed: new Set<string>(), down: new Set<string>() };
vi.mock('../src/engine/input', () => ({
  Input: {
    held: (k: string): boolean => keys.down.has(k),
    hit: (k: string): boolean => keys.pressed.has(k),
    endFrame: (): void => keys.pressed.clear(),
    dirHeld: (): 'up' | null => (keys.down.has('up') ? 'up' : null),
  },
}));

import { G } from '../src/state';
import { worldHooks, worldUpdate, sysMsgUp } from '../src/systems/world';
import { MAPS } from '../src/data/maps';
import { hqScripts } from '../src/data/dialog/hq';
import type { MapDef, MapId, ScriptStep } from '../src/types';

// a 5×4 room; the player stands at (2,2) facing up at the free tile (2,1),
// which also carries a sign — the observable proof that interact() ran
const ROOM: MapDef = {
  id: 'corner' as MapId,
  name: 'TEST',
  pal: MAPS.corner.pal,
  music: MAPS.corner.music,
  grid: ['#####', '#   #', '#   #', '#####'].map((r) => r.split('')),
  w: 5,
  h: 4,
  npcs: [],
  warps: {},
  signs: { '2,1': [['A SIGN.']] },
  items: {},
  scripts: {},
};

function frame(): void {
  worldUpdate();
  keys.pressed.clear();
}

beforeEach(() => {
  keys.pressed.clear();
  keys.down.clear();
  G.map = ROOM;
  G.state = 'world';
  G.dialog = null;
  G.fade = 0;
  G.fadeDir = 0;
  G.frame = 0;
  Object.assign(G.player, { x: 2, y: 2, dir: 'up', moving: false, prog: 0, turnLock: 0 });
  if (sysMsgUp()) {
    keys.pressed.add('a');
    frame();
  }
});

describe('the system toast waits for the player', () => {
  it('A while a toast is up dismisses it and is CONSUMED — interact() does not run', () => {
    worldHooks.sysMsg(['NEW JOB!', 'CHECK STATUS.']);
    expect(sysMsgUp()).toBe(true);
    keys.pressed.add('a');
    frame();
    expect(sysMsgUp()).toBe(false);
    expect(G.dialog).toBeNull();
    // the NEXT A reaches the world as usual
    keys.pressed.add('a');
    frame();
    expect(G.dialog).not.toBeNull();
  });

  it('a toast never times out on its own', () => {
    worldHooks.sysMsg(['EGG FOUND!']);
    for (let i = 0; i < 400; i++) frame();
    expect(sysMsgUp()).toBe(true);
  });

  it('starting a step dismisses it, so a toast you walk away from never eats a later A', () => {
    worldHooks.sysMsg(['GOT 40 COINS!']);
    keys.down.add('up');
    frame();
    expect(G.player.moving).toBe(true);
    expect(sysMsgUp()).toBe(false);
  });

  it('a later sysMsg replaces the one still up', () => {
    worldHooks.sysMsg(['ONE']);
    worldHooks.sysMsg(['TWO']);
    expect(sysMsgUp()).toBe(true);
    keys.pressed.add('a');
    frame();
    expect(sysMsgUp()).toBe(false);
  });
});

describe('every NEW JOB toast in hq.ts is announced by the job chime', () => {
  function check(steps: ScriptStep[], label: string, seen: { n: number }): void {
    steps.forEach((s, i) => {
      if ('sysMsg' in s && s.sysMsg[0] === 'NEW JOB!') {
        seen.n++;
        const prev = steps[i - 1];
        expect(prev && 'sfx' in prev && prev.sfx === 'job', `${label}: NEW JOB toast #${seen.n} has no job chime right before it`).toBe(true);
      }
      if ('if' in s) {
        check(s.then, label, seen);
        check(s.else ?? [], label, seen);
      }
      if ('choice' in s) {
        check(s.choice.yes, label, seen);
        check(s.choice.no ?? [], label, seen);
      }
    });
  }
  it('six briefings, six chimes', () => {
    const seen = { n: 0 };
    for (const [key, steps] of Object.entries(hqScripts)) check(steps, key, seen);
    expect(seen.n).toBe(6);
  });
});
