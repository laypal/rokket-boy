// Script cross-reference lints (HRD.9). content-lint.test.ts checks that
// dialogue TEXT fits the box; this file checks that dialogue DATA points
// somewhere real. A typo'd id in a script degrades silently at runtime (a
// bad {sfx}/{music} is a no-op, a bad {giveItem} hands over a useless item,
// a bad {battle}/{shop} throws mid-cutscene) — this walker reuses the
// collectSays recursion shape (content-lint.test.ts:13-33) to visit every
// ScriptStep in shipped content and assert each reference resolves.
import { describe, it, expect } from 'vitest';
import type { ScriptStep, MapDef, MapId } from '../src/types';
import { MAPS } from '../src/data/maps';
import { ENCOUNTERS } from '../src/data/encounters';
import { SHOPS } from '../src/data/shops';
import { ITEMS } from '../src/data/items';
import { SPECIES } from '../src/data/mons';
import { TRACKS } from '../src/data/music';
import { TILES } from '../src/data/tiles';

// The SFX registry has no exported list — engine/audio.ts's sfx() switches
// on a literal name and silently no-ops on an unknown one (the exact bug
// class this lint exists to catch). Mirror its case labels here; keep this
// set in sync with that switch the way ITEMS/SHOPS/TRACKS are already kept
// in sync with their consumers.
const SFX_NAMES = new Set([
  'blip', 'beep', 'confirm', 'cancel', 'bump', 'door', 'stairs', 'hit',
  'hurt', 'coin', 'switch', 'alarm', 'item', 'faint', 'evolve',
  'disguise', // CH4.1
]);

// The full ScriptStep discriminant set (src/types.ts:43-67), same order as
// the interpreter's if-chain (src/systems/script.ts:77-128). `then`/`else`
// are payload fields on the `if` step, not discriminants of their own.
const DISCRIMINANT_KEYS = new Set([
  'say', 'setFlag', 'if', 'giveItem', 'setTile', 'addWarp', 'battle', 'warp',
  'sfx', 'music', 'addCoins', 'addEgg', 'incVar', 'sayCycle', 'locker',
  'shop', 'endScreen', 'rankUp', 'heat', 'giveMon', 'npcRun', 'healParty',
  'sysMsg', 'jobs', 'choice', 'cardFlip', 'tour',
]);

interface Ref { where: string }
interface IdRef extends Ref { id: string }
interface TileRef extends Ref { x: number; y: number; ch: string; dims?: { w: number; h: number } }
interface WarpRef extends Ref { target: string; x: number; y: number }
interface KeyViolation extends Ref { keys: string[] }
interface CounterRef extends Ref { counter: string }

interface Registry {
  battles: IdRef[];
  shops: IdRef[];
  giveItems: IdRef[];
  giveMons: IdRef[];
  music: IdRef[];
  sfx: IdRef[];
  setTiles: TileRef[];
  warps: WarpRef[];
  keyViolations: KeyViolation[];
  sayCycles: CounterRef[];
  incVars: Set<string>;
  stepCount: number;
}

function newRegistry(): Registry {
  return {
    battles: [], shops: [], giveItems: [], giveMons: [], music: [], sfx: [],
    setTiles: [], warps: [], keyViolations: [], sayCycles: [],
    incVars: new Set(), stepCount: 0,
  };
}

/** Walk a ScriptStep tree, collecting every cross-reference into `r`.
 *  `dims` is the current map's (w, h), used to bounds-check {setTile}; it's
 *  undefined when walking ENCOUNTERS onWin/onLose/onFlee, which run on
 *  whatever map the fight happened on, so there's no fixed grid to check
 *  against (no shipped encounter follow-up uses setTile today). */
