// CH6.0 contracts (.paul/PLAN.md 2026-08-29): the pieces the SYLPHCO TOWER
// stands on — two tiles, two items, the ch6 objective derivation — plus the
// data lints that keep the chapter's content honest: lift pads pair both
// ways, every card-key door has its script AND its reload repair, the
// stealth floors carry watch + guards and no wild table, the heal pad
// asks before it heals, the bodyguard duo chains with no heal between,
// and eye contact on the real 2F grid raises the ALARM. Written before
// worker B's scripts landed — the door/heal/duo/DJames cases are that
// worker's gate.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { quest, resetQuest, currentObjective, CHAPTERS } from '../src/systems/quest';
import { usableInBattle } from '../src/systems/inventory';
import { MAPS } from '../src/data/maps';
import { ENCOUNTERS } from '../src/data/encounters';
import { ITEMS } from '../src/data/items';
import { TILES, WALKABLE } from '../src/data/tiles';
import { BG_PAL } from '../src/data/palettes';
import { G } from '../src/state';
import { heatTick, guardRuntime, clearMapGuardRuntime } from '../src/systems/world';
import type { MapDef, MapId, ScriptStep } from '../src/types';

const SYL: MapId[] = ['syl1', 'syl2', 'syl3', 'syl4', 'syl5'];
const STEALTH: MapId[] = ['syl2', 'syl4'];
const BATTLE: MapId[] = ['syl1', 'syl3', 'syl5'];

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

beforeEach(() => resetQuest());

describe('CH6.0 §1 tiles', () => {
  it('`d` LOCKED DOOR is registered, 16×16 and blocks', () => {
    expect(TILES.d).toHaveLength(1);
    for (const row of TILES.d[0]) expect(row).toHaveLength(16);
    expect(TILES.d[0]).toHaveLength(16);
    expect(WALKABLE.has('d')).toBe(false);
  });
  it('`h` HEAL PAD is registered with two pulse frames and is walkable', () => {
    expect(TILES.h).toHaveLength(2);
    for (const frame of TILES.h) {
      expect(frame).toHaveLength(16);
      for (const row of frame) expect(row).toHaveLength(16);
    }
    expect(WALKABLE.has('h')).toBe(true);
  });
  it('BG_PAL.sylph exists with the ALERT slot', () => {
    expect(BG_PAL.sylph).toHaveLength(5);
  });
});

describe('CH6.0 §8 items', () => {
  it('CARD KEY is a key item, BOSS BALL a quest item, neither buyable', () => {
    expect(ITEMS['CARD KEY']).toMatchObject({ kind: 'key', price: 0 });
    expect(ITEMS['BOSS BALL']).toMatchObject({ kind: 'quest', price: 0 });
  });
  it('the CARD KEY never shows up in a battle item list', () => {
    expect(usableInBattle('CARD KEY')).toBe(false);
    expect(usableInBattle('CARD KEY', ['BONE CHARM'])).toBe(false);
  });
});

describe('CH6.0 §10 objectives', () => {
  function afterCh5(): void {
    for (const f of [
      'briefed', 'guardBeaten', 'switchFound', 'lootTaken', 'missionDone',
      'fossilsTaken', 'bradBeaten', 'ch2Done', 'spanLass', 'ch3Done',
      'ch4Suit', 'ch4Safe', 'ch4Done', 'ch5Spirit', 'ch5Mask', 'ch5Done',
    ] as const) quest.flags[f] = true;
    quest.items.push('SILF SCOPE');
  }
  it('is registered with five ≤17-char steps in order', () => {
    const ch6 = CHAPTERS.find((c) => c.id === 'ch6')!;
    expect(ch6.steps.map((s) => s.objective)).toEqual(['TALK TO DJAMES', 'FIND THE CARD KEY', 'BEAT THE GUARDS', 'STEAL BOSS BALL', 'REPORT TO BOSS']);
    for (const s of ch6.steps) expect(s.objective.length).toBeLessThanOrEqual(17);
  });
  it('derives in order from the rules talk through the hand-in', () => {
    afterCh5();
    expect(currentObjective()).toBe('TALK TO DJAMES');
    quest.flags.ch6Rules = true;
    expect(currentObjective()).toBe('FIND THE CARD KEY');
    quest.items.push('CARD KEY');
    expect(currentObjective()).toBe('BEAT THE GUARDS');
    quest.flags.ch6Duo = true;
    expect(currentObjective()).toBe('STEAL BOSS BALL');
    quest.flags.ch6Ball = true;
    expect(currentObjective()).toBe('REPORT TO BOSS');
    quest.flags.ch6Done = true;
    expect(currentObjective()).toBe('AWAIT ORDERS.');
  });
});

