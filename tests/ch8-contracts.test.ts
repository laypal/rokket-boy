// CH8.0 contracts (.paul/PLAN.md part C, 2026-09-15): the pieces the SAFARI
// ZOON's moral branch stands on — nine flags (twelve with the ranger
// paydays), `betrayal` set by exactly one callback, two points of no return
// that hide each other, a chapter machine that derives the right boss name
// on each branch with no machine change, the span's rail as a gated door, a
// region in the woods, three maps sharing one heat zone behind the gate.
// Written before workers A/B/C landed — the Giovanni chain cases are their
// gate, red until then.
import { describe, it, expect, beforeEach } from 'vitest';
import { quest, resetQuest, checkCond, CHAPTERS } from '../src/systems/quest';
import { MAPS } from '../src/data/maps';
import { ENCOUNTERS } from '../src/data/encounters';
import { ITEMS } from '../src/data/items';
import { TRACKS } from '../src/data/music';
import { BG_PAL, OBJ_PAL } from '../src/data/palettes';
import { WALKABLE } from '../src/data/tiles';
import { REGIONS, regionOf } from '../src/data/region';
import { hqScripts } from '../src/data/dialog/hq';
import type { MapId, ScriptStep, FlagName } from '../src/types';

const SAFARI: MapId[] = ['safari1', 'safari2', 'safari3'];
const CH8_FLAGS: FlagName[] = [
  'ch8Briefed', 'ch8Rules', 'ch8Poached', 'ch8Freed', 'ch8Warden', 'ch8Petrelle',
  'betrayal', 'ch8Done', 'safariRanger1', 'safariRanger2', 'safariRanger3', 'safariRanger4', 'safariRanger5', 'ch8PensEmpty',
];

/** Every step in a script tree, depth-first (then/else/yes/no included). */
function flatten(steps: ScriptStep[]): ScriptStep[] {
  const out: ScriptStep[] = [];
  for (const s of steps) {
    out.push(s);
    if ('if' in s) out.push(...flatten(s.then), ...flatten(s.else ?? []));
    if ('choice' in s) out.push(...flatten(s.choice.yes), ...flatten(s.choice.no ?? []));
  }
  return out;
}
/** Every script in the game that could set a flag: map scripts + encounter callbacks. */
function everySetter(flag: FlagName): string[] {
  const where: string[] = [];
  for (const map of Object.values(MAPS)) {
    for (const [key, steps] of Object.entries(map.scripts)) {
      if (flatten(steps).some((s) => 'setFlag' in s && s.setFlag === flag)) where.push(`${map.id}:${key}`);
    }
  }
  for (const [id, enc] of Object.entries(ENCOUNTERS)) {
    for (const cb of ['onWin', 'onLose', 'onFlee', 'onCatch'] as const) {
      if (flatten(enc[cb] ?? []).some((s) => 'setFlag' in s && s.setFlag === flag)) where.push(`${id}.${cb}`);
    }
  }
  return where;
}
const ch8 = () => CHAPTERS.find((c) => c.id === 'ch8')!;
/** The ch8 objective the STATUS line would show — first unmet step of ch8. */
function ch8Objective(): string | null {
  for (const step of ch8().steps) if (!checkCond(step.done)) return step.objective;
  return null;
}

beforeEach(() => resetQuest());

describe('CH8.0 §1 flags + items', () => {
  it('every CH8 flag exists and starts false', () => {
    for (const f of CH8_FLAGS) expect(quest.flags[f], f).toBe(false);
  });
  it('SAFARI PASS is a key item, PRIZE CRATE a quest item, neither for sale', () => {
    expect(ITEMS['SAFARI PASS']).toMatchObject({ kind: 'key', price: 0 });
    expect(ITEMS['PRIZE CRATE']).toMatchObject({ kind: 'quest', price: 0 });
  });
  it('`betrayal` is set by exactly one callback in the whole game: safari_petrelle.onWin', () => {
    expect(everySetter('betrayal')).toEqual(['safari_petrelle.onWin']);
  });
  it('the WARDEN win sets ch8Warden and never betrayal; PETRELLE sets both', () => {
    expect(everySetter('ch8Warden')).toEqual(['safari_warden.onWin']);
    expect(everySetter('ch8Petrelle')).toEqual(['safari_petrelle.onWin']);
  });
});

