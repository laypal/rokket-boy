// Save system (plan §4.6): SaveV1 shape, storage adapter with in-memory
// fallback (§0.4 — claude.ai artifact previews block localStorage), migrate()
// for version bumps, and load-time map repair. Engine-free on purpose — no
// world/renderer imports — so the whole module unit-tests in Node. The caller
// (title CONTINUE) performs the warp to (mapId, x, y) after applySave().
// V2 (plan §4.8, .paul/PLAN.md "1f.2"): adds per-map HEAT runtime so a reload
// doesn't silently reset an active alarm. `HeatStage` is a type-only import —
// this module stays engine-free; G.heatState (1f.4) is what actually
// populates snapshot()'s heat field.
import type { Flags, MapDef, MapId, MonInstance } from '../types';
import type { HeatStage, HeatState } from './heat';
import type { JobContract } from './jobs';
import { G } from '../state';
import { quest } from './quest';
import { MAPS } from '../data/maps';
import { SPECIES } from '../data/mons';
import { maxHp, LEVEL_CAP } from './mon';

export interface SaveV1 {
  version: 1;
  flags: Flags;
  party: MonInstance[];
  box: MonInstance[];
  items: string[];
  coins: number;
  rank: string;
  mapId: MapId;
  x: number;
  y: number;
  playSeconds: number;
  eggs: string[];
  // §4.6's sketch omits vars, but quest.vars predates the save spec (slotSpins
  // gates the jackpot egg) — dropping it would silently reset counters on
  // every reload and corrupt any future var-gated quest step.
  vars: Record<string, number>;
}

/** Per-map HEAT runtime, serialized. Timestamps are G.playSeconds-relative
 *  seconds (playSeconds is itself saved, so deadlines stay meaningful across
 *  a reload). guardPositions is present only when a guard actually moved
 *  (heat >= 2 at save time) — 1f.4/1f.6 own that serialization rule. */
export interface HeatSaveEntry {
  stage: HeatStage;
  decayAt: number;
  lockdownAt: number | null;
  guardPositions?: Record<string, { x: number; y: number }>;
}

export type SaveV2 = Omit<SaveV1, 'version'> & {
  version: 2;
  heat: Partial<Record<MapId, HeatSaveEntry>>;
};

/** V3 (SIDE.1): the active job-board contract rides the save so a reload
 *  mid-contract keeps it (offers themselves are derived from rank+jobsDone
 *  and never saved). */
export type SaveV3 = Omit<SaveV2, 'version'> & {
  version: 3;
  job: JobContract | null;
};

export interface SaveStorage {
  read(): string | null;
  write(data: string): void;
  persistent: boolean;
}

/** Exported for the key-stability pin — renaming this orphans every live
 *  player's save while the whole suite stays green. */
export const SAVE_KEY = 'team-rokket-save';
const KEY = SAVE_KEY;

function detectStorage(): SaveStorage {
  try {
    // renamed from __rokket_probe__ (HRD.3): prod must grep clean of
    // `__rokket` so the staging-only report surface is provably absent
    const probe = '__save_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return {
      read: () => localStorage.getItem(KEY),
      write: (d) => localStorage.setItem(KEY, d),
      persistent: true,
    };
  } catch {
    let mem: string | null = null;
    return {
      read: () => mem,
      write: (d) => {
        mem = d;
      },
      persistent: false,
    };
  }
}

let storage: SaveStorage | null = null;
let warned = false;

function store(): SaveStorage {
  if (!storage) storage = detectStorage();
  return storage;
}

/** Test hook / future cloud adapter: swap the backend (null = re-detect). */
export function setSaveStorage(s: SaveStorage | null): void {
  storage = s;
  warned = false;
}

/** True exactly once, the first time a save lands in non-persistent storage —
 *  callers surface the §0.4 "SAVE: SESSION ONLY" warning in-game. */
export function sessionOnlyWarning(): boolean {
  if (store().persistent || warned) return false;
  warned = true;
  return true;
}

export function snapshot(): SaveV3 {
  // §4.8 (1f.4): serialize each populated map's HEAT runtime. `guardPositions`
  // is NOT emitted here — it needs moving guards (1f.6); the field stays
  // optional. Empty G.heatState → {}, so calm saves are byte-identical to 1f.2.
  const heat: SaveV2['heat'] = {};
  for (const id of Object.keys(G.heatState) as MapId[]) {
    const h = G.heatState[id];
    if (!h) continue;
    heat[id] = { stage: h.stage, decayAt: h.decayAt, lockdownAt: h.lockdownAt };
  }
  return {
    version: 3,
    flags: { ...quest.flags },
    party: G.party.map((m) => ({ ...m, moves: [...m.moves] })),
    box: G.box.map((m) => ({ ...m, moves: [...m.moves] })),
    items: [...quest.items],
    coins: quest.coins,
    rank: quest.rank,
    mapId: G.map.id,
    x: G.player.x,
    y: G.player.y,
    playSeconds: Math.floor(G.playSeconds),
    eggs: [...quest.eggs],
    vars: { ...quest.vars },
    heat,
    job: quest.job ? { ...quest.job } : null,
  };
}