function walk(steps: ScriptStep[], dims: { w: number; h: number } | undefined, where: string, r: Registry): void {
  for (const step of steps) {
    r.stepCount++;
    const ownKeys = Object.keys(step).filter((k) => k !== 'then' && k !== 'else');
    const matched = ownKeys.filter((k) => DISCRIMINANT_KEYS.has(k));
    if (matched.length !== 1) r.keyViolations.push({ where, keys: ownKeys });

    if ('battle' in step) r.battles.push({ id: step.battle, where });
    if ('shop' in step) r.shops.push({ id: step.shop, where });
    if ('giveItem' in step) r.giveItems.push({ id: step.giveItem, where });
    if ('giveMon' in step) r.giveMons.push({ id: step.giveMon.species, where });
    if ('music' in step) r.music.push({ id: step.music, where });
    if ('sfx' in step) r.sfx.push({ id: step.sfx, where });
    if ('setTile' in step) {
      const [x, y, ch] = step.setTile;
      r.setTiles.push({ x, y, ch, where, dims });
    }
    if ('addWarp' in step) {
      const [, wd] = step.addWarp;
      r.warps.push({ target: wd[0], x: wd[1], y: wd[2], where: `${where} (addWarp)` });
    }
    if ('warp' in step) {
      const wd = step.warp;
      r.warps.push({ target: wd[0], x: wd[1], y: wd[2], where: `${where} (warp)` });
    }
    if ('sayCycle' in step) r.sayCycles.push({ counter: step.sayCycle.counter, where });
    if ('incVar' in step) r.incVars.add(step.incVar);
    if ('if' in step) {
      walk(step.then, dims, `${where} > then`, r);
      if (step.else) walk(step.else, dims, `${where} > else`, r);
    }
    if ('choice' in step) {
      walk(step.choice.yes, dims, `${where} > yes`, r);
      if (step.choice.no) walk(step.choice.no, dims, `${where} > no`, r);
    }
  }
}

function buildRegistry(): Registry {
  const r = newRegistry();
  for (const map of Object.values(MAPS)) {
    for (const [key, steps] of Object.entries(map.scripts)) {
      walk(steps, { w: map.w, h: map.h }, `${map.id}:${key}`, r);
    }
  }
  for (const [encId, enc] of Object.entries(ENCOUNTERS)) {
    walk(enc.onWin, undefined, `enc ${encId} onWin`, r);
    walk(enc.onLose, undefined, `enc ${encId} onLose`, r);
    walk(enc.onFlee, undefined, `enc ${encId} onFlee`, r);
  }
  return r;
}

function collectItemPickups(): IdRef[] {
  const out: IdRef[] = [];
  for (const map of Object.values(MAPS)) {
    for (const [pos, item] of Object.entries(map.items)) {
      out.push({ id: item.item, where: `${map.id} item@${pos}` });
    }
  }
  return out;
}

const REG = buildRegistry();
const ITEM_PICKUPS = collectItemPickups();

/** Look up a MAPS entry by an unvalidated (possibly bad) target string —
 *  MAPS is keyed by the MapId union, so a plain string index needs a cast;
 *  the whole point of this lookup is to prove that string is (or isn't) a
 *  real MapId. */
function lookupMap(id: string): MapDef | undefined {
  return (MAPS as Record<string, MapDef>)[id as MapId];
}

