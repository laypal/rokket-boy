import { describe, it, expect } from 'vitest';
import {
  LEVEL_CAP, xpForLevel, levelForXp, maxHp, makeMon, movesAtLevel, gainXp, dexCount, evolveMon,
  xpProgress, xpFillSegs,
} from '../src/systems/mon';
import { S } from '../src/data/sprites';
import type { MonSpecies } from '../src/types';

// Synthetic species so these tests never depend on shipped data.
function makeSpecies(over: Partial<MonSpecies> = {}): MonSpecies {
  const rows = S('0123');
  return {
    id: 'testmon',
    name: 'TESTMON',
    type: ['POISON'],
    baseHp: 40,
    atk: 65,
    def: 95,
    spd: 35,
    moves: [
      { lv: 1, move: 'tackle' },
      { lv: 1, move: 'smog' },
      { lv: 6, move: 'screech' },
      { lv: 12, move: 'sludge' },
    ],
    front: rows,
    back: rows,
    pal: ['#000', '#555', '#aaa', '#fff'],
    catchRate: 0.45,
    ...over,
  };
}

describe('xp curve (medium-fast, lv³)', () => {
  it('total xp to be level lv is lv³', () => {
    expect(xpForLevel(1)).toBe(1);
    expect(xpForLevel(10)).toBe(1000);
    expect(xpForLevel(50)).toBe(125000);
  });

  it('levelForXp inverts the curve at exact boundaries', () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(7)).toBe(1);
    expect(levelForXp(8)).toBe(2);
    expect(levelForXp(26)).toBe(2);
    expect(levelForXp(27)).toBe(3);
    expect(levelForXp(124999)).toBe(49);
    expect(levelForXp(125000)).toBe(50);
  });

  it('caps at LEVEL_CAP 50', () => {
    expect(LEVEL_CAP).toBe(50);
    expect(levelForXp(999999999)).toBe(50);
  });
});

describe('maxHp', () => {
  it('follows floor(2·baseHp·lv/100) + lv + 10', () => {
    const sp = makeSpecies(); // baseHp 40
    expect(maxHp(sp, 5)).toBe(19);   // 4 + 5 + 10
    expect(maxHp(sp, 50)).toBe(100); // 40 + 50 + 10
  });

  it('grows monotonically with level', () => {
    const sp = makeSpecies();
    for (let lv = 2; lv <= 50; lv++) {
      expect(maxHp(sp, lv)).toBeGreaterThan(maxHp(sp, lv - 1));
    }
  });
});

