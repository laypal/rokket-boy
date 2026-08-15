// Pure roll math for the wild-encounter system (card CH2.1, TDD red phase).
// `src/systems/encounter.ts` does not exist yet — every import below is
// EXPECTED to fail at collection until the implementation lands. Frozen
// contract (task card): rate roll -> weighted species pick -> level roll,
// each a strict `<` bound; a miss consumes exactly 1 rng call, a hit exactly 3.
import { describe, it, expect } from 'vitest';
import { mulberry32, type Rng } from '../src/engine/rng';
import {
  rollEncounter, wildEncounter, stepEncounter, setEncounterRng, ENCOUNTER_TILE,
} from '../src/systems/encounter';
import { SPECIES } from '../src/data/mons';
import { MAPS } from '../src/data/maps';
import type { EncounterTable } from '../src/types';

const seq = (vals: number[]): Rng => {
  let i = 0;
  return () => vals[i++];
};

describe('ENCOUNTER_TILE', () => {
  it('is the reserved ~ tile char', () => {
    expect(ENCOUNTER_TILE).toBe('~');
  });
});

describe('rollEncounter — rate roll', () => {
  it('rate 0 never hits, across several seeds', () => {
    const table: EncounterTable = { rate: 0, entries: [{ species: 'koffink', weight: 1, lv: [3, 3] }] };
    for (const seed of [1, 2, 3, 42, 999]) {
      expect(rollEncounter(table, mulberry32(seed))).toBeNull();
    }
  });

  it('rate 1 always hits, across several seeds', () => {
    const table: EncounterTable = { rate: 1, entries: [{ species: 'koffink', weight: 1, lv: [3, 3] }] };
    for (const seed of [1, 2, 3, 42, 999]) {
      expect(rollEncounter(table, mulberry32(seed))).not.toBeNull();
    }
  });

  it('the rate bound is strict: rng() < rate', () => {
    const table: EncounterTable = { rate: 0.3, entries: [{ species: 'koffink', weight: 1, lv: [3, 3] }] };
    expect(rollEncounter(table, seq([0.29, 0, 0]))).not.toBeNull(); // 0.29 < 0.3 -> hit
    expect(rollEncounter(table, seq([0.3]))).toBeNull();            // 0.3 < 0.3 is false -> miss
  });
});

describe('rollEncounter — weighted species pick', () => {
  const table: EncounterTable = {
    rate: 1,
    entries: [
      { species: 'koffink', weight: 1, lv: [3, 3] },   // A — cumulative 1
      { species: 'voltorbb', weight: 3, lv: [3, 3] },  // B — cumulative 4
    ],
  };

  it('honours weight, including the boundary (strict r < cumulative)', () => {
    // totalWeight = 4; 0.24*4 = 0.96 < 1 (A's cumulative) -> A
    expect(rollEncounter(table, seq([0, 0.24, 0]))?.species).toBe('koffink');
    // 0.25*4 = 1.0, NOT < 1 (A's cumulative) -> falls through to B
    expect(rollEncounter(table, seq([0, 0.25, 0]))?.species).toBe('voltorbb');
  });
});

describe('rollEncounter — level roll', () => {
  it('is inclusive at both ends via rollInt(lo, hi, rng)', () => {
    const table: EncounterTable = { rate: 1, entries: [{ species: 'koffink', weight: 1, lv: [3, 6] }] };
    expect(rollEncounter(table, seq([0, 0, 0]))?.lv).toBe(3);
    expect(rollEncounter(table, seq([0, 0, 0.9999]))?.lv).toBe(6);
  });
});

describe('rollEncounter — rng call-count contract', () => {
  it('a miss consumes exactly 1 rng call', () => {
    const table: EncounterTable = { rate: 0.3, entries: [{ species: 'koffink', weight: 1, lv: [3, 6] }] };
    let calls = 0;
    const under = seq([0.5]);
    rollEncounter(table, () => {
      calls++;
      return under();
    });
    expect(calls).toBe(1);
  });

  it('a hit consumes exactly 3 rng calls', () => {
    const table: EncounterTable = { rate: 0.3, entries: [{ species: 'koffink', weight: 1, lv: [3, 6] }] };
    let calls = 0;
    const under = seq([0.1, 0.5, 0.5]);
    rollEncounter(table, () => {
      calls++;
      return under();
    });
    expect(calls).toBe(3);
  });
});

describe('wildEncounter', () => {
  it('builds a trainer-less EncounterDef shell around the roll', () => {
    const enc = wildEncounter({ species: 'voltorbb', lv: 7 });
    expect(Object.prototype.hasOwnProperty.call(enc, 'trainer')).toBe(false);
    expect(enc.foe).toEqual({ species: 'voltorbb', lv: 7 });
    expect(enc.winText).toEqual([]);
    expect(enc.onWin).toEqual([]);
    expect(enc.onLose).toEqual([]);
    expect(enc.onFlee).toEqual([]);
  });
});

describe('stepEncounter', () => {
  it('returns null and rolls nothing on a map with no encounters table', () => {
    let calls = 0;
    setEncounterRng(() => {
      calls++;
      return 0;
    });
    expect(stepEncounter(MAPS.hq)).toBeNull();
    expect(calls).toBe(0);
  });
});

// This lint iterates whatever MAPS contains today — vacuously green until
// CH2.2/CH2.3 add `encounters` tables to the moon maps. That's expected: it
// still can't run right now because the whole file fails to collect on the
// missing `encounter.ts` import above (see the CH2.1 task card).
describe('encounter table content lint (vacuous until CH2 maps land)', () => {
  it('every map with an encounters table is well-formed', () => {
    for (const map of Object.values(MAPS)) {
      const enc = map.encounters;
      if (!enc) continue;
      expect(enc.entries.length, `${map.id} encounters.entries non-empty`).toBeGreaterThan(0);
      expect(enc.rate, `${map.id} encounters.rate >= 0`).toBeGreaterThanOrEqual(0);
      expect(enc.rate, `${map.id} encounters.rate <= 1`).toBeLessThanOrEqual(1);
      for (const e of enc.entries) {
        expect(SPECIES[e.species], `${map.id} encounter species ${e.species} exists`).toBeDefined();
        expect(e.weight, `${map.id} encounter weight > 0`).toBeGreaterThan(0);
        expect(e.lv[0], `${map.id} encounter lv lo >= 1`).toBeGreaterThanOrEqual(1);
        expect(e.lv[0], `${map.id} encounter lv lo <= hi`).toBeLessThanOrEqual(e.lv[1]);
      }
    }
  });
});
