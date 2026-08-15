// Save system (plan §4.6, acceptance §4.9; V2/heat chain per plan §4.8 and
// .paul/PLAN.md "1f.2: SaveV2 + V1→V2 migration"): round-trip, migrate() per
// version, storage-adapter fallback + once-only warning, and load-time map
// repair. save.ts is engine-free so everything here runs in plain Node.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Flags, MapDef, MonInstance } from '../src/types';
import { G } from '../src/state';
import { quest, resetQuest } from '../src/systems/quest';
import { MAPS } from '../src/data/maps';
import {
  type SaveStorage,
  type SaveV1,
  type SaveV2,
  type SaveV3,
  type HeatSaveEntry,
  setSaveStorage,
  sessionOnlyWarning,
  snapshot,
  writeSave,
  readSave,
  hasSave,
  migrate,
  applySave,
  repairItemBalls,
} from '../src/systems/save';
import { SAVE_KEY } from '../src/systems/save';
import { swapParty } from '../src/systems/menu';
import type { JobContract } from '../src/systems/jobs';
import { SPECIES } from '../src/data/mons';
import { maxHp, gainXp, xpForLevel } from '../src/systems/mon';

function fakeStorage(persistent = true): SaveStorage & { data: string | null } {
  const s = {
    data: null as string | null,
    read: () => s.data,
    write: (d: string) => {
      s.data = d;
    },
    persistent,
  };
  return s;
}

function mon(species: string, lv: number, hp = 10): MonInstance {
  return { species, lv, hp, xp: 0, moves: ['tackle'] };
}

function resetG(): void {
  G.party = [mon('koffink', 5, 19)];
  G.box = [];
  G.playSeconds = 0;
  G.map = MAPS.hq;
  G.player.x = 9;
  G.player.y = 7;
  G.heatState = {};
}

beforeEach(() => {
  setSaveStorage(fakeStorage());
  resetQuest();
  resetG();
});

describe('snapshot', () => {
  it('captures quest + game state as a plain SaveV1', () => {
    quest.flags.briefed = true;
    quest.coins = 123;
    quest.eggs.add('jackpot');
    quest.vars.slotSpins = 7;
    quest.items = ['SODA', 'SODA'];
    G.party = [mon('koffink', 6, 15)];
    G.box = [mon('voltorbb', 4)];
    G.map = MAPS.corner;
    G.player.x = 3;
    G.player.y = 4;
    G.playSeconds = 61.98;
    const s = snapshot();
    expect(s.version).toBe(3);
    expect(s.heat).toEqual({});
    expect(s.flags.briefed).toBe(true);
    expect(s.coins).toBe(123);
    expect(s.eggs).toEqual(['jackpot']);
    expect(s.vars).toEqual({ slotSpins: 7 });
    expect(s.items).toEqual(['SODA', 'SODA']);
    expect(s.party).toEqual([mon('koffink', 6, 15)]);
    expect(s.box).toEqual([mon('voltorbb', 4)]);
    expect(s.rank).toBe('GRUNT');
    expect(s.mapId).toBe('corner');
    expect(s.x).toBe(3);
    expect(s.y).toBe(4);
    expect(s.playSeconds).toBe(61); // floored
  });

  it('copies, not references — later mutation must not leak into the snapshot', () => {
    const s = snapshot();
    G.party[0].hp = 1;
    quest.items.push('SODA');
    quest.flags.briefed = true;
    expect(s.party[0].hp).toBe(19);
    expect(s.items).toEqual([]);
    expect(s.flags.briefed).toBe(false);
  });
});