describe('movesAtLevel', () => {
  it('returns moves learnable at the level, newest first capped at 4', () => {
    const sp = makeSpecies();
    expect(movesAtLevel(sp, 1)).toEqual(['tackle', 'smog']);
    expect(movesAtLevel(sp, 6)).toEqual(['tackle', 'smog', 'screech']);
    expect(movesAtLevel(sp, 12)).toEqual(['tackle', 'smog', 'screech', 'sludge']);
  });

  it('keeps only the 4 most recently learned when the table is longer', () => {
    const sp = makeSpecies({
      moves: [
        { lv: 1, move: 'a' }, { lv: 1, move: 'b' }, { lv: 3, move: 'c' },
        { lv: 5, move: 'd' }, { lv: 9, move: 'e' },
      ],
    });
    expect(movesAtLevel(sp, 9)).toEqual(['b', 'c', 'd', 'e']);
    expect(movesAtLevel(sp, 8)).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('makeMon', () => {
  it('builds a full-health instance with level-appropriate moves and xp', () => {
    const sp = makeSpecies();
    const mon = makeMon(sp, 5);
    expect(mon.species).toBe('testmon');
    expect(mon.lv).toBe(5);
    expect(mon.hp).toBe(maxHp(sp, 5));
    expect(mon.xp).toBe(125);
    expect(mon.moves).toEqual(['tackle', 'smog']);
    expect(mon.status).toBeUndefined();
  });

  it('clamps the requested level into [1, 50]', () => {
    const sp = makeSpecies();
    expect(makeMon(sp, 0).lv).toBe(1);
    expect(makeMon(sp, 99).lv).toBe(50);
  });
});

describe('gainXp', () => {
  it('accumulates xp without events when no level is reached', () => {
    const sp = makeSpecies();
    const mon = makeMon(sp, 5); // 125 xp; next level at 216
    const events = gainXp(mon, sp, 10);
    expect(events).toEqual([]);
    expect(mon.xp).toBe(135);
    expect(mon.lv).toBe(5);
  });

  it('levels up, grows hp by the max-hp delta, and reports the event', () => {
    const sp = makeSpecies();
    const mon = makeMon(sp, 5);
    const hpBefore = mon.hp;
    const events = gainXp(mon, sp, 216 - 125); // exactly to lv 6
    expect(mon.lv).toBe(6);
    expect(mon.hp).toBe(hpBefore + (maxHp(sp, 6) - maxHp(sp, 5)));
    expect(events).toHaveLength(1);
    expect(events[0].lv).toBe(6);
  });

  // Re-pinned 2026-08-09 (Lyall, UX2.1-FB live QA): leveling up now FULL-HEALS.
  // The original pin ("keeps damage across a level up") was the Gen-1 rule;
  // the level-up moment is the reward beat, so it restores the mon outright.
  it('full-heals on level up (UX2.1-FB rule)', () => {
    const sp = makeSpecies();
    const mon = makeMon(sp, 5);
    mon.hp -= 7;
    gainXp(mon, sp, 1000);
    expect(mon.hp).toBe(maxHp(sp, mon.lv));
  });

  it('keeps damage when no level is gained', () => {
    const sp = makeSpecies();
    const mon = makeMon(sp, 5); // 125 xp; next level at 216
    mon.hp -= 7;
    gainXp(mon, sp, 10);
    expect(mon.hp).toBe(maxHp(sp, 5) - 7);
  });

  it('a multi-level jump also lands at the new full hp', () => {
    const sp = makeSpecies();
    const mon = makeMon(sp, 4);
    mon.hp = 1;
    gainXp(mon, sp, xpForLevel(7) - mon.xp);
    expect(mon.lv).toBe(7);
    expect(mon.hp).toBe(maxHp(sp, 7));
  });

  it('auto-learns a new move when the mon has fewer than 4', () => {
    const sp = makeSpecies();
    const mon = makeMon(sp, 5); // knows tackle, smog
    const events = gainXp(mon, sp, xpForLevel(6) - mon.xp);
    expect(events[0].learned).toEqual(['screech']);
    expect(events[0].offered).toEqual([]);
    expect(mon.moves).toEqual(['tackle', 'smog', 'screech']);
  });

  it('offers instead of auto-learning when 4 moves are known', () => {
    const sp = makeSpecies({
      moves: [
        { lv: 1, move: 'a' }, { lv: 1, move: 'b' }, { lv: 2, move: 'c' },
        { lv: 3, move: 'd' }, { lv: 6, move: 'e' },
      ],
    });
    const mon = makeMon(sp, 5); // knows a,b,c,d (4 moves)
    const events = gainXp(mon, sp, xpForLevel(6) - mon.xp);
    expect(events[0].learned).toEqual([]);
    expect(events[0].offered).toEqual(['e']);
    expect(mon.moves).toEqual(['a', 'b', 'c', 'd']); // unchanged — UI decides in 1b
  });

  it('emits one event per level on a multi-level jump', () => {
    const sp = makeSpecies();
    const mon = makeMon(sp, 4);
    const events = gainXp(mon, sp, xpForLevel(7) - mon.xp);
    expect(events.map((e) => e.lv)).toEqual([5, 6, 7]);
    expect(mon.moves).toContain('screech'); // lv 6 move picked up on the way
  });

  it('never exceeds the level cap and clamps xp there', () => {
    const sp = makeSpecies();
    const mon = makeMon(sp, 49);
    const events = gainXp(mon, sp, 99999999);
    expect(mon.lv).toBe(50);
    expect(mon.xp).toBe(xpForLevel(50));
    expect(events.map((e) => e.lv)).toEqual([50]);
  });
});

// SPR.0: gainXp signals a pending evolution on every qualifying level-up event
// so the caller (battle/UI, not this module) can offer the swap.
describe('gainXp evolvesTo signal (SPR.0)', () => {
  it('carries evolvesTo on the event that reaches the threshold level', () => {
    const sp = makeSpecies({ evolvesTo: { id: 'evolved', lv: 20 } });
    const mon = makeMon(sp, 19); // xp = 19^3 = 6859
    const events = gainXp(mon, sp, xpForLevel(20) - mon.xp); // lands exactly on lv 20
    expect(mon.lv).toBe(20);
    expect(events).toHaveLength(1);
    expect(events[0].lv).toBe(20);
    expect(events[0].evolvesTo).toBe('evolved');
  });

  it('does not carry evolvesTo below the threshold level', () => {
    const sp = makeSpecies({ evolvesTo: { id: 'evolved', lv: 20 } });
    const mon = makeMon(sp, 18); // xp = 18^3 = 5832
    const events = gainXp(mon, sp, xpForLevel(19) - mon.xp); // lands exactly on lv 19
    expect(mon.lv).toBe(19);
    expect(events).toHaveLength(1);
    expect(events[0].lv).toBe(19);
    expect(events[0].evolvesTo).toBeUndefined();
  });

  it('re-carries evolvesTo on every qualifying event in a multi-level jump', () => {
    const sp = makeSpecies({ evolvesTo: { id: 'evolved', lv: 20 } });
    const mon = makeMon(sp, 19); // xp = 19^3 = 6859
    const events = gainXp(mon, sp, xpForLevel(21) - mon.xp); // lv 19 -> 21 in one call
    expect(mon.lv).toBe(21);
    expect(events.map((e) => e.lv)).toEqual([20, 21]);
    // both the lv-20 and the lv-21 event carry it — a mon that has not
    // refused is offered on every qualifying level (UX2.4 removed the
    // re-offer only for mon.noEvolve)
    expect(events[0].evolvesTo).toBe('evolved');
    expect(events[1].evolvesTo).toBe('evolved');
  });

  it('returns no events (hence no evolution offer) once already at the level cap', () => {
    const sp = makeSpecies({ evolvesTo: { id: 'evolved', lv: 20 } });
    const mon = makeMon(sp, 50); // xp = 50^3 = 125000, already capped
    const events = gainXp(mon, sp, 99999999);
    expect(mon.lv).toBe(50);
    expect(mon.xp).toBe(xpForLevel(50));
    expect(events).toEqual([]);
  });

  it('never carries evolvesTo once the mon has permanently refused (UX2.4)', () => {
    const sp = makeSpecies({ evolvesTo: { id: 'evolved', lv: 20 } });
    const mon = makeMon(sp, 19);
    mon.noEvolve = true;
    const events = gainXp(mon, sp, xpForLevel(20) - mon.xp);
    expect(mon.lv).toBe(20);
    expect(events).toHaveLength(1);
    expect(events[0].evolvesTo).toBeUndefined();
  });

  it('keeps the refusal across a multi-level jump — there is no second offer', () => {
    const sp = makeSpecies({ evolvesTo: { id: 'evolved', lv: 20 } });
    const mon = makeMon(sp, 19);
    mon.noEvolve = true;
    const events = gainXp(mon, sp, xpForLevel(25) - mon.xp);
    expect(mon.lv).toBe(25);
    expect(events.every((e) => e.evolvesTo === undefined)).toBe(true);
  });

  it('leaves everything except the offer alone for a refused mon', () => {
    const sp = makeSpecies({ evolvesTo: { id: 'evolved', lv: 20 } });
    const mon = makeMon(sp, 19);
    mon.noEvolve = true;
    gainXp(mon, sp, xpForLevel(20) - mon.xp);
    expect(mon.species).toBe(sp.id);
    expect(mon.hp).toBe(maxHp(sp, 20)); // UX2.1-FB full heal still applies
  });
});

// SPR.0: evolveMon swaps species and carries hp across via the max-hp delta,
// leaving lv/xp/moves/nick/status alone (moves are NOT rewritten to the new
// species' learnset — that stays a battle/UI concern).
describe('evolveMon (SPR.0)', () => {
  it('swaps species, carries hp by the max-hp delta, keeps lv/xp/moves/nick', () => {
    const from = makeSpecies({ id: 'baseform', baseHp: 40 });
    const to = makeSpecies({
      id: 'evolved',
      baseHp: 55,
      // deliberately NOT the mon's current moveset, so we can prove moves
      // are carried as-is and not rewritten to this learnset.
      moves: [{ lv: 1, move: 'zap' }, { lv: 1, move: 'crush' }],
    });
    // maxHp(from, 20) = floor(2*40*20/100) + 20 + 10 = floor(1600/100) + 30 = 16 + 30 = 46
    // maxHp(to,   20) = floor(2*55*20/100) + 20 + 10 = floor(2200/100) + 30 = 22 + 30 = 52
    // delta = 52 - 46 = 6
    const mon = {
      species: 'baseform',
      lv: 20,
      hp: 30,
      xp: xpForLevel(20),
      moves: ['tackle', 'smog'],
      nick: 'BUDDY',
    };
    evolveMon(mon, from, to);
    expect(mon.species).toBe('evolved');
    expect(mon.hp).toBe(36); // 30 + 6
    expect(mon.lv).toBe(20);
    expect(mon.xp).toBe(xpForLevel(20));
    expect(mon.moves).toEqual(['tackle', 'smog']); // unchanged, not the to-species learnset
    expect(mon.nick).toBe('BUDDY');
  });

  it('clamps hp to a minimum of 1 when the max-hp delta is negative', () => {
    const from = makeSpecies({ id: 'baseform', baseHp: 100 });
    const to = makeSpecies({ id: 'evolved', baseHp: 10 });
    // maxHp(from, 20) = floor(2*100*20/100) + 20 + 10 = floor(4000/100) + 30 = 40 + 30 = 70
    // maxHp(to,   20) = floor(2*10*20/100)  + 20 + 10 = floor(400/100)  + 30 = 4  + 30 = 34
    // delta = 34 - 70 = -36
    const mon = {
      species: 'baseform', lv: 20, hp: 1, xp: xpForLevel(20), moves: ['tackle'],
    };
    evolveMon(mon, from, to);
    expect(mon.hp).toBe(1); // 1 + (-36) clamped, never 0 or negative
  });
});

describe('dexCount (§4.7 GRUNTDEX)', () => {
  // Minimal registry fixture shared by this block: a base -> evolved chain,
  // plus an unrelated single-stage species and species nobody owns.
  // Evolution lines are LINEAR — no two species share an evolvesTo target
  // (matches real data; a diamond would make the backwards walk ambiguous).
  const base = makeSpecies({ id: 'koffink', evolvesTo: { id: 'voltorbb', lv: 20 } });
  const evolved = makeSpecies({ id: 'voltorbb' });
  const lonewolf = makeSpecies({ id: 'lonewolf' });
  const unowned = makeSpecies({ id: 'unowned', evolvesTo: { id: 'unowned2', lv: 20 } });
  const registry = {
    koffink: base, voltorbb: evolved, lonewolf, unowned,
  };

  it('counts unique species across party + box, dupes once', () => {
    expect(dexCount([], registry)).toBe(0);
    expect(dexCount([{ species: 'lonewolf' }], registry)).toBe(1);
    expect(
      dexCount(
        [{ species: 'koffink' }, { species: 'koffink' }, { species: 'lonewolf' }],
        registry,
      ),
    ).toBe(2);
  });

  it('credits a pre-evolution reachable by walking evolvesTo backwards', () => {
    // Owning ONLY the evolved form still credits the base form.
    expect(dexCount([{ species: 'voltorbb' }], registry)).toBe(2);
  });

  it('stays stable across an evolution (owning both forms is still 2)', () => {
    expect(
      dexCount([{ species: 'koffink' }, { species: 'voltorbb' }], registry),
    ).toBe(2);
  });

  it('does not credit a registry species nobody owns', () => {
    // "unowned" evolves (into "unowned2") and exists in the registry, but
    // nobody holds its line here — owning only "lonewolf" (a single-stage
    // species) must not pull it into the count.
    expect(dexCount([{ species: 'lonewolf' }], registry)).toBe(1);
  });

  it('counts 1 for a species with no evolvesTo', () => {
    expect(dexCount([{ species: 'lonewolf' }], registry)).toBe(1);
  });
});

// ── UX2.1/MNU.1: xp progress + fill journey (PLAN "UX2.1 battle XP bar") ──
describe('xpProgress', () => {
  it('is 0 at a fresh level', () => {
    expect(xpProgress({ lv: 5, xp: xpForLevel(5) })).toBe(0);
  });

  it('approaches (but never reaches) 1 just below the next level', () => {
    const p = xpProgress({ lv: 5, xp: xpForLevel(6) - 1 });
    expect(p).toBeGreaterThan(0.9);
    expect(p).toBeLessThan(1);
  });

  it('reads full at LEVEL_CAP', () => {
    expect(xpProgress({ lv: LEVEL_CAP, xp: xpForLevel(LEVEL_CAP) })).toBe(1);
  });

  it('clamps xp below the level floor to 0', () => {
    expect(xpProgress({ lv: 5, xp: 100 })).toBe(0);
  });
});

describe('xpFillSegs', () => {
  it('a gain inside one level is a single segment', () => {
    expect(xpFillSegs(5, 125, 5, 157)).toEqual([{ from: 0, to: 32 / 91 }]);
  });

  it('a one-level cross fills to 1, then restarts at 0', () => {
    expect(xpFillSegs(5, 125, 6, 250)).toEqual([
      { from: 0, to: 1 },
      { from: 0, to: 34 / 127 },
    ]);
  });

  it('starts from the current partial progress', () => {
    expect(xpFillSegs(5, 157, 6, 250)).toEqual([
      { from: 32 / 91, to: 1 },
      { from: 0, to: 34 / 127 },
    ]);
  });

  it('a two-level cross yields three segments', () => {
    expect(xpFillSegs(5, 125, 7, 350)).toEqual([
      { from: 0, to: 1 },
      { from: 0, to: 1 },
      { from: 0, to: 7 / 169 },
    ]);
  });

  it('a gain landing exactly on LEVEL_CAP ends with a full final segment', () => {
    const segs = xpFillSegs(LEVEL_CAP - 1, xpForLevel(LEVEL_CAP - 1), LEVEL_CAP, xpForLevel(LEVEL_CAP));
    expect(segs[segs.length - 1]).toEqual({ from: 0, to: 1 });
  });
});
