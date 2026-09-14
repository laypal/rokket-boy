// F46 ART.3 — the foe's idle bob. idleFrame is the one decision the draw
// path makes: which front to decode this frame. Pure, so no battle harness.
import { describe, it, expect } from 'vitest';
import { idleFrame } from '../src/systems/battleDraw';
import { SPECIES } from '../src/data/mons';
import type { BattleState } from '../src/systems/battle';

const idle = { fx: null } as unknown as BattleState;
const mid = { fx: { id: 'tackle', t: 3, side: 'me', type: 'NORMAL' } } as unknown as BattleState;

describe('idleFrame (ART.3)', () => {
  it('alternates front/front2 every 16 frames for a species with front2', () => {
    const sp = SPECIES.koffink;
    expect(sp.front2).toBeTruthy();
    for (let f = 0; f < 64; f++) {
      const want = (f >> 4) & 1 ? sp.front2 : sp.front;
      expect(idleFrame(sp, idle, f), `frame ${f}`).toBe(want);
    }
    expect(idleFrame(sp, idle, 15)).toBe(sp.front);
    expect(idleFrame(sp, idle, 16)).toBe(sp.front2);
    expect(idleFrame(sp, idle, 31)).toBe(sp.front2);
    expect(idleFrame(sp, idle, 32)).toBe(sp.front);
  });

  it('a species without front2 never changes', () => {
    const sp = SPECIES.ratikatt;
    expect(sp.front2).toBeUndefined();
    for (let f = 0; f < 64; f++) expect(idleFrame(sp, idle, f)).toBe(sp.front);
  });

  it('holds frame 1 while an fx timeline owns the sprite', () => {
    const sp = SPECIES.koffink;
    for (let f = 0; f < 64; f++) expect(idleFrame(sp, mid, f)).toBe(sp.front);
  });
});