describe('CH6.0 §3 lift pads pair both ways', () => {
  it('every W on a syl map has a warp that lands ON the partner W, and the partner warps back', () => {
    let pads = 0;
    for (const id of SYL) {
      const map = MAPS[id];
      for (const [x, y] of cells(map, 'W')) {
        pads++;
        const w = map.warps[`${x},${y}`];
        expect(w, `${id} pad (${x},${y}) has no warp`).toBeDefined();
        const [tid, tx, ty] = w;
        expect(MAPS[tid].grid[ty]?.[tx], `${id} pad (${x},${y}) lands off-pad on ${tid} (${tx},${ty})`).toBe('W');
        expect(MAPS[tid].warps[`${tx},${ty}`], `${tid} (${tx},${ty}) does not warp back to ${id} (${x},${y})`).toEqual([id, x, y, 'down']);
      }
    }
    expect(pads).toBe(12); // six pairs
  });
  it('every syl map stays within the 28×20 build cap and the lobby door pairs with the dock', () => {
    for (const id of SYL) {
      expect(MAPS[id].w).toBeLessThanOrEqual(28);
      expect(MAPS[id].h).toBeLessThanOrEqual(20);
    }
    expect(MAPS.syl1.warps['9,11']).toEqual(['dock', 18, 6, 'left']);
    expect(MAPS.dock.warps['19,6']).toEqual(['syl1', 9, 10, 'up']);
    expect(MAPS.dock.grid[6][19]).toBe('o');
  });
});

describe('CH6.0 §6 stealth floors vs battle floors', () => {
  it('syl2/syl4 watch at ALARM 0, carry ≥3 resolving heatGuards, no wild table, no zone', () => {
    for (const id of STEALTH) {
      const map = MAPS[id];
      expect(map.watch, `${id} watch`).toBe(true);
      expect(map.heatZone, `${id} must not share a zone — leaving the floor clears it`).toBeUndefined();
      expect(map.encounters, `${id} has a wild table`).toBeUndefined();
      const guards = map.npcs.filter((n) => n.heatGuard);
      expect(guards.length, `${id} guard count`).toBeGreaterThanOrEqual(3);
      for (const g of guards) expect(ENCOUNTERS[g.heatGuard!.encounterId], `${id} ${g.id}`).toBeDefined();
    }
  });
  it('battle floors carry no heatGuard and no watch', () => {
    for (const id of BATTLE) {
      expect(MAPS[id].npcs.some((n) => n.heatGuard), `${id} has a guard`).toBe(false);
      expect(MAPS[id].watch).toBeUndefined();
    }
  });
  it('syl_watch is a delay, not a payday', () => {
    expect(ENCOUNTERS.syl_watch.onWin).toEqual([]);
    expect(ENCOUNTERS.syl_watch.onLose).toEqual([]);
  });
});

