// F43-FB A4 — TONIC: the status cure, in battle (ITEM menu) and out
// (PACK/PARTY). Two harnesses in one file: the battle-frame idiom from
// tests/status-battle.test.ts for the in-battle half, and the menuUpdate
// idiom from tests/menu.test.ts for the PACK/PARTY half.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { vi } from 'vitest';

const keys = { down: new Set<string>(), pressed: new Set<string>() };

vi.mock('../src/engine/renderer', () => ({
  ctx: { drawImage: vi.fn() },
  decode: vi.fn(() => ({})),
  fill: vi.fn(),
  rect: vi.fn(),
  text: vi.fn(),
  drawWindow: vi.fn(),
  clamp: (v: number, a: number, z: number) => Math.max(a, Math.min(z, v)),
  startFade: (cb: () => void) => cb(),
  W: 160,
  H: 144,
  TILE: 16,
}));
vi.mock('../src/engine/audio', () => ({
  Audio2: { play: vi.fn(), sfx: vi.fn(), setVolume: vi.fn(), setMuted: vi.fn(), volume: 1, muted: false },
}));
vi.mock('../src/engine/input', () => ({
  Input: {
    held: (k: string): boolean => keys.down.has(k),
    hit: (k: string): boolean => keys.pressed.has(k),
    endFrame: (): void => keys.pressed.clear(),
    dirHeld: (): null => null,
  },
}));

import { G } from '../src/state';
import { startBattle, battleUpdate, setBattleRng, monName, type BattleState } from '../src/systems/battle';
import { ENCOUNTERS } from '../src/data/encounters';
import { SPECIES } from '../src/data/mons';
import { MOVES } from '../src/data/moves';
import { makeMon } from '../src/systems/mon';
import { damage } from '../src/systems/combat';
import { quest, resetQuest } from '../src/systems/quest';
import { openMenu, menuUpdate, menuDraw, PARTY_FOOTER_Y } from '../src/systems/menu';
import { text } from '../src/engine/renderer';
import { BG_PAL } from '../src/data/palettes';

// ── battle-frame driver (copied from tests/status-battle.test.ts) ─────────
function frame(): void {
  battleUpdate();
  keys.pressed.clear();
}
function tap(k: string): void {
  keys.pressed.add(k);
  frame();
}
function b(): BattleState {
  return G.battle!;
}
function popMsg(): void {
  const s = b();
  const total = s.msg!.lines.join('').length;
  keys.down.add('a');
  let guard = 0;
  while (s.msgChars < total && guard++ < 500) frame();
  keys.down.delete('a');
  tap('a');
}
function settle(): void {
  let guard = 0;
  while (G.battle && guard++ < 300) {
    const s = G.battle;
    if (s.msg) popMsg();
    else if (s.queue.length || s.phase === 'slide' || s.phase === 'open' || s.phase === 'anim') frame();
    else return;
  }
  if (G.battle) throw new Error('settle(): battle never became interactive');
}
function begin(encId: string): void {
  startBattle(encId, () => {});
}

describe('TONIC in battle', () => {
  beforeEach(() => {
    resetQuest();
    G.party = [makeMon(SPECIES.koffink, 5), makeMon(SPECIES.geodood, 5)];
    G.box = [];
    G.lastHq = { map: 'hq', x: 9, y: 7 };
    G.battle = null;
    G.state = 'world';
    keys.down.clear();
    keys.pressed.clear();
    ENCOUNTERS.test_tonic = { foe: { species: 'voltorbb', lv: 3, moves: ['tackle'] }, winText: [], onWin: [], onLose: [], onFlee: [] };
  });
  afterEach(() => {
    setBattleRng(Math.random);
    delete ENCOUNTERS.test_tonic;
  });

  it('is listed in the ITEM menu', () => {
    quest.items.push('TONIC');
    begin('test_tonic');
    settle();
    tap('down'); tap('down'); tap('down'); // FIGHT->SWIPE->SWITCH->ITEM
    tap('a');
    expect(b().phase).toBe('item');
  });

  it('on a poisoned active mon: clears the status, says "shook it off!", consumes one, and the foe\'s TACKLE then lands for exactly damage()\'s roll', () => {
    quest.items.push('TONIC');
    begin('test_tonic');
    settle();
    const mon = G.party[0];
    mon.status = 'PSN';
    const hpBefore = mon.hp;
    // ITEM opens with no rng; target pick with no rng; applyItemTarget's
    // cure branch consumes none either — only the foe's own turn rolls:
    // 1 foe move idx (only 1 move) 2 foe accuracy (hit) 3 foe damage roll.
    // A constant rng means the damage roll below (a single rng() call
    // inside combat.ts's damage()) reads the exact same 0.5.
    setBattleRng(() => 0.5);
    tap('down'); tap('down'); tap('down'); // FIGHT->SWIPE->SWITCH->ITEM
    tap('a'); // open ITEM
    tap('a'); // pick TONIC (only entry, sel 0) -> target picker on meIdx
    tap('a'); // confirm target (active mon, sel already meIdx) -> cure applied
    const cureMsg = b().queue[b().queue.length - 1];
    expect(cureMsg.lines).toEqual([monName(mon), 'shook it off!']);
    settle();
    expect(mon.status).toBeUndefined();
    expect(quest.items).not.toContain('TONIC');
    const foeSp = SPECIES.voltorbb;
    const meSp = SPECIES.koffink;
    const dmg = damage({ lv: 3, move: MOVES.tackle, atk: foeSp.atk, def: meSp.def, defTypes: meSp.type }, () => 0.5);
    expect(mon.hp).toBe(Math.max(0, hpBefore - dmg));
  });

  it('on a healthy target: says "is / not sick!", refuses without consuming, and returns to the target list', () => {
    quest.items.push('TONIC');
    begin('test_tonic');
    settle();
    const mon = G.party[0];
    tap('down'); tap('down'); tap('down');
    tap('a'); // ITEM
    tap('a'); // TONIC -> target picker
    tap('a'); // confirm on the healthy active mon -> refusal queued
    const refusal = b().queue[b().queue.length - 1];
    expect(refusal.lines).toEqual([monName(mon) + ' is', 'not sick!']);
    settle();
    expect(quest.items).toContain('TONIC'); // not consumed
    expect(b().phase).toBe('target'); // refused back to the picker, not to the root menu
  });

  it('on a benched SLP mon: clears status AND sleepT', () => {
    quest.items.push('TONIC');
    begin('test_tonic');
    settle();
    const bench = G.party[1];
    bench.status = 'SLP';
    bench.sleepT = 2;
    setBattleRng(() => 0.5);
    tap('down'); tap('down'); tap('down');
    tap('a'); // ITEM
    tap('a'); // TONIC -> target picker (starts on meIdx)
    tap('down'); // move to the benched mon
    tap('a'); // confirm
    settle();
    expect(bench.status).toBeUndefined();
    expect(bench.sleepT).toBeUndefined();
    expect(quest.items).not.toContain('TONIC');
  });

  it('FB review: refuses a FAINTED target ("out cold", not "not sick") even if it carries a status, and does not consume', () => {
    quest.items.push('TONIC');
    begin('test_tonic');
    settle();
    const bench = G.party[1];
    bench.hp = 0;
    bench.status = 'PSN'; // carries a status AND is fainted — hp check must win
    tap('down'); tap('down'); tap('down');
    tap('a'); // ITEM
    tap('a'); // TONIC -> target picker
    tap('down'); // move to the fainted bench mon
    tap('a'); // confirm -> the fainted refusal, not the cure
    const refusal = b().queue[b().queue.length - 1];
    expect(refusal.lines).toEqual(["It's out cold!", "A SODA won't", 'wake it.']);
    settle();
    expect(bench.status).toBe('PSN'); // untouched — refused before the cure branch
    expect(quest.items).toContain('TONIC'); // not consumed
    expect(b().phase).toBe('target');
  });
});

