// Script cross-reference lints (HRD.9). content-lint.test.ts checks that
// dialogue TEXT fits the box; this file checks that dialogue DATA points
// somewhere real. A typo'd id in a script degrades silently at runtime (a
// bad {sfx}/{music} is a no-op, a bad {giveItem} hands over a useless item,
// a bad {battle}/{shop} throws mid-cutscene) — this walker reuses the
// collectSays recursion shape (content-lint.test.ts:13-33) to visit every
// ScriptStep in shipped content and assert each reference resolves. The
// walker itself lives in helpers/script-registry.ts (a plain .ts, never
// collected by vitest) so sure-ball.test.ts (F43 BALL.2) can reuse it
// without importing this *.test.ts file directly.
import { describe, it, expect } from 'vitest';
import type { MapDef, MapId } from '../src/types';
import { MAPS } from '../src/data/maps';
import { ENCOUNTERS } from '../src/data/encounters';
import { SHOPS } from '../src/data/shops';
import { ITEMS } from '../src/data/items';
import { SPECIES } from '../src/data/mons';
import { TRACKS } from '../src/data/music';
import { TILES } from '../src/data/tiles';
import { SFX } from '../src/data/sfx';
import { WORLD_FX_IDS } from '../src/systems/worldFx';
import { buildRegistry, collectItemPickups } from './helpers/script-registry';

// TOOL.2: the SFX registry is data now — its keys ARE the lint set.
const SFX_NAMES = new Set(Object.keys(SFX));
// F38 JCE.0: the world-fx table's id list is the lint set for {fx}.
const FX_NAMES = new Set<string>(WORLD_FX_IDS);

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

  it('every {fx} id is a WorldFxId and its `at` (if any) is in bounds of its map', () => {
    expect(REG.fx.length).toBeGreaterThan(0); // sanity: JCE.2's heal steps are the first content users
    for (const f of REG.fx) {
      expect(FX_NAMES.has(f.id), `${f.where}: unknown fx id "${f.id}"`).toBe(true);
      if (f.at && f.dims) {
        const [x, y] = f.at;
        const inBounds = x >= 0 && x < f.dims.w && y >= 0 && y < f.dims.h;
        expect(inBounds, `${f.where}: fx at (${x},${y}) is out of bounds for a ${f.dims.w}x${f.dims.h} map`).toBe(true);
      }
    }
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
