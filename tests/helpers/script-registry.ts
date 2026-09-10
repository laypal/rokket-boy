// Shared script-cross-reference walker behind script-ref-lint.test.ts and
// sure-ball.test.ts (F43 BALL.2). A plain .ts, not *.test.ts — vitest never
// collects it, so importing it doesn't re-run another file's describe/it
// blocks in the importer's context (the double-registration bug this file
// exists to avoid: importing one *.test.ts from another).
import type { ScriptStep } from '../../src/types';
import { MAPS } from '../../src/data/maps';
import { ENCOUNTERS } from '../../src/data/encounters';

// The full ScriptStep discriminant set (src/types.ts:43-67), same order as
// the interpreter's if-chain (src/systems/script.ts:77-128). `then`/`else`
// are payload fields on the `if` step, not discriminants of their own.
const DISCRIMINANT_KEYS = new Set([
  'say', 'setFlag', 'if', 'giveItem', 'setTile', 'addWarp', 'battle', 'warp',
  'sfx', 'music', 'addCoins', 'addEgg', 'incVar', 'sayCycle', 'locker',
  'shop', 'endScreen', 'rankUp', 'heat', 'giveMon', 'npcRun', 'healParty',
  'sysMsg', 'jobs', 'choice', 'cardFlip', 'tour', 'fx',
]);

export interface Ref { where: string }
export interface IdRef extends Ref { id: string }
export interface TileRef extends Ref { x: number; y: number; ch: string; dims?: { w: number; h: number } }
export interface WarpRef extends Ref { target: string; x: number; y: number }
export interface FxRef extends Ref { id: string; at?: [number, number]; dims?: { w: number; h: number } }
export interface KeyViolation extends Ref { keys: string[] }
export interface CounterRef extends Ref { counter: string }

export interface Registry {
  battles: IdRef[];
  shops: IdRef[];
  giveItems: IdRef[];
  giveMons: IdRef[];
  music: IdRef[];
  sfx: IdRef[];
  fx: FxRef[];
  setTiles: TileRef[];
  warps: WarpRef[];
  keyViolations: KeyViolation[];
  sayCycles: CounterRef[];
  incVars: Set<string>;
  stepCount: number;
}

function newRegistry(): Registry {
  return {
    battles: [], shops: [], giveItems: [], giveMons: [], music: [], sfx: [], fx: [],
    setTiles: [], warps: [], keyViolations: [], sayCycles: [],
    incVars: new Set(), stepCount: 0,
  };
}

/** Walk a ScriptStep tree, collecting every cross-reference into `r`.
 *  `dims` is the current map's (w, h), used to bounds-check {setTile}; it's
 *  undefined when walking ENCOUNTERS onWin/onLose/onFlee/onCatch, which run
 *  on whatever map the fight happened on, so there's no fixed grid to check
 *  against (no shipped encounter follow-up uses setTile today). */
export function walk(steps: ScriptStep[], dims: { w: number; h: number } | undefined, where: string, r: Registry): void {
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
    if ('fx' in step) r.fx.push({ id: step.fx.id, at: step.fx.at, where, dims });
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

export function buildRegistry(): Registry {
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
    if (enc.onCatch) walk(enc.onCatch, undefined, `enc ${encId} onCatch`, r); // F43 BALL.2
  }
  return r;
}

export function collectItemPickups(): IdRef[] {
  const out: IdRef[] = [];
  for (const map of Object.values(MAPS)) {
    for (const [pos, item] of Object.entries(map.items)) {
      out.push({ id: item.item, where: `${map.id} item@${pos}` });
    }
  }
  return out;
}
