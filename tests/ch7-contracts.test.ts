// CH7.0 contracts (.paul/plan/ch7-power-plant-design-2026-09-09.md): the
// pieces the KANTOO POWER PLANT stands on — the heat floor as one heatTick
// guard, the `z`/`e` tiles, the items, the ch7 objective derivation, the
// frozen grids and the dock door — plus the data lints that keep the
// chapter's content honest: every mine is a catchable wild VOLTORBB whose
// encounter spends its var in onWin only, the three set-piece flags are set
// by exactly plant_voltrawk's three callbacks, the TECHNICIANs pay once,
// Myowth teaches every rule, the HQ chain hands over three PRO BALLs and
// pays 1200c with no rank. Written before workers A/B landed — the species,
// mine, trainer, wild-table, set-piece and HQ cases are their gate.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { quest, resetQuest, currentObjective, CHAPTERS } from '../src/systems/quest';
import { usableInBattle } from '../src/systems/inventory';
import { MAPS } from '../src/data/maps';
import { ENCOUNTERS } from '../src/data/encounters';
import { ITEMS } from '../src/data/items';
import { SPECIES } from '../src/data/mons';
import { SHOPS } from '../src/data/shops';
import { TILES, WALKABLE } from '../src/data/tiles';
import { BG_PAL, OBJ_PAL } from '../src/data/palettes';
import { G } from '../src/state';
import { heatTick, clearMapGuardRuntime, worldHooks } from '../src/systems/world';
import { reduceHeat, DECAY_SECONDS } from '../src/systems/heat';
import { hqScripts } from '../src/data/dialog/hq';
import type { MapDef, MapId, ScriptStep, FlagName } from '../src/types';