describe('CH6.0 §6 eye contact on the real 2F grid raises the ALARM (1f.15 + CH4.0 §1b)', () => {
  beforeEach(() => {
    G.heatState = {};
    G.state = 'world';
    G.frame = 0;
    G.playSeconds = 0;
    G.battle = null;
    clearMapGuardRuntime('syl2');
  });
  afterEach(() => {
    G.map = MAPS.hq;
    G.state = 'world';
    G.heatState = {};
    clearMapGuardRuntime('syl2');
  });
  it('guard_a facing left sees (4,2): stage 0 → 1, startle armed; column 1 is never seen', () => {
    G.map = MAPS.syl2;
    const guard = MAPS.syl2.npcs.find((n) => n.id === 'guard_a')!;
    Object.assign(G.player, { x: 4, y: 2, dir: 'down', moving: false, prog: 0 });
    // the idle gaze is 'left' for frames 270..359 of each 360-frame sweep;
    // 270 is also a GAZE_CHECK_EVERY (15) beat — watch:true scans at stage 0
    G.frame = 270;
    heatTick();
    expect(guard.faceDir).toBe('left');
    expect(G.heatState.syl2?.stage).toBe(1);
    expect(guardRuntime('syl2', guard).spotFlash).toBeGreaterThan(0);
    // the same beat with the player in column 1 (the cone-free lane): calm
    G.heatState = {};
    clearMapGuardRuntime('syl2');
    Object.assign(G.player, { x: 1, y: 2 });
    for (G.frame = 1; G.frame <= 360; G.frame++) heatTick();
    expect(G.heatState.syl2).toBeUndefined();
  });
});

// ── Worker B's gate: red until src/data/dialog/syl*.ts, encounters and the
//    HQ chain land per .paul/plan/ch6-sylphco/content.md ───────────────────
describe('CH6.0 §2 card-key doors', () => {
  it('every `d` has an at: script that opens it on the CARD KEY, hints otherwise, and an enter repair', () => {
    let doors = 0;
    for (const id of SYL) {
      const map = MAPS[id];
      for (const [x, y] of cells(map, 'd')) {
        doors++;
        const at = map.scripts[`at:${x},${y}`];
        expect(at, `${id} door (${x},${y}) has no at: script`).toBeDefined();
        const steps = flatten(at ?? []);
        expect(steps.some((s) => 'setTile' in s && s.setTile[0] === x && s.setTile[1] === y && s.setTile[2] === 'o'), `${id} door (${x},${y}) never opens`).toBe(true);
        expect(steps.some((s) => 'if' in s && 'hasItem' in s.if && s.if.hasItem === 'CARD KEY'), `${id} door (${x},${y}) is not gated on the CARD KEY`).toBe(true);
        expect(steps.some((s) => 'say' in s && s.say.flat().join(' ').includes('3F')), `${id} door (${x},${y}) locked page does not say where the key is`).toBe(true);
        const enter = flatten(map.scripts.enter ?? []);
        expect(enter.some((s) => 'setTile' in s && s.setTile[0] === x && s.setTile[1] === y && s.setTile[2] === 'o'), `${id} door (${x},${y}) has no enter repair`).toBe(true);
      }
    }
    expect(doors).toBe(4);
  });
});

describe('CH6.0 §4 heal pad', () => {
  it('the `h` tile has a step: script that asks first, then runs healParty', () => {
    const [x, y] = cells(MAPS.syl5, 'h')[0];
    const step = MAPS.syl5.scripts[`step:${x},${y}`];
    expect(step, 'no step: script on the heal pad').toBeDefined();
    const choice = (step ?? []).find((s) => 'choice' in s);
    expect(choice, 'the pad must ask before it heals').toBeDefined();
    if (!choice || !('choice' in choice)) return;
    expect(choice.choice.say[choice.choice.say.length - 1].length).toBeLessThanOrEqual(2);
    expect(flatten(choice.choice.yes).some((s) => 'healParty' in s)).toBe(true);
    expect(flatten(choice.choice.no ?? []).some((s) => 'healParty' in s)).toBe(false);
  });
});