// ── PACK/PARTY (menu.test.ts idiom) ────────────────────────────────────────
describe('TONIC in PACK/PARTY', () => {
  function mframe(): void {
    menuUpdate();
    keys.pressed.clear();
  }
  function mtap(k: string): void {
    keys.pressed.add(k);
    mframe();
  }

  beforeEach(() => {
    resetQuest();
    G.party = [makeMon(SPECIES.koffink, 5)];
    keys.down.clear();
    keys.pressed.clear();
  });

  it("PACK flashes the exact 'USE IN PARTY.' redirect for TONIC", () => {
    quest.items.push('TONIC');
    openMenu();
    mtap('a'); // open PACK (sel 0), entries = [TONIC]
    mtap('a'); // use TONIC from the pack list -> flash(p, 'USE IN PARTY.')
    vi.mocked(text).mockClear();
    menuDraw(BG_PAL.green);
    expect(text).toHaveBeenCalledWith('USE IN PARTY.', 6, 132, expect.any(String));
    expect(quest.items).toContain('TONIC'); // not consumed — PARTY owns the target pick
  });

  it("PARTY use cures a status, flashes '<name> CURED', and consumes one TONIC", () => {
    quest.items.push('TONIC');
    G.party[0].status = 'PSN';
    openMenu();
    mtap('down'); // PACK -> PARTY
    mtap('a'); // open PARTY (mode 'list')
    mtap('left'); // MNU.3: LEFT opens the heal/cure-item list straight from the list
    mtap('a'); // use TONIC on the hovered mon
    vi.mocked(text).mockClear();
    menuDraw(BG_PAL.green);
    expect(text).toHaveBeenCalledWith('KOFFINK CURED', 8, PARTY_FOOTER_Y, BG_PAL.green[0]);
    expect(G.party[0].status).toBeUndefined();
    expect(quest.items).not.toContain('TONIC');
  });

  it("a healthy mon flashes exactly 'NOT SICK.' and refuses TONIC in PARTY without consuming it", () => {
    quest.items.push('TONIC');
    openMenu();
    mtap('down');
    mtap('a');
    mtap('left');
    mtap('a'); // refused — stays in mode 'item' (the picker), like every other refusal here
    vi.mocked(text).mockClear();
    menuDraw(BG_PAL.green);
    expect(text).toHaveBeenCalledWith('NOT SICK.', 12, 92, BG_PAL.green[0]);
    expect(G.party[0].status).toBeUndefined();
    expect(quest.items).toContain('TONIC');
  });

  it("FB review: a FAINTED mon flashes 'OUT COLD.' — the hp check runs before the cure branch — and refuses without consuming", () => {
    quest.items.push('TONIC');
    G.party[0].hp = 0;
    G.party[0].status = 'PSN'; // carries a status AND is fainted — hp check must win
    openMenu();
    mtap('down');
    mtap('a');
    mtap('left');
    mtap('a'); // refused — 'OUT COLD.', not 'NOT SICK.' and not a cure — stays in mode 'item'
    vi.mocked(text).mockClear();
    menuDraw(BG_PAL.green);
    expect(text).toHaveBeenCalledWith('OUT COLD.', 12, 92, BG_PAL.green[0]);
    expect(G.party[0].status).toBe('PSN'); // untouched
    expect(quest.items).toContain('TONIC'); // not consumed
  });
});