describe('write/read/apply round-trip', () => {
  it('restores quest and game state exactly', () => {
    quest.flags.guardBeaten = true;
    quest.coins = 555;
    quest.eggs.add('konami');
    quest.vars.slotSpins = 3;
    quest.items = ['ROKKET BALL'];
    G.party = [mon('koffink', 7, 12), mon('voltorbb', 4)];
    G.box = [mon('koffink', 5)];
    G.playSeconds = 40;
    writeSave();
    // wreck everything, then load
    resetQuest();
    resetG();
    const save = readSave();
    expect(save).not.toBeNull();
    applySave(save!);
    expect(quest.flags.guardBeaten).toBe(true);
    expect(quest.coins).toBe(555);
    expect(quest.eggs.has('konami')).toBe(true);
    expect(quest.vars.slotSpins).toBe(3);
    expect(quest.items).toEqual(['ROKKET BALL']);
    expect(quest.rank).toBe('GRUNT');
    expect(G.party).toEqual([mon('koffink', 7, 12), mon('voltorbb', 4)]);
    expect(G.box).toEqual([mon('koffink', 5)]);
    expect(G.playSeconds).toBe(40);
  });

  it('QOL.8: swapped party order round-trips through writeSave/applySave', () => {
    G.party = [mon('koffink', 7, 12), mon('voltorbb', 4)];
    swapParty(G.party, 0, 1);
    expect(G.party).toEqual([mon('voltorbb', 4), mon('koffink', 7, 12)]);
    writeSave();
    resetQuest();
    resetG();
    const save = readSave();
    expect(save).not.toBeNull();
    applySave(save!);
    expect(G.party).toEqual([mon('voltorbb', 4), mon('koffink', 7, 12)]);
  });

  it('hasSave flips once a save is written', () => {
    expect(hasSave()).toBe(false);
    writeSave();
    expect(hasSave()).toBe(true);
  });

  it('corrupt JSON reads as no save', () => {
    const s = fakeStorage();
    s.data = '{not json';
    setSaveStorage(s);
    expect(readSave()).toBeNull();
    expect(hasSave()).toBe(false);
  });
});

describe('migrate', () => {
  it('passes a valid v1 through and fills optional fields', () => {
    const min = {
      version: 1,
      flags: snapshot().flags,
      party: [mon('koffink', 5)],
      coins: 0,
      mapId: 'hq',
      x: 1,
      y: 2,
    };
    const out = migrate(min);
    expect(out).not.toBeNull();
    expect(out!.box).toEqual([]);
    expect(out!.items).toEqual([]);
    expect(out!.rank).toBe('GRUNT');
    expect(out!.playSeconds).toBe(0);
    expect(out!.eggs).toEqual([]);
    expect(out!.vars).toEqual({});
  });

  it('rejects unknown versions (no downgrade guessing)', () => {
    // v2 is now valid — the fixture moves to v3, preserving the test's
    // intent (no downgrade guessing / no future-version guessing).
    const v4 = { ...snapshot(), version: 4 };
    expect(migrate(v4)).toBeNull();
  });

  it('rejects structural garbage', () => {
    expect(migrate(null)).toBeNull();
    expect(migrate('save')).toBeNull();
    expect(migrate({})).toBeNull();
    expect(migrate({ version: 1, party: [] })).toBeNull(); // empty party
    expect(migrate({ ...snapshot(), mapId: 'moon' })).toBeNull(); // unknown map
  });
});

describe('migrate — V2 chain (1f.2)', () => {
  it('upgrades a valid V1 blob to V2 with empty heat, all fields carried', () => {
    const v1: Omit<SaveV1, 'version'> & { version: 1 } = {
      version: 1,
      flags: { ...quest.flags, briefed: true },
      party: [mon('koffink', 6, 15)],
      box: [mon('voltorbb', 4)],
      items: ['SODA'],
      coins: 42,
      rank: 'AGENT',
      mapId: 'corner',
      x: 3,
      y: 4,
      playSeconds: 61,
      eggs: ['jackpot'],
      vars: { slotSpins: 7 },
    };
    const out = migrate(v1);
    expect(out).not.toBeNull();
    expect(out!.version).toBe(3);
    expect(out!.heat).toEqual({});
    expect(out!.flags.briefed).toBe(true);
    expect(out!.party).toEqual(v1.party);
    expect(out!.box).toEqual(v1.box);
    expect(out!.items).toEqual(v1.items);
    expect(out!.coins).toBe(42);
    expect(out!.rank).toBe('AGENT');
    expect(out!.mapId).toBe('corner');
    expect(out!.x).toBe(3);
    expect(out!.y).toBe(4);
    expect(out!.playSeconds).toBe(61);
    expect(out!.eggs).toEqual(['jackpot']);
    expect(out!.vars).toEqual({ slotSpins: 7 });
  });

  it('preserves a populated V2 heat blob through migrate and a storage round-trip', () => {
    const entry: HeatSaveEntry = { stage: 2, decayAt: 45, lockdownAt: null };
    const heat: SaveV2['heat'] = { corner: entry };
    // snapshot() with G.heatState set would also populate heat (see the 1f.4
    // round-trip test below); here we drive migrate/storage with an explicit blob.
    const v2 = { ...snapshot(), heat, version: 2 } as unknown as SaveV2;
    const out = migrate(v2);
    expect(out).not.toBeNull();
    expect(out!.version).toBe(3); // migrate always lands on the latest chain
    expect(out!.heat).toEqual(heat);

    // write/read round-trip through fakeStorage, driving the real V2 blob
    // (not snapshot(), which can't populate heat until 1f.4 wires G.heatState)
    const s = fakeStorage();
    setSaveStorage(s);
    s.data = JSON.stringify(v2);
    const loaded = readSave();
    expect(loaded).not.toBeNull();
    expect(loaded!.heat).toEqual(heat);
  });

  it('defaults heat to {} when the V2 blob has garbage or missing heat', () => {
    const base = snapshot();
    const garbageHeat = migrate({ ...base, heat: 'garbage' });
    expect(garbageHeat).not.toBeNull();
    expect(garbageHeat!.heat).toEqual({});

    const missingHeat = { ...base } as Partial<SaveV3>;
    delete missingHeat.heat;
    const out = migrate(missingHeat);
    expect(out).not.toBeNull();
    expect(out!.heat).toEqual({});
  });

  it('rejects structural garbage and future versions', () => {
    expect(migrate(null)).toBeNull();
    expect(migrate({})).toBeNull();
    expect(migrate({ ...snapshot(), version: 4 })).toBeNull();
  });
});