/** HRD.1: the 1-byte probe in detectStorage() can pass while the real
 *  multi-KB write throws (QuotaExceededError, Safari private mode, iOS
 *  storage pressure) — and autosave runs inside the warp fade callback
 *  (world.ts:227), so an uncaught throw here used to freeze the game
 *  mid-warp. On throw: record the error, degrade `storage` to an in-memory
 *  adapter seeded with the payload that just failed to persist (so the save
 *  still round-trips this session), and reset `warned` so the existing
 *  "SAVE: SESSION ONLY" surface (sessionOnlyWarning(), already called by
 *  menu.ts/world.ts) fires once more. */
export function writeSave(): void {
  const payload = JSON.stringify(snapshot());
  try {
    store().write(payload);
  } catch (err) {
    console.error(err);
    let mem: string | null = payload;
    storage = {
      read: () => mem,
      write: (d) => {
        mem = d;
      },
      persistent: false,
    };
    warned = false;
  }
}

export function readSave(): SaveV3 | null {
  try {
    const raw = store().read();
    if (!raw) return null;
    return migrate(JSON.parse(raw));
  } catch (err) {
    console.error(err);
    return null;
  }
}

export function hasSave(): boolean {
  return readSave() !== null;
}

/** A structurally valid contract survives the load; anything else reads as
 *  no active job (lenient — a bad blob must never invalidate the save). */
function migrateJob(raw: unknown): JobContract | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const j = raw as Partial<JobContract>;
  if (j.kind !== 'fetch' && j.kind !== 'hunt' && j.kind !== 'spin') return null;
  if (typeof j.need !== 'number' || typeof j.payout !== 'number' || typeof j.base !== 'number') return null;
  if (j.kind === 'fetch' && typeof j.item !== 'string') return null;
  // slot arrived with SIDE.1-FB — a pre-FB blob defaults to slot 0 (lenient)
  const slot = typeof j.slot === 'number' ? j.slot : 0;
  return { kind: j.kind, slot, item: j.item, need: j.need, payout: j.payout, base: j.base };
}

const COIN_CAP = 999999;
const PLAY_SECONDS_CAP = 35999940; // 9999h 59m — display ceiling

