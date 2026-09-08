// F38 JCE.4 lint: every chest that opens in content (a `setTile … '%'` in
// an interaction script) glints first — a `{ fx: { id: 'spark', at: [x, y] } }`
// earlier in the same branch, at the same coords. Reload-repair `enter`
// scripts re-apply the emptied tile silently and are exempt: nothing is
// opening there.
import { describe, it, expect } from 'vitest';
import { MAPS } from '../src/data/maps';
import type { ScriptStep } from '../src/types';

/** In-order flatten: then/else and yes/no branches inline where they sit. */
function flatten(steps: ScriptStep[]): ScriptStep[] {
  const out: ScriptStep[] = [];
  for (const s of steps) {
    out.push(s);
    if ('if' in s) out.push(...flatten(s.then), ...flatten(s.else ?? []));
    if ('choice' in s) out.push(...flatten(s.choice.yes), ...flatten(s.choice.no ?? []));
  }
  return out;
}

describe('JCE.4: chests glint before they open', () => {
  it("every setTile to '%' outside an enter script is preceded by fx spark at the same tile", () => {
    let chests = 0;
    for (const map of Object.values(MAPS)) {
      for (const [key, steps] of Object.entries(map.scripts)) {
        if (key === 'enter') continue;
        const flat = flatten(steps);
        flat.forEach((s, i) => {
          if (!('setTile' in s) || s.setTile[2] !== '%') return;
          chests++;
          const [x, y] = s.setTile;
          const glint = flat.slice(0, i).some((p) => 'fx' in p && p.fx.id === 'spark' && p.fx.at?.[0] === x && p.fx.at?.[1] === y);
          expect(glint, `${map.id} ${key}: chest at (${x},${y}) opens without a spark`).toBe(true);
        });
      }
    }
    expect(chests).toBeGreaterThanOrEqual(4); // vault, moonDig, lav3, syl5
  });
});