describe('migrate — V3 chain (SIDE.1 job board)', () => {
  const contract: JobContract = { kind: 'fetch', slot: 0, item: 'SODA', need: 2, payout: 170, base: 0 };

  it('upgrades a V2 blob (no job field) to V3 with job: null', () => {
    const v2 = { ...snapshot(), version: 2 as const } as Record<string, unknown>;
    delete v2.job;
    const out = migrate(v2);
    expect(out).not.toBeNull();
    expect(out!.version).toBe(3);
    expect(out!.job).toBeNull();
  });

  it('round-trips an active contract through write/read/apply (the card BDD reload case)', () => {
    quest.job = { ...contract };
    writeSave();
    resetQuest();
    expect(quest.job).toBeNull();
    const loaded = readSave();
    expect(loaded).not.toBeNull();
    applySave(loaded!);
    expect(quest.job).toEqual(contract);
  });

  it('a hunt contract keeps its base through the round-trip (progress stays honest)', () => {
    quest.vars.jobKos = 5;
    quest.job = { kind: 'hunt', slot: 1, need: 3, payout: 155, base: 5 };
    writeSave();
    resetQuest();
    const loaded = readSave();
    applySave(loaded!);
    expect(quest.job).toEqual({ kind: 'hunt', slot: 1, need: 3, payout: 155, base: 5 });
    expect(quest.vars.jobKos).toBe(5);
  });

  it('a job blob missing slot (pre-FB shape) loads with slot 0', () => {
    const legacy = { kind: 'fetch', item: 'SODA', need: 2, payout: 170, base: 0 };
    const out = migrate({ ...snapshot(), job: legacy });
    expect(out).not.toBeNull();
    expect(out!.job).toEqual({ ...legacy, slot: 0 });
  });

  it('lenient on garbage job blobs — structurally invalid → null, save survives', () => {
    for (const bad of ['yes', 7, { kind: 'raid' }, { kind: 'fetch' }, []]) {
      const out = migrate({ ...snapshot(), job: bad });
      expect(out).not.toBeNull();
      expect(out!.job).toBeNull();
    }
  });
});

describe('heat serialization (1f.4)', () => {
  it('snapshot serializes G.heatState and applySave restores it', () => {
    G.heatState = {
      corner: { stage: 3, decayAt: 90, lockdownAt: 80 },
      vault: { stage: 1, decayAt: 30, lockdownAt: null },
    };
    const s = snapshot();
    expect(s.heat).toEqual({
      corner: { stage: 3, decayAt: 90, lockdownAt: 80 },
      vault: { stage: 1, decayAt: 30, lockdownAt: null },
    });

    // full write/read/apply round-trip repopulates G.heatState
    writeSave();
    G.heatState = {};
    const loaded = readSave();
    expect(loaded).not.toBeNull();
    applySave(loaded!);
    expect(G.heatState).toEqual({
      corner: { stage: 3, decayAt: 90, lockdownAt: 80 },
      vault: { stage: 1, decayAt: 30, lockdownAt: null },
    });
  });

  it('snapshot drops guardPositions (unserialized until 1f.6) but keeps the timers', () => {
    G.heatState = { corner: { stage: 2, decayAt: 50, lockdownAt: null } };
    const s = snapshot();
    expect(s.heat.corner).toEqual({ stage: 2, decayAt: 50, lockdownAt: null });
    expect(s.heat.corner).not.toHaveProperty('guardPositions');
  });

  it('applySave ignores a saved guardPositions blob (1f.6 re-derives placement)', () => {
    const heat: SaveV2['heat'] = {
      corner: { stage: 2, decayAt: 50, lockdownAt: null, guardPositions: { g1: { x: 3, y: 4 } } },
    };
    applySave({ ...snapshot(), heat });
    expect(G.heatState.corner).toEqual({ stage: 2, decayAt: 50, lockdownAt: null });
  });
});