describe('script reference lints', () => {
  it('every {battle} id resolves in ENCOUNTERS', () => {
    for (const ref of REG.battles) {
      expect(ENCOUNTERS[ref.id], `${ref.where}: unknown battle id "${ref.id}"`).toBeDefined();
    }
    expect(REG.battles.length).toBeGreaterThan(0); // sanity: the walker found a {battle} step
  });

  it('every {shop} id resolves in SHOPS', () => {
    for (const ref of REG.shops) {
      expect(SHOPS[ref.id], `${ref.where}: unknown shop id "${ref.id}"`).toBeDefined();
    }
    expect(REG.shops.length).toBeGreaterThan(0); // sanity: the walker found a {shop} step
  });

  it('every {giveItem} name resolves in ITEMS', () => {
    for (const ref of REG.giveItems) {
      expect(ITEMS[ref.id], `${ref.where}: unknown item id "${ref.id}"`).toBeDefined();
    }
    expect(REG.giveItems.length).toBeGreaterThan(0); // sanity: the walker found a {giveItem} step
  });

  it('every map items[].item pickup resolves in ITEMS', () => {
    for (const ref of ITEM_PICKUPS) {
      expect(ITEMS[ref.id], `${ref.where}: unknown item id "${ref.id}"`).toBeDefined();
    }
    expect(ITEM_PICKUPS.length).toBeGreaterThan(0); // sanity: the walker found a map item pickup
  });

  it('every {giveMon} species resolves in SPECIES', () => {
    for (const ref of REG.giveMons) {
      expect(SPECIES[ref.id], `${ref.where}: unknown species "${ref.id}"`).toBeDefined();
    }
    expect(REG.giveMons.length).toBeGreaterThan(0); // sanity: the walker found a {giveMon} step
  });

  it('every {music} id resolves in the audio registry (TRACKS)', () => {
    for (const ref of REG.music) {
      expect(TRACKS[ref.id], `${ref.where}: unknown music id "${ref.id}"`).toBeDefined();
    }
    expect(REG.music.length).toBeGreaterThan(0); // sanity: the walker found a {music} step
  });

  it('every {sfx} id resolves in the audio registry (SFX_NAMES)', () => {
    for (const ref of REG.sfx) {
      expect(SFX_NAMES.has(ref.id), `${ref.where}: unknown sfx id "${ref.id}"`).toBe(true);
    }
    expect(REG.sfx.length).toBeGreaterThan(0); // sanity: the walker found an {sfx} step
  });

  it('every {setTile} uses a registered tile char, in bounds of its map', () => {
    for (const t of REG.setTiles) {
      expect(TILES[t.ch], `${t.where}: setTile uses unregistered tile char "${t.ch}"`).toBeDefined();
      if (t.dims) {
        const inBounds = t.x >= 0 && t.x < t.dims.w && t.y >= 0 && t.y < t.dims.h;
        expect(inBounds, `${t.where}: setTile (${t.x},${t.y}) is out of bounds for a ${t.dims.w}x${t.dims.h} map`).toBe(true);
      }
    }
    expect(REG.setTiles.length).toBeGreaterThan(0); // sanity: the walker found a {setTile} step
  });

  it('every {addWarp}/{warp} target map/coords are valid', () => {
    for (const w of REG.warps) {
      const target = lookupMap(w.target);
      expect(target, `${w.where}: unknown warp target map "${w.target}"`).toBeDefined();
      if (target) {
        const inBounds = w.x >= 0 && w.x < target.w && w.y >= 0 && w.y < target.h;
        expect(inBounds, `${w.where}: warp coords (${w.x},${w.y}) are out of bounds on "${w.target}" (${target.w}x${target.h})`).toBe(true);
      }
    }
    expect(REG.warps.length).toBeGreaterThan(0); // sanity: the walker found an {addWarp}/{warp} step
  });

  it('every step object has exactly one recognised discriminant key', () => {
    // walk() only pushes into keyViolations when matched.length !== 1 (see
    // `if (matched.length !== 1)` above), so a populated array IS the bug —
    // this asserts it stays empty, listing every offender's location + the
    // (unrecognised or duplicated) keys it actually found.
    const bad = REG.keyViolations.map((v) => `${v.where}: found [${v.keys.join(', ')}]`);
    expect(bad, 'steps with other than exactly one discriminant key').toEqual([]);
    expect(REG.stepCount).toBeGreaterThan(0); // sanity: the walker actually visited steps
  });

  it('every sayCycle.counter var is incremented somewhere', () => {
    for (const c of REG.sayCycles) {
      expect(REG.incVars.has(c.counter), `${c.where}: sayCycle counter "${c.counter}" is never incVar'd`).toBe(true);
    }
    expect(REG.sayCycles.length).toBeGreaterThan(0); // sanity: the walker found a sayCycle step
  });
});