describe('CH8.0 §2 the point of no return — two acts, mutually hidden, each behind one YES', () => {
  const pens = () => MAPS.safari3.scripts;
  it('the crate (at:4,5) and the lever (at:15,7) are the ONLY interactables that set the branch flags', () => {
    expect(everySetter('ch8Poached')).toEqual(['safari3:at:4,5']);
    expect(everySetter('ch8Freed')).toEqual(['safari3:at:15,7']);
  });
  it.each([['at:4,5', 'ch8Poached'], ['at:15,7', 'ch8Freed']] as const)('%s asks a choice first and sets %s as the FIRST yes step', (key, flag) => {
    const top = pens()[key][0];
    expect('if' in top).toBe(true);
    if (!('if' in top)) return;
    // gated on EITHER branch having been chosen
    expect(top.if).toEqual({ any: [{ flag: 'ch8Poached' }, { flag: 'ch8Freed' }] });
    const choice = top.else!.find((s) => 'choice' in s);
    expect(choice, `${key} has a choice`).toBeDefined();
    if (!choice || !('choice' in choice)) return;
    expect(choice.choice.yes[0]).toEqual({ setFlag: flag });
    expect(choice.choice.no).toBeUndefined(); // NO does nothing
    expect(choice.choice.yes.some((s) => 'heat' in s && s.heat === 2), 'heat 2').toBe(true);
  });
  it('the crate and the lever sit 4+ tiles apart on non-walkable prop tiles', () => {
    const g = MAPS.safari3.grid;
    expect(WALKABLE.has(g[5][4])).toBe(false);
    expect(WALKABLE.has(g[7][15])).toBe(false);
    expect(Math.abs(15 - 4) + Math.abs(7 - 5)).toBeGreaterThanOrEqual(4);
  });
  it('no script anywhere runs a setTile on the pens except the lever and the enter-repair', () => {
    const setters = Object.entries(pens()).filter(([, steps]) => flatten(steps).some((s) => 'setTile' in s)).map(([k]) => k);
    expect(setters.sort()).toEqual(['at:15,7', 'enter']);
  });
});

describe('CH8.0 §4 the chapter machine — branch text from Conds', () => {
  it('ch8 sits before dex15 and names the safari region', () => {
    const ids = CHAPTERS.map((c) => c.id);
    expect(ids.indexOf('ch8')).toBe(ids.indexOf('ch7') + 1);
    expect(ids.indexOf('dex15')).toBe(ids.indexOf('ch8') + 1);
    expect(ch8().region).toBe('safari');
  });
  it('loyal walk: rules → pens → WARDEN → report → done', () => {
    expect(ch8Objective()).toBe('GO PAST THE SPAN');
    quest.flags.ch8Rules = true;
    expect(ch8Objective()).toBe('REACH THE PENS');
    quest.flags.ch8Poached = true;
    expect(ch8Objective()).toBe('BEAT THE WARDEN');
    quest.flags.ch8Warden = true;
    expect(ch8Objective()).toBe('REPORT TO BOSS'); // BEAT PETRELLE auto-met by ch8Poached
    quest.flags.ch8Done = true;
    expect(ch8Objective()).toBeNull();
  });
  it('betrayal walk: rules → pens → PETRELLE → report → done, the WARDEN step never shows', () => {
    quest.flags.ch8Rules = true;
    quest.flags.ch8Freed = true;
    expect(ch8Objective()).toBe('BEAT PETRELLE'); // BEAT THE WARDEN auto-met by ch8Freed
    quest.flags.ch8Petrelle = true;
    expect(ch8Objective()).toBe('REPORT TO BOSS');
    quest.flags.ch8Done = true;
    expect(ch8Objective()).toBeNull();
  });
});