describe('CH6.0 §5 bodyguard duo', () => {
  it('guard 1 chains straight into guard 2 with no heal; guard 2 sets ch6Duo; a wipe records nothing', () => {
    const g1 = ENCOUNTERS.syl_guard1;
    const g2 = ENCOUNTERS.syl_guard2;
    expect(g1).toBeDefined();
    expect(g2).toBeDefined();
    expect(g1.trainer).toBe('BODYGUARD');
    expect(g2.trainer).toBe('BODYGUARD');
    expect(g1.onWin.some((s) => 'battle' in s && s.battle === 'syl_guard2')).toBe(true);
    expect(flatten(g1.onWin).some((s) => 'healParty' in s)).toBe(false);
    expect(flatten(g2.onWin).some((s) => 'setFlag' in s && s.setFlag === 'ch6Duo')).toBe(true);
    expect(g1.onLose).toEqual([]);
    expect(g2.onLose).toEqual([]);
    expect(g2.foe.lv).toBeGreaterThan(g1.foe.lv);
  });
  it('both bodyguard NPCs run the duo and leave once it is won', () => {
    for (const id of ['guard_a', 'guard_b']) {
      const npc = MAPS.syl5.npcs.find((n) => n.id === id)!;
      expect(npc.goneIf).toEqual({ flag: 'ch6Duo' });
      const steps = flatten(MAPS.syl5.scripts[`npc:${id}`] ?? []);
      expect(steps.some((s) => 'battle' in s && s.battle === 'syl_guard1'), `${id} does not start the duo`).toBe(true);
    }
  });
});

describe('CH6.0 §7 DJames teaches the rules from the pad', () => {
  it('stands on pad A until ch6Rules; his script sets it, hands over one SMOKE BALL, and names every rule', () => {
    const npc = MAPS.syl1.npcs.find((n) => n.id === 'djames')!;
    expect([npc.x, npc.y]).toEqual([3, 4]);
    expect(MAPS.syl1.grid[4][3]).toBe('W');
    expect(npc.goneIf).toEqual({ flag: 'ch6Rules' });
    const steps = flatten(MAPS.syl1.scripts['npc:djames'] ?? []);
    expect(steps.some((s) => 'setFlag' in s && s.setFlag === 'ch6Rules')).toBe(true);
    expect(steps.some((s) => 'giveItem' in s && s.giveItem === 'SMOKE BALL')).toBe(true);
    expect(steps.some((s) => 'setFlag' in s && s.setFlag === 'ch6Smoke')).toBe(true);
    const text = steps.flatMap((s) => ('say' in s ? s.say.flat() : [])).join(' ');
    for (const rule of ['EYE CONTACT', 'LOCKDOWN', '10%', 'SMOKE BALL', 'CARD KEY', 'BOSS BALL']) {
      expect(text, `DJames never mentions ${rule}`).toContain(rule);
    }
  });
});

describe('CH6.0 §10 the HQ chain', () => {
  it("Giovanni's hand-in promotes to EXECUTIVE before the end screen, and the briefing is marked", async () => {
    const { hqScripts } = await import('../src/data/dialog/hq');
    const steps = flatten(hqScripts['npc:giovanni']);
    expect(steps.some((s) => 'setFlag' in s && s.setFlag === 'ch6Briefed')).toBe(true);
    const done = steps.findIndex((s) => 'setFlag' in s && s.setFlag === 'ch6Done');
    expect(done).toBeGreaterThanOrEqual(0);
    const tail = steps.slice(done);
    const rank = tail.findIndex((s) => 'rankUp' in s);
    const end = tail.findIndex((s) => 'endScreen' in s);
    expect(rank).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(rank); // 1e rule: card first, endScreen last
    const rows = MAPS.hq.npcs.find((n) => n.id === 'giovanni')!.todoIf;
    expect(JSON.stringify(rows)).toContain('ch6Briefed');
    expect(JSON.stringify(rows)).toContain('ch6Ball');
  });
});