const PLANT: MapId[] = ['plant1', 'plant2', 'plant3'];
const MINES: [number, number][] = [[9, 4], [12, 5], [15, 4], [11, 6]];

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
function cells(map: MapDef, ch: string): [number, number][] {
  const out: [number, number][] = [];
  map.grid.forEach((row, y) => row.forEach((c, x) => { if (c === ch) out.push([x, y]); }));
  return out;
}
function saidText(steps: ScriptStep[]): string {
  return flatten(steps).flatMap((s) => ('say' in s ? s.say.flat() : [])).join(' ');
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

beforeEach(() => resetQuest());

describe('CH7.0 §1/§2/§3 tiles + palettes', () => {
  it('`z` LIVE FLOOR has two 16×16 frames and is walkable', () => {
    expect(TILES.z).toHaveLength(2);
    for (const frame of TILES.z) {
      expect(frame).toHaveLength(16);
      for (const row of frame) expect(row).toHaveLength(16);
    }
    expect(WALKABLE.has('z')).toBe(true);
  });
  it('`e` CELL is one 16×16 frame and walkable', () => {
    expect(TILES.e).toHaveLength(1);
    expect(TILES.e[0]).toHaveLength(16);
    for (const row of TILES.e[0]) expect(row).toHaveLength(16);
    expect(WALKABLE.has('e')).toBe(true);
  });
  it('BG_PAL.plant has the ALERT slot; OBJ_PAL.hurt carries the gear slot; OBJ_PAL.plant dresses the TECHNICIANs', () => {
    expect(BG_PAL.plant).toHaveLength(5);
    expect(OBJ_PAL.hurt).toHaveLength(5);
    expect(OBJ_PAL.hurt[4]).toBe(OBJ_PAL.player[4]);
    expect(OBJ_PAL.plant).toHaveLength(4);
  });
});

describe('CH7.0 §1 the heat floor (one heatTick guard)', () => {
  beforeEach(() => {
    G.heatState = {};
    G.state = 'world';
    G.frame = 1; // off every gaze beat — the posted guards must not see anything here
    G.playSeconds = 0;
    G.battle = null;
    G.map = MAPS.plant1;
    Object.assign(G.player, { x: 9, y: 10, dir: 'up', moving: false, prog: 0 });
    clearMapGuardRuntime('plant1');
  });
  afterEach(() => {
    G.map = MAPS.hq;
    G.heatState = {};
    clearMapGuardRuntime('plant1');
  });
  it('every plant map floors at stage 1, with no zone and no watch (stage 1 already scans)', () => {
    for (const id of PLANT) {
      expect(MAPS[id].minStage, `${id} minStage`).toBe(1);
      expect(MAPS[id].heatZone, `${id} zone`).toBeUndefined();
      expect(MAPS[id].watch, `${id} watch`).toBeUndefined();
    }
  });
  it('arrival: an absent record becomes stage 1 on the first tick', () => {
    heatTick();
    expect(G.heatState.plant1?.stage).toBe(1);
  });
  it('decay: 60 quiet seconds later it is still 1', () => {
    heatTick();
    G.playSeconds = DECAY_SECONDS * 2 + 1;
    heatTick();
    expect(G.heatState.plant1?.stage).toBe(1);
  });
  it('SMOKE BALL below the floor: reduceHeat empties the record, the next tick re-floors it', () => {
    heatTick();
    reduceHeat(G.heatState, 'plant1', G.playSeconds);
    expect(G.heatState.plant1).toBeUndefined();
    heatTick();
    expect(G.heatState.plant1?.stage).toBe(1);
  });
  it('a script { heat: 0 } is raised back to 1 on the next tick; { heat: 2 } is left alone', () => {
    heatTick();
    worldHooks.heat(0);
    heatTick();
    expect(G.heatState.plant1?.stage).toBe(1);
    worldHooks.heat(2);
    heatTick();
    expect(G.heatState.plant1?.stage).toBe(2);
  });
  it('a map without minStage is untouched by the guard (HQ stays calm)', () => {
    G.map = MAPS.hq;
    heatTick();
    expect(G.heatState.hq).toBeUndefined();
  });
});

describe('CH7.0 §8 items', () => {
  it('RUBBER BOOTS is a key item, ENERGY CELL a quest item, neither buyable; the PRO BALL is a priced 2.5× ball', () => {
    expect(ITEMS['RUBBER BOOTS']).toMatchObject({ kind: 'key', price: 0 });
    expect(ITEMS['ENERGY CELL']).toMatchObject({ kind: 'quest', price: 0 });
    expect(ITEMS['PRO BALL']).toMatchObject({ kind: 'ball', ballMod: 2.5 });
    // 999, not Lyall's 2000: the stackable shop row shows '$' + 3 digits
    // (PLAN.md A1). A different number is a Lyall decision — change it here.
    expect(ITEMS['PRO BALL'].price).toBe(999);
  });
  it('the BOOTS and the CELL never show up in a battle item list; the PRO BALL does', () => {
    expect(usableInBattle('RUBBER BOOTS')).toBe(false);
    expect(usableInBattle('ENERGY CELL')).toBe(false);
    expect(usableInBattle('PRO BALL')).toBe(true);
  });
  it('BALL.0: the HQ stall sells PRO BALLs only through hqStallPro, which the vendor opens on ch7Done', () => {
    expect(SHOPS.hqStall.stock).not.toContain('PRO BALL');
    expect(SHOPS.hqStallPro.stock).toContain('PRO BALL');
    const vendor = hqScripts['npc:vendor'];
    const gate = vendor.find((s) => 'if' in s);
    expect(gate && 'if' in gate ? gate.if : null).toEqual({ flag: 'ch7Done' });
    if (!gate || !('if' in gate)) return;
    expect(gate.then).toEqual([{ shop: 'hqStallPro' }]);
    expect(gate.else).toEqual([{ shop: 'hqStall' }]);
  });
});

describe('CH7.0 §8 objectives', () => {
  function afterCh6(): void {
    for (const f of [
      'briefed', 'guardBeaten', 'switchFound', 'lootTaken', 'missionDone',
      'fossilsTaken', 'bradBeaten', 'ch2Done', 'spanLass', 'ch3Done',
      'ch4Suit', 'ch4Safe', 'ch4Done', 'ch5Spirit', 'ch5Mask', 'ch5Done',
      'ch6Rules', 'ch6Duo', 'ch6Ball', 'ch6Done',
    ] as const) quest.flags[f] = true;
    quest.items.push('SILF SCOPE', 'CARD KEY');
  }
  it('is registered with five ≤17-char steps in order', () => {
    const ch7 = CHAPTERS.find((c) => c.id === 'ch7')!;
    expect(ch7.steps.map((s) => s.objective)).toEqual(['GO TO ANN DOCK', 'FIND THE BOOTS', 'TAKE THE CELL', 'ESCAPE THE PLANT', 'REPORT TO BOSS']);
    for (const s of ch7.steps) expect(s.objective.length).toBeLessThanOrEqual(17);
  });
  it('derives in order; any one of the three set-piece flags escapes the plant', () => {
    afterCh6();
    expect(currentObjective()).toBe('GO TO ANN DOCK');
    quest.flags.ch7Rules = true;
    expect(currentObjective()).toBe('FIND THE BOOTS');
    quest.items.push('RUBBER BOOTS');
    expect(currentObjective()).toBe('TAKE THE CELL');
    quest.flags.ch7Cell = true;
    expect(currentObjective()).toBe('ESCAPE THE PLANT');
    for (const f of ['ch7Caught', 'ch7Beaten', 'ch7Fled'] as const) {
      resetQuest();
      afterCh6();
      quest.flags.ch7Rules = true;
      quest.items.push('RUBBER BOOTS');
      quest.flags.ch7Cell = true;
      quest.flags[f] = true;
      expect(currentObjective(), f).toBe('REPORT TO BOSS');
      quest.flags.ch7Done = true;
      expect(currentObjective()).toBe('CATCH 15 LINES'); // F43-FB A1: the MAZTER BALL side quest takes the line after CH7
      quest.flags.sureBall = true;
      expect(currentObjective()).toBe('AWAIT ORDERS.');
    }
  });
});

describe('CH7.0 §9 maps', () => {
  it('three floors within the 28×20 cap, all plant palette + track', () => {
    for (const id of PLANT) {
      expect(MAPS[id].w).toBeLessThanOrEqual(28);
      expect(MAPS[id].h).toBeLessThanOrEqual(20);
      expect(MAPS[id].pal).toBe('plant');
      expect(MAPS[id].music).toBe('plant');
    }
  });
  it('the dock grew a south door that pairs with the 1F door, signposted beside it', () => {
    expect(MAPS.dock.grid[9][9]).toBe('o');
    expect(MAPS.dock.warps['9,9']).toEqual(['plant1', 9, 10, 'up']);
    expect(MAPS.plant1.grid[11][9]).toBe('o');
    expect(MAPS.plant1.warps['9,11']).toEqual(['dock', 9, 8, 'up']);
    expect(MAPS.dock.grid[8][8]).toBe('s');
    expect(MAPS.dock.signs['8,8'].flat().join(' ')).toContain('POWER PLANT');
  });
  it('the stairs pair both ways: 1F ↔ 2F ↔ 3F', () => {
    expect(MAPS.plant1.warps['17,1']).toEqual(['plant2', 1, 10, 'down']);
    expect(MAPS.plant2.warps['1,10']).toEqual(['plant1', 17, 1, 'down']);
    expect(MAPS.plant2.warps['22,10']).toEqual(['plant3', 1, 9, 'down']);
    expect(MAPS.plant3.warps['1,9']).toEqual(['plant2', 22, 10, 'down']);
    for (const [id, key] of [['plant1', '17,1'], ['plant2', '1,10'], ['plant2', '22,10'], ['plant3', '1,9']] as const) {
      const [x, y] = key.split(',').map(Number);
      expect(MAPS[id].grid[y][x], `${id} ${key}`).toBe('>');
    }
  });
  it('every floor posts at least one TECHNICIAN heatGuard on plant_watch — a delay, not a payday', () => {
    for (const id of PLANT) {
      const guards = MAPS[id].npcs.filter((n) => n.heatGuard);
      expect(guards.length, `${id} guards`).toBeGreaterThanOrEqual(1);
      for (const g of guards) expect(g.heatGuard!.encounterId).toBe('plant_watch');
    }
    expect(ENCOUNTERS.plant_watch.trainer).toBeDefined();
    expect(ENCOUNTERS.plant_watch.foe.species).toBe('magnemyt'); // §6 — the chapter's new species IS the guard fight
    expect(ENCOUNTERS.plant_watch.onWin).toEqual([]);
    expect(ENCOUNTERS.plant_watch.onLose).toEqual([]);
  });
});

describe('CH7.0 §2 the 1F strip and the BOOTS', () => {
  it('column 9 rows 4–6 is the only opening in the wall band, and it is LIVE FLOOR', () => {
    for (const y of [4, 5, 6]) {
      const row = MAPS.plant1.grid[y];
      expect(row[9]).toBe('z');
      expect(row.filter((c) => c !== '#')).toEqual(['z']);
    }
  });
  it('every floor carries LIVE FLOOR — the boots keep paying off (Lyall, 2026-09-09)', () => {
    for (const id of PLANT) expect(cells(MAPS[id], 'z').length, `${id} z tiles`).toBeGreaterThan(0);
    expect(MAPS.plant3.grid[5].slice(1, 19).every((c) => c === 'z')).toBe(true); // the 3F band
  });
  it('the RUBBER BOOTS are a pickup on 1F, north of the strip', () => {
    const entry = Object.entries(MAPS.plant1.items).find(([, p]) => p.item === 'RUBBER BOOTS');
    expect(entry).toBeDefined();
    const [key, p] = entry!;
    expect(p.id).toBe('plant_boots');
    const [x, y] = key.split(',').map(Number);
    expect(MAPS.plant1.grid[y][x]).toBe('b');
    expect(y).toBeLessThan(4);
  });
});

// ── Workers A/B gate: red until species, encounters and scripts land ──────
describe('CH7.0 §3 the minefield', () => {
  it('plant2 has twelve cells; exactly the four frozen mines carry a step: script, each gated on its own var and starting plant_mineN', () => {
    expect(cells(MAPS.plant2, 'e')).toHaveLength(12);
    const stepKeys = Object.keys(MAPS.plant2.scripts).filter((k) => k.startsWith('step:'));
    const mineKeys = stepKeys.filter((k) => flatten(MAPS.plant2.scripts[k]).some((s) => 'battle' in s));
    expect(mineKeys.sort()).toEqual(MINES.map(([x, y]) => `step:${x},${y}`).sort());
    MINES.forEach(([x, y], i) => {
      const n = i + 1;
      expect(MAPS.plant2.grid[y][x], `mine ${n} tile`).toBe('e');
      const steps = flatten(MAPS.plant2.scripts[`step:${x},${y}`]);
      expect(steps.some((s) => 'if' in s && 'varEq' in s.if && s.if.varEq[0] === 'mine' + n && s.if.varEq[1] === 1), `mine ${n} var gate`).toBe(true);
      expect(steps.some((s) => 'battle' in s && s.battle === 'plant_mine' + n), `mine ${n} battle`).toBe(true);
    });
  });
  it('every plant_mineN is a catchable wild VOLTORBB that spends mineN in onWin only (re-arms on flee/whiteout)', () => {
    for (let n = 1; n <= 4; n++) {
      const enc = ENCOUNTERS['plant_mine' + n];
      expect(enc, `plant_mine${n}`).toBeDefined();
      if (!enc) continue;
      expect(enc.trainer).toBeUndefined();
      expect(enc.uncatchable).toBeUndefined();
      expect(enc.foe.species).toBe('voltorbb');
      expect(flatten(enc.onWin).some((s) => 'incVar' in s && s.incVar === 'mine' + n), `mine ${n} onWin spends`).toBe(true);
      expect(flatten(enc.onFlee).some((s) => 'incVar' in s)).toBe(false);
      expect(flatten(enc.onLose).some((s) => 'incVar' in s)).toBe(false);
      expect(enc.onCatch).toBeUndefined(); // a catch runs onWin — that IS the spend
    }
  });
});

describe('CH7.0 §4 wilds', () => {
  it('1F and 3F roll MAGNEMYT (and VOLTORBB) on their vents; the cell store has no table', () => {
    for (const id of ['plant1', 'plant3'] as const) {
      const t = MAPS[id].encounters;
      expect(t, `${id} table`).toBeDefined();
      expect(t?.entries.some((e) => e.species === 'magnemyt'), `${id} magnemyt`).toBe(true);
      expect(cells(MAPS[id], '~').length).toBeGreaterThan(0);
    }
    expect(MAPS.plant2.encounters).toBeUndefined();
    expect(cells(MAPS.plant2, '~')).toHaveLength(0);
  });
});

describe('CH7.0 §10 species (SPR.E)', () => {
  it('MAGNEMYT → MAGNETUN at 30, VOLTORBB → ELECTRÖD at 30, VOLTRAWK a 5%-class legend with no evolution', () => {
    expect(SPECIES.magnemyt?.evolvesTo).toEqual({ id: 'magnetun', lv: 30 });
    expect(SPECIES.voltorbb.evolvesTo).toEqual({ id: 'electrod', lv: 30 });
    expect(SPECIES.magnetun?.evolvesTo).toBeUndefined();
    expect(SPECIES.electrod?.evolvesTo).toBeUndefined();
    expect(SPECIES.voltrawk).toBeDefined();
    expect(SPECIES.voltrawk?.evolvesTo).toBeUndefined();
    expect(SPECIES.voltrawk?.bossOnly).toBeUndefined();
    expect(SPECIES.voltrawk?.catchRate).toBeGreaterThanOrEqual(0.03);
    expect(SPECIES.voltrawk?.catchRate).toBeLessThanOrEqual(0.08);
    for (const id of ['magnemyt', 'magnetun', 'electrod', 'voltrawk']) expect(SPECIES[id]?.type, id).toContain('ELECTRIC');
  });
});

describe('CH7.0 §5 the VOLTRAWK set piece', () => {
  it('the CELL chest at (18,2) gives the ENERGY CELL, sets ch7Cell, opens the lid, and the enter script repairs it', () => {
    expect(MAPS.plant3.grid[2][18]).toBe('$');
    const at = flatten(MAPS.plant3.scripts['at:18,2'] ?? []);
    expect(at.some((s) => 'giveItem' in s && s.giveItem === 'ENERGY CELL')).toBe(true);
    expect(at.some((s) => 'setFlag' in s && s.setFlag === 'ch7Cell')).toBe(true);
    expect(at.some((s) => 'setTile' in s && s.setTile[0] === 18 && s.setTile[1] === 2 && s.setTile[2] === '%')).toBe(true);
    const enter = flatten(MAPS.plant3.scripts.enter ?? []);
    expect(enter.some((s) => 'setTile' in s && s.setTile[0] === 18 && s.setTile[1] === 2 && s.setTile[2] === '%')).toBe(true);
  });
  it('the exit corridor tile (7,8) is the only gap in row 8 and carries the dive, gated on the CELL and no outcome yet', () => {
    const row = MAPS.plant3.grid[8];
    expect(row.map((c, x) => (c !== '#' ? x : -1)).filter((x) => x >= 0)).toEqual([7]);
    const steps = flatten(MAPS.plant3.scripts['step:7,8'] ?? []);
    expect(steps.length).toBeGreaterThan(0);
    expect(steps.some((s) => 'battle' in s && s.battle === 'plant_voltrawk')).toBe(true);
    const gate = MAPS.plant3.scripts['step:7,8']?.find((s) => 'if' in s);
    expect(gate && 'if' in gate ? JSON.stringify(gate.if) : '').toContain('ch7Cell');
    for (const f of ['ch7Caught', 'ch7Beaten', 'ch7Fled']) expect(gate && 'if' in gate ? JSON.stringify(gate.if) : '').toContain(`"notFlag":"${f}"`);
  });
  it('plant_voltrawk is a catchable wild VOLTRAWK whose three callbacks set the three flags — and nothing else in the game sets them', () => {
    const enc = ENCOUNTERS.plant_voltrawk;
    expect(enc).toBeDefined();
    if (!enc) return;
    expect(enc.trainer).toBeUndefined();
    expect(enc.uncatchable).toBeUndefined();
    expect(enc.foe.species).toBe('voltrawk');
    expect(enc.onLose).toEqual([]);
    expect(everySetter('ch7Caught')).toEqual(['plant_voltrawk.onCatch']);
    expect(everySetter('ch7Beaten')).toEqual(['plant_voltrawk.onWin']);
    expect(everySetter('ch7Fled')).toEqual(['plant_voltrawk.onFlee']);
  });
});

describe('CH7.0 §6 TECHNICIAN paydays', () => {
  it('tech1..3 fight plantTech1..3 once each, behind their own flag', () => {
    for (let n = 1; n <= 3; n++) {
      const map = MAPS[('plant' + n) as MapId];
      const npc = map.npcs.find((x) => x.id === 'tech' + n);
      expect(npc, `tech${n} npc`).toBeDefined();
      const steps = flatten(map.scripts['npc:tech' + n] ?? []);
      expect(steps.some((s) => 'battle' in s && s.battle === 'plantTech' + n), `tech${n} battle`).toBe(true);
      expect(steps.some((s) => 'if' in s && 'notFlag' in s.if && s.if.notFlag === 'plantTech' + n), `tech${n} gate`).toBe(true);
      const enc = ENCOUNTERS['plantTech' + n];
      expect(enc, `plantTech${n} encounter`).toBeDefined();
      expect(enc?.trainer).toBe('TECHNICIAN');
      expect(flatten(enc?.onWin ?? []).some((s) => 'setFlag' in s && s.setFlag === 'plantTech' + n)).toBe(true);
      expect(flatten(enc?.onWin ?? []).some((s) => 'addCoins' in s)).toBe(true);
    }
  });
});

describe('CH7.0 §7 Myowth at the door', () => {
  it('stands beside the 1F door until ch7Rules; his script sets it, puffs first, and names every rule', () => {
    const npc = MAPS.plant1.npcs.find((n) => n.id === 'myowth')!;
    expect(npc.char).toBe('myowth');
    expect(npc.goneIf).toEqual({ flag: 'ch7Rules' });
    expect(Math.abs(npc.x - 9) + Math.abs(npc.y - 10)).toBe(1); // one tile from the door landing
    const steps = flatten(MAPS.plant1.scripts['npc:myowth'] ?? []);
    const flag = steps.findIndex((s) => 'setFlag' in s && s.setFlag === 'ch7Rules');
    const poof = steps.findIndex((s) => 'fx' in s && s.fx.id === 'poof');
    expect(flag).toBeGreaterThanOrEqual(0);
    expect(poof).toBeGreaterThanOrEqual(0);
    expect(poof).toBeLessThan(flag);
    const text = saidText(MAPS.plant1.scripts['npc:myowth'] ?? []);
    for (const rule of ['ALARM', 'LIVE FLOOR', '1 HP', 'BOOTS', 'VOLTORBB', 'CELL', 'WINGS']) {
      expect(text, `Myowth never mentions ${rule}`).toContain(rule);
    }
  });
});

describe('CH7.0 §8/§11 the HQ chain', () => {
  it("Giovanni's briefing sets ch7Briefed and hands over three PRO BALLs after the CH6 afterglow", () => {
    const steps = flatten(hqScripts['npc:giovanni']);
    expect(steps.some((s) => 'setFlag' in s && s.setFlag === 'ch7Briefed')).toBe(true);
    expect(steps.filter((s) => 'giveItem' in s && s.giveItem === 'PRO BALL')).toHaveLength(3);
    const rows = MAPS.hq.npcs.find((n) => n.id === 'giovanni')!.todoIf;
    expect(JSON.stringify(rows)).toContain('ch7Briefed');
    expect(JSON.stringify(rows)).toContain('ENERGY CELL');
  });
  it('the hand-in: ch7Done → 1200c → endScreen, no rankUp anywhere in the CH7 branch', () => {
    const steps = flatten(hqScripts['npc:giovanni']);
    const done = steps.findIndex((s) => 'setFlag' in s && s.setFlag === 'ch7Done');
    expect(done).toBeGreaterThanOrEqual(0);
    const tail = steps.slice(done, done + 8);
    expect(tail.some((s) => 'addCoins' in s && s.addCoins === 1200)).toBe(true);
    expect(tail.some((s) => 'endScreen' in s)).toBe(true);
    expect(tail.some((s) => 'rankUp' in s)).toBe(false);
    // the hand-in reads the CELL out of the PACK AND needs an outcome flag —
    // a whiteout leaves the CELL in the PACK with no dive faced (review, 2026-09-09)
    const gate = steps.find((s) => 'if' in s && JSON.stringify(s.if).includes('"hasItem":"ENERGY CELL"'));
    expect(gate).toBeDefined();
    const cond = gate && 'if' in gate ? JSON.stringify(gate.if) : '';
    for (const f of ['ch7Caught', 'ch7Beaten', 'ch7Fled']) expect(cond).toContain(`"flag":"${f}"`);
  });
});