describe('CH8.0 §3/§7 maps, guards, bosses, region', () => {
  it('three safari maps, all in the safari palette on the safari track, within 28×20', () => {
    for (const id of SAFARI) {
      const m = MAPS[id];
      expect(m.pal, id).toBe('safari');
      expect(m.music, id).toBe('safari');
      expect(m.w, id).toBeLessThanOrEqual(28);
      expect(m.h, id).toBeLessThanOrEqual(20);
      expect(m.watch, `${id} watch`).toBe(true);
      expect(m.minStage, `${id} minStage`).toBeUndefined();
      expect(regionOf(id)?.id, id).toBe('safari');
    }
    expect(BG_PAL.safari).toHaveLength(5);
    expect(OBJ_PAL.safari).toHaveLength(4);
    expect(OBJ_PAL.petrelle).toHaveLength(4);
    expect(TRACKS.safari).toBeDefined();
    expect(TRACKS.safariboss).toBeDefined();
  });
  it('the park and the pens share the heat zone; the gate stays its own record', () => {
    expect(MAPS.safari2.heatZone).toBe('park');
    expect(MAPS.safari3.heatZone).toBe('park');
    expect(MAPS.safari1.heatZone).toBeUndefined();
  });
  it('every RANGER is a posted heatGuard with his OWN encounter + payday flag, gone once beaten (CH8-FB.1); the park has at least three', () => {
    const guards = SAFARI.flatMap((id) => MAPS[id].npcs.filter((n) => n.heatGuard).map((n) => ({ id, n })));
    expect(guards.length).toBeGreaterThanOrEqual(4);
    expect(MAPS.safari2.npcs.filter((n) => n.heatGuard).length).toBeGreaterThanOrEqual(3);
    const encIds = guards.map(({ n }) => n.heatGuard!.encounterId);
    expect(new Set(encIds).size).toBe(encIds.length); // no two rangers share a fight
    for (const { id, n } of guards) {
      const enc = ENCOUNTERS[n.heatGuard!.encounterId];
      expect(enc, `${id} ${n.id}`).toBeDefined();
      expect(enc.trainer).toBe('RANGER');
      const gate = enc.onWin[0];
      expect('if' in gate && 'notFlag' in gate.if, `${n.id} payday once`).toBe(true);
      if (!('if' in gate) || !('notFlag' in gate.if)) return;
      expect(n.goneIf, `${n.id} leaves when beaten`).toEqual({ flag: gate.if.notFlag });
    }
  });
  it('the pens are locked `d` gates with a resident each; the lever alone empties them, after the puffs (CH8-FB.3)', () => {
    const g = MAPS.safari3.grid;
    for (const [x, y] of [[2, 3], [3, 3], [8, 3], [9, 3], [14, 3], [15, 3]]) expect(g[y][x], `gate ${x},${y}`).toBe('d');
    expect(MAPS.safari3.scripts['tile:d']).toBeDefined();
    const residents = MAPS.safari3.npcs.filter((n) => n.id.startsWith('pen'));
    expect(residents).toHaveLength(3);
    for (const r of residents) expect(r.goneIf).toEqual({ flag: 'ch8PensEmpty' });
    expect(everySetter('ch8PensEmpty')).toEqual(['safari3:at:15,7']);
    const lever = MAPS.safari3.scripts['at:15,7'][0];
    if (!('if' in lever)) throw new Error('lever shape');
    const choice = lever.else!.find((s) => 'choice' in s);
    if (!choice || !('choice' in choice)) throw new Error('lever choice');
    const yes = choice.choice.yes;
    const iPoof = yes.findIndex((s) => 'fx' in s && s.fx.id === 'poof');
    const iEmpty = yes.findIndex((s) => 'setFlag' in s && s.setFlag === 'ch8PensEmpty');
    expect(iPoof).toBeGreaterThan(0);
    expect(iEmpty).toBeGreaterThan(iPoof); // hide them only after the puff has a body to land on
  });
  it('both bosses stand on the exit tile of the gate, each hidden until its branch and gone after its fall, on the boss track', () => {
    const warden = MAPS.safari1.npcs.find((n) => n.id === 'warden')!;
    const petrelle = MAPS.safari1.npcs.find((n) => n.id === 'petrelle')!;
    expect([warden.x, warden.y]).toEqual([petrelle.x, petrelle.y]);
    expect(warden.goneIf).toEqual({ any: [{ notFlag: 'ch8Poached' }, { flag: 'ch8Warden' }] });
    expect(petrelle.goneIf).toEqual({ any: [{ notFlag: 'ch8Freed' }, { flag: 'ch8Petrelle' }] });
    expect(ENCOUNTERS.safari_warden.music).toBe('safariboss');
    expect(ENCOUNTERS.safari_petrelle.music).toBe('safariboss');
    // the exit door is the tile below the boss; arrival from the span lands above him
    expect(MAPS.safari1.warps[`${warden.x},${warden.y + 1}`]?.[0]).toBe('bridge');
    expect(MAPS.bridge.warps['6,0']).toEqual(['safari1', warden.x, warden.y - 1, 'up']);
  });
  it("the span's north rail is a gated door (ch7Done) with the old sign moved beside it", () => {
    expect(MAPS.bridge.grid[0][6]).toBe('o');
    expect(MAPS.bridge.gates?.['6,0']?.cond).toEqual({ flag: 'ch7Done' });
    expect(MAPS.bridge.signs['7,1']).toBeDefined(); // readable from (6,1), the approach tile
  });
  it('the safari region sits in the woods above the span rect', () => {
    const safari = REGIONS.find((r) => r.id === 'safari')!;
    const span = REGIONS.find((r) => r.id === 'span')!;
    expect(safari.world.x).toBe(span.world.x);
    expect(safari.world.y + safari.world.h).toBeLessThanOrEqual(span.world.y);
  });
  it("the inside man wears a `!` until he has taught the rules, teaches only once briefed (the PASS), and is the only setter of ch8Rules", () => {
    const man = MAPS.safari1.npcs.find((n) => n.id === 'insider')!;
    expect(man.todoIf).toEqual({ notFlag: 'ch8Rules' });
    expect(everySetter('ch8Rules')).toEqual(['safari1:npc:insider']);
    const gate = flatten(MAPS.safari1.scripts['npc:insider']).find((s) => 'if' in s && 'notFlag' in s.if && s.if.notFlag === 'ch8Briefed');
    expect(gate, 'no pass, no park').toBeDefined();
  });
});

describe('CH8.0 §6 Giovanni — briefing once, two hand-ins (worker B gate)', () => {
  const gio = () => flatten(hqScripts['npc:giovanni']);
  it('the SAFARI PASS is handed over exactly once, behind ch8Briefed', () => {
    const gives = gio().filter((s) => 'giveItem' in s && s.giveItem === 'SAFARI PASS');
    expect(gives).toHaveLength(1);
    expect(everySetter('ch8Briefed')).toEqual(['hq:npc:giovanni']);
  });
  it('the loyal hand-in pays 2500c; the betrayal hand-in pays nothing; neither promotes', () => {
    expect(gio().some((s) => 'addCoins' in s && s.addCoins === 2500)).toBe(true);
    expect(everySetter('ch8Done')).toEqual(['hq:npc:giovanni']);
    // rankUp appears in the chain for CH4/CH6 only — the count stays what CH7 left it
    const rankUps = gio().filter((s) => 'rankUp' in s).length;
    expect(rankUps).toBe(2);
  });
});