function clampNum(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** HRD.2: per-element mon validation. Structural garbage (unknown species,
 *  missing moves array, non-finite lv/hp/xp) drops the element; finite but
 *  out-of-range values are repaired in place (lv 1–LEVEL_CAP, hp 0–maxHp,
 *  xp ≥0). The raw mon is spread, not rebuilt — optional fields (status,
 *  nick, noEvolve) ride through untouched, the UX2.4 contract. */
function migrateMon(raw: unknown): MonInstance | null {
  if (!isPlainObject(raw)) return null;
  const m = raw as Partial<MonInstance>;
  if (typeof m.species !== 'string' || !(m.species in SPECIES)) return null;
  if (!Array.isArray(m.moves)) return null;
  if (typeof m.lv !== 'number' || !Number.isFinite(m.lv)) return null;
  if (typeof m.hp !== 'number' || !Number.isFinite(m.hp)) return null;
  if (typeof m.xp !== 'number' || !Number.isFinite(m.xp)) return null;
  const lv = clampNum(Math.floor(m.lv), 1, LEVEL_CAP);
  const hp = clampNum(Math.floor(m.hp), 0, maxHp(SPECIES[m.species], lv));
  const xp = Math.max(0, Math.floor(m.xp));
  return { ...(m as MonInstance), lv, hp, xp, moves: [...m.moves] };
}

/** Validate/upgrade a parsed save. Unknown versions and structural garbage
 *  return null (→ fresh game). v1 validates as before then upgrades with an
 *  empty heat map; v2 validates the same shared fields and is lenient on
 *  `heat` (missing/non-object → {}); v3 (SIDE.1) is lenient the same way on
 *  `job` — additive fields never invalidate a save (§4.6, 1f.2). Future
 *  version bumps chain vN→vN+1 here, with a unit test per step.
 *
 *  HRD.2 hardening — repair-over-reject: a tampered or corrupt blob either
 *  repairs-and-loads or lands on NEW GAME, never a crash. Required numerics
 *  (x, y, coins) must be finite (reject otherwise); finite out-of-range
 *  values clamp. Optional numerics (playSeconds) keep their leniency and
 *  repair to their default. Party/box elements are validated individually
 *  (invalid ones dropped); an empty repaired party rejects the save. flags
 *  must be a plain object; vars/heat repair to {} when they aren't. */
export function migrate(raw: unknown): SaveV3 | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const s = raw as Partial<SaveV1> & Partial<SaveV2> & Partial<SaveV3>;
  if (s.version !== 1 && s.version !== 2 && s.version !== 3) return null;
  if (!Array.isArray(s.party) || s.party.length < 1) return null;
  if (typeof s.mapId !== 'string' || !(s.mapId in MAPS)) return null;
  if (typeof s.x !== 'number' || !Number.isFinite(s.x)) return null;
  if (typeof s.y !== 'number' || !Number.isFinite(s.y)) return null;
  if (typeof s.coins !== 'number' || !Number.isFinite(s.coins)) return null;
  if (!isPlainObject(s.flags)) return null;
  const party = s.party.map(migrateMon).filter((m): m is MonInstance => m !== null);
  if (party.length < 1) return null;
  const map = MAPS[s.mapId as MapId];
  const playSeconds =
    typeof s.playSeconds === 'number' && Number.isFinite(s.playSeconds) ? s.playSeconds : 0;
  return {
    version: 3,
    flags: s.flags as Flags,
    party: party.slice(0, 4),
    box: Array.isArray(s.box)
      ? s.box.map(migrateMon).filter((m): m is MonInstance => m !== null)
      : [],
    items: Array.isArray(s.items) ? s.items : [],
    coins: clampNum(Math.floor(s.coins), 0, COIN_CAP),
    rank: typeof s.rank === 'string' ? s.rank : 'GRUNT',
    mapId: s.mapId,
    x: clampNum(Math.floor(s.x), 0, map.w - 1),
    y: clampNum(Math.floor(s.y), 0, map.h - 1),
    playSeconds: clampNum(Math.floor(playSeconds), 0, PLAY_SECONDS_CAP),
    eggs: Array.isArray(s.eggs) ? s.eggs : [],
    vars: isPlainObject(s.vars) ? (s.vars as Record<string, number>) : {},
    heat: isPlainObject(s.heat) ? (s.heat as SaveV3['heat']) : {},
    job: migrateJob(s.job),
  };
}

/** Blank the 'b' tile of any map item whose taken-flag is set. Fresh page
 *  loads reset the module-level grids, so a loaded game would otherwise let
 *  the player re-collect items. Script-driven mutations (setTile/addWarp in
 *  dialog scripts) are opaque to this pass — those get flag-gated `enter`
 *  repair steps in the map data instead. */
export function repairItemBalls(maps: Record<string, MapDef>, flags: Flags): void {
  for (const map of Object.values(maps)) {
    for (const [key, item] of Object.entries(map.items)) {
      if (!flags[item.flag]) continue;
      const [x, y] = key.split(',').map(Number);
      if (map.grid[y]?.[x] === 'b') map.grid[y][x] = ' ';
    }
  }
}

/** Restore quest + game state from a validated save. lastHq stays at its
 *  default (it is always the HQ spawn today — save shape bump when a second
 *  hub exists). The caller warps to (save.mapId, save.x, save.y). §4.8 (1f.4):
 *  per-map HEAT runtime is restored into G.heatState; `guardPositions` is
 *  ignored — world.ts (1f.6) re-derives guard placement, the timers are what
 *  must survive a reload. */
export function applySave(save: SaveV3): void {
  quest.flags = { ...save.flags };
  quest.coins = save.coins;
  quest.eggs = new Set(save.eggs);
  quest.vars = { ...save.vars };
  quest.items = [...save.items];
  quest.rank = save.rank;
  quest.job = save.job ? { ...save.job } : null;
  G.party = save.party.map((m) => ({ ...m, moves: [...m.moves] }));
  G.box = save.box.map((m) => ({ ...m, moves: [...m.moves] }));
  G.playSeconds = save.playSeconds;
  const heat: Partial<Record<MapId, HeatState>> = {};
  for (const id of Object.keys(save.heat) as MapId[]) {
    const e = save.heat[id];
    if (!e) continue;
    heat[id] = { stage: e.stage, decayAt: e.decayAt, lockdownAt: e.lockdownAt };
  }
  G.heatState = heat;
  repairItemBalls(MAPS, quest.flags);
}
