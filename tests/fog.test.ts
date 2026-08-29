// CH5.0 §1: the fog predicate, spec-derived by hand from dx² + dy² ≤ r² + r.
import { describe, it, expect } from 'vitest';
import { fogVisible, fogActive, FOG_RADIUS } from '../src/systems/fog';
import { SCOPE_ITEM } from '../src/data/items';

describe('fogVisible (r = 3)', () => {
  it('the radius is 3', () => {
    expect(FOG_RADIUS).toBe(3);
  });

  // Hand-derived: r² + r = 12. Row |dy|=0 → |dx| ≤ 3 (7 tiles); |dy|=1 →
  // dx² ≤ 11 → |dx| ≤ 3 (7); |dy|=2 → dx² ≤ 8 → |dx| ≤ 2 (5); |dy|=3 →
  // dx² ≤ 3 → |dx| ≤ 1 (3). Total 7 + 2·7 + 2·5 + 2·3 = 37.
  it('lights exactly 37 tiles in a rounded lantern', () => {
    const rows: Record<number, number> = {};
    let total = 0;
    for (let dy = -5; dy <= 5; dy++) {
      for (let dx = -5; dx <= 5; dx++) {
        if (fogVisible(dx, dy)) {
          rows[dy] = (rows[dy] ?? 0) + 1;
          total++;
        }
      }
    }
    expect(total).toBe(37);
    expect(rows).toEqual({ [-3]: 3, [-2]: 5, [-1]: 7, 0: 7, 1: 7, 2: 5, 3: 3 });
  });

  it('the cardinal reach is 3, the diagonal reach is 2, and the corners of the 7×7 are dark', () => {
    expect(fogVisible(3, 0)).toBe(true);
    expect(fogVisible(0, -3)).toBe(true);
    expect(fogVisible(4, 0)).toBe(false);
    expect(fogVisible(2, 2)).toBe(true);
    expect(fogVisible(3, 1)).toBe(true);
    expect(fogVisible(3, 2)).toBe(false);
    expect(fogVisible(3, 3)).toBe(false);
  });

  it('honours an explicit radius', () => {
    expect(fogVisible(1, 0, 1)).toBe(true);
    expect(fogVisible(1, 1, 1)).toBe(true); // 2 ≤ 1 + 1
    expect(fogVisible(2, 0, 1)).toBe(false);
  });
});

describe('fogActive', () => {
  it('is on for a fog map without the SCOPE', () => {
    expect(fogActive({ fog: true }, [])).toBe(true);
    expect(fogActive({ fog: true }, ['SODA', 'SMOKE BALL'])).toBe(true);
  });

  it('lifts the moment the SCOPE is in the PACK', () => {
    expect(fogActive({ fog: true }, ['SODA', SCOPE_ITEM])).toBe(false);
  });

  it('never applies to a map without the flag, SCOPE or not', () => {
    expect(fogActive({}, [])).toBe(false);
    expect(fogActive({}, [SCOPE_ITEM])).toBe(false);
  });
});