describe('storage fallback warning (§0.4)', () => {
  it('warns exactly once when storage is non-persistent', () => {
    setSaveStorage(fakeStorage(false));
    expect(sessionOnlyWarning()).toBe(true);
    expect(sessionOnlyWarning()).toBe(false);
  });

  it('never warns on persistent storage', () => {
    setSaveStorage(fakeStorage(true));
    expect(sessionOnlyWarning()).toBe(false);
    expect(sessionOnlyWarning()).toBe(false);
  });
});

describe('writeSave/readSave crash guard (HRD.1)', () => {
  it('a throwing write() does not throw out of writeSave, and the payload round-trips from memory', () => {
    const throwing: SaveStorage = {
      read: () => null,
      write: () => {
        throw new Error('QuotaExceededError');
      },
      persistent: true,
    };
    setSaveStorage(throwing);
    quest.coins = 777;
    expect(() => writeSave()).not.toThrow();
    // writeSave() degraded storage to an in-memory fallback seeded with the
    // just-serialized payload, so a subsequent read round-trips it.
    const loaded = readSave();
    expect(loaded).not.toBeNull();
    expect(loaded!.coins).toBe(777);
  });

  it('degrades to session-only storage so sessionOnlyWarning() fires exactly once after the throw', () => {
    const throwing: SaveStorage = {
      read: () => null,
      write: () => {
        throw new Error('QuotaExceededError');
      },
      persistent: true,
    };
    setSaveStorage(throwing);
    writeSave();
    expect(sessionOnlyWarning()).toBe(true);
    expect(sessionOnlyWarning()).toBe(false);
  });

  it('records the write error instead of swallowing it', () => {
    const throwing: SaveStorage = {
      read: () => null,
      write: () => {
        throw new Error('boom');
      },
      persistent: true,
    };
    setSaveStorage(throwing);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    writeSave();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('a throwing read() makes readSave() return null and hasSave() false, without throwing', () => {
    const throwing: SaveStorage = {
      read: () => {
        throw new Error('SecurityError');
      },
      write: () => {},
      persistent: true,
    };
    setSaveStorage(throwing);
    expect(() => readSave()).not.toThrow();
    expect(readSave()).toBeNull();
    expect(hasSave()).toBe(false);
  });
});

describe('repairItemBalls', () => {
  function miniMap(grid: string[][], items: MapDef['items']): MapDef {
    return {
      id: 'hq',
      name: 'MINI',
      pal: 'gray',
      music: 'hq',
      grid,
      w: grid[0].length,
      h: grid.length,
      npcs: [],
      signs: {},
      items,
      warps: {},
      scripts: {},
    };
  }
  const flags = (over: Partial<Flags>): Flags => ({
    briefed: false,
    guardBeaten: false,
    switchFound: false,
    lootTaken: false,
    missionDone: false,
    gotSmoke: false,
    fossilsTaken: false,
    gotEkanzz: false,
    bradBeaten: false,
    ch2Done: false,
    jobsIntroSeen: false,
    drillBattleDone: false,
    drillStealthDone: false,
    ...over,
  });

  it('blanks a taken item ball, leaves an untaken one', () => {
    const map = miniMap(
      [
        [' ', 'b'],
        ['b', ' '],
      ],
      {
        '1,0': { name: 'SMOKE BALL', flag: 'gotSmoke' },
        '0,1': { name: 'OTHER', flag: 'briefed' },
      },
    );
    repairItemBalls({ mini: map }, flags({ gotSmoke: true }));
    expect(map.grid[0][1]).toBe(' '); // taken → blanked
    expect(map.grid[1][0]).toBe('b'); // not taken → untouched
  });

  it('applySave repairs the real HQ SMOKE BALL tile', () => {
    const s = snapshot();
    s.flags = { ...s.flags, gotSmoke: true };
    expect(MAPS.hq.grid[9][5]).toBe('b'); // pristine module data
    applySave(s);
    expect(MAPS.hq.grid[9][5]).toBe(' ');
    // restore module-level map data for other tests in this file
    MAPS.hq.grid[9][5] = 'b';
  });
});

describe('migrate — deep validation + clamping (HRD.2)', () => {
  // A structurally perfect blob to corrupt one field at a time.
  const base = (): Record<string, unknown> => snapshot() as unknown as Record<string, unknown>;

  it('rejects non-finite required numerics (x, y, coins)', () => {
    expect(migrate({ ...base(), x: NaN })).toBeNull();
    expect(migrate({ ...base(), y: Infinity })).toBeNull();
    expect(migrate({ ...base(), coins: NaN })).toBeNull();
  });

  it('clamps finite out-of-range numerics instead of rejecting', () => {
    expect(migrate({ ...base(), coins: -1 })!.coins).toBe(0);
    expect(migrate({ ...base(), coins: Number.MAX_SAFE_INTEGER })!.coins).toBe(999999);
    expect(migrate({ ...base(), playSeconds: -50 })!.playSeconds).toBe(0);
    expect(migrate({ ...base(), x: 99999 })!.x).toBe(MAPS.hq.w - 1);
    expect(migrate({ ...base(), x: -5 })!.x).toBe(0);
    expect(migrate({ ...base(), y: 99999 })!.y).toBe(MAPS.hq.h - 1);
  });

  it('playSeconds keeps its existing leniency: non-finite repairs to 0', () => {
    expect(migrate({ ...base(), playSeconds: NaN })!.playSeconds).toBe(0);
  });

  it('drops invalid party elements; an empty repaired party rejects the save', () => {
    expect(migrate({ ...base(), party: [null] })).toBeNull();
    expect(migrate({ ...base(), party: [mon('missingno', 5)] })).toBeNull(); // unknown species
    expect(migrate({ ...base(), party: [{ species: 'koffink', lv: 5, hp: 10, xp: 0 }] })).toBeNull(); // no moves
    // mixed: the valid mon survives, the garbage is dropped
    const out = migrate({ ...base(), party: [mon('koffink', 5), null, mon('missingno', 3)] });
    expect(out).not.toBeNull();
    expect(out!.party).toEqual([mon('koffink', 5)]);
  });

  it('clamps lv 1–50, hp 0–maxHp, xp ≥0 per element', () => {
    const lo = migrate({ ...base(), party: [{ ...mon('koffink', 0), hp: -5, xp: -10 }] });
    expect(lo!.party[0].lv).toBe(1);
    expect(lo!.party[0].hp).toBe(0);
    expect(lo!.party[0].xp).toBe(0);
    const hi = migrate({ ...base(), party: [{ ...mon('koffink', 999), hp: 9999 }] });
    expect(hi!.party[0].lv).toBe(50);
    expect(hi!.party[0].hp).toBe(maxHp(SPECIES.koffink, 50));
  });

  it('preserves optional mon fields (noEvolve, nick) through the repair', () => {
    const kept = migrate({ ...base(), party: [{ ...mon('koffink', 5), noEvolve: true, nick: 'STINKY' }] });
    expect(kept!.party[0].noEvolve).toBe(true);
    expect(kept!.party[0].nick).toBe('STINKY');
  });

  it('caps the party at 4 and validates box elements the same way', () => {
    const nine = Array.from({ length: 9 }, (_, i) => mon('koffink', i + 1));
    const out = migrate({ ...base(), party: nine });
    expect(out!.party).toHaveLength(4);
    expect(out!.party.map((m) => m.lv)).toEqual([1, 2, 3, 4]);
    const box = migrate({ ...base(), box: [mon('koffink', 5), null, mon('missingno', 2)] });
    expect(box!.box).toEqual([mon('koffink', 5)]); // invalid box mons dropped, save survives
  });

  it('rejects flags that are not a plain object; vars/heat repair to {}', () => {
    expect(migrate({ ...base(), flags: [] })).toBeNull();
    expect(migrate({ ...base(), vars: [] })!.vars).toEqual({});
    expect(migrate({ ...base(), heat: [] })!.heat).toEqual({});
  });

  it('rejects every malformed version', () => {
    for (const v of [0, -1, '3', 3.5, 999]) {
      expect(migrate({ ...base(), version: v })).toBeNull();
    }
    const missing = base();
    delete missing.version;
    expect(migrate(missing)).toBeNull();
  });

  it('readSave survives degenerate payloads', () => {
    const s = fakeStorage();
    setSaveStorage(s);
    for (const payload of ['', 'null', '[]', '0', JSON.stringify(snapshot()).slice(0, 40)]) {
      s.data = payload;
      expect(readSave()).toBeNull();
    }
  });

  it('pins the storage key — renaming it orphans every live player save', () => {
    expect(SAVE_KEY).toBe('team-rokket-save');
  });

  it('a v1 blob already carrying heat/job round-trips them (two tabs, different builds)', () => {
    const entry: HeatSaveEntry = { stage: 1, decayAt: 30, lockdownAt: null };
    const job: JobContract = { kind: 'fetch', slot: 0, item: 'SODA', need: 2, payout: 170, base: 0 };
    const out = migrate({ ...base(), version: 1, heat: { corner: entry }, job });
    expect(out).not.toBeNull();
    expect(out!.version).toBe(3);
    expect(out!.heat).toEqual({ corner: entry });
    expect(out!.job).toEqual(job);
  });
});

// ── HRD.8: noEvolve survives a full save round-trip ────────────────────────
// A player who confirmed NEVER EVOLVE must not be re-prompted after reload —
// migrateMon already preserves the field structurally (see the HRD.2
// "preserves optional mon fields" test above); this pins the BEHAVIOURAL
// guarantee end to end: write -> reset -> read -> apply -> gainXp still
// respects it.
describe('noEvolve survives write→reset→read→apply (HRD.8)', () => {
  it('a reloaded mon with noEvolve set never offers evolution again, even crossing the threshold', () => {
    const m: MonInstance = {
      ...mon('ratikatt', 15, maxHp(SPECIES.ratikatt, 15)),
      xp: xpForLevel(16) - 1, // one point below the evolve threshold
      noEvolve: true,
    };
    G.party = [m];
    writeSave();
    resetQuest();
    resetG();
    const save = readSave();
    expect(save).not.toBeNull();
    applySave(save!);
    expect(G.party[0].noEvolve).toBe(true); // survived the round-trip
    const evs = gainXp(G.party[0], SPECIES.ratikatt, 10); // crosses lv16
    expect(G.party[0].lv).toBe(16); // the level-up itself still happens
    expect(G.party[0].species).toBe('ratikatt'); // never auto-evolves
    expect(evs.every((e) => e.evolvesTo === undefined)).toBe(true); // never re-offered
  });
});

// ── HRD.8: detectStorage falls back to memory when localStorage throws ────
// The 1-byte probe in detectStorage() (not exported — exercised indirectly
// via readSave()/writeSave() once storage is forced back to null) must
// survive localStorage being entirely inaccessible (Safari private mode /
// embedded-iframe SecurityError), not just individual read/write calls
// (that path is already covered by the HRD.1 crash-guard tests above).
describe('detectStorage falls back to memory when localStorage throws (HRD.8)', () => {
  const original = (globalThis as { localStorage?: unknown }).localStorage;

  afterEach(() => {
    if (original === undefined) delete (globalThis as { localStorage?: unknown }).localStorage;
    else (globalThis as { localStorage?: unknown }).localStorage = original;
  });

  function throwingLocalStorage(): Storage {
    const blocked = (): never => {
      const err = new Error('blocked');
      err.name = 'SecurityError';
      throw err;
    };
    return { setItem: blocked, getItem: blocked, removeItem: blocked } as unknown as Storage;
  }

  it('a throwing localStorage degrades to an in-memory adapter without throwing', () => {
    (globalThis as { localStorage?: unknown }).localStorage = throwingLocalStorage();
    setSaveStorage(null); // forces re-detection on the next store() call
    expect(() => writeSave()).not.toThrow();
    expect(() => readSave()).not.toThrow();
  });

  it('the in-memory fallback round-trips this session and reports itself non-persistent', () => {
    (globalThis as { localStorage?: unknown }).localStorage = throwingLocalStorage();
    setSaveStorage(null);
    quest.coins = 321;
    writeSave();
    const loaded = readSave();
    expect(loaded).not.toBeNull();
    expect(loaded!.coins).toBe(321); // round-tripped via memory, not localStorage
    expect(sessionOnlyWarning()).toBe(true); // detectStorage's catch sets persistent:false
    expect(sessionOnlyWarning()).toBe(false); // and warns exactly once
  });
});
