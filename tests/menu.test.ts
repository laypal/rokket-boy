// menu.ts pure-helper tests (QOL.10): the START menu footer blurb lookup.
// Mock setup copied from tests/battle.test.ts's harness idiom — menu.ts
// imports renderer/audio (canvas/DOM) which vitest's node environment can't
// touch, so both are stubbed. Only the pure menuHelp() lookup is exercised
// here; menuUpdate/menuDraw input-and-timing behavior is out of scope.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { vi } from 'vitest';

const keys = { down: new Set<string>(), pressed: new Set<string>() };

vi.mock('../src/engine/renderer', () => ({
  clamp: (v: number, a: number, z: number) => Math.max(a, Math.min(z, v)),
  drawWindow: vi.fn(),
  rect: vi.fn(), // MNU.1 — partyDraw's xp mini-bars
  text: vi.fn(),
  ctx: { drawImage: vi.fn() }, // MNU.3 — monDetail.ts's front-sprite draw
  decode: vi.fn(() => ({})), // MNU.3 — same
  W: 160,
  H: 144,
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

import { menuHelp, openMenu, menuUpdate, menuDraw, swapParty, statusHelp, PACK_DESC_CAP } from '../src/systems/menu';
import { isRankLadderOpen, closeRankLadder } from '../src/systems/rankLadder';
import { text } from '../src/engine/renderer';
import { G } from '../src/state';
import { quest, resetQuest, currentObjective, RANKS } from '../src/systems/quest';
import { makeMon, maxHp } from '../src/systems/mon';
import { SPECIES } from '../src/data/mons';
import { BG_PAL } from '../src/data/palettes';

describe('menuHelp', () => {
  it('PACK', () => {
    expect(menuHelp('PACK')).toBe('ITEMS YOU CARRY.');
  });
  it('PARTY', () => {
    expect(menuHelp('PARTY')).toBe('YOUR MONS. HEAL.');
  });
  it('STATUS', () => {
    expect(menuHelp('STATUS')).toBe('RANK+JOB READOUT.');
  });
  it('SAVE', () => {
    expect(menuHelp('SAVE')).toBe('RECORD PROGRESS.');
  });
  it('SOUND', () => {
    expect(menuHelp('SOUND')).toBe('VOLUME + MUTE.');
  });
  it('HELP', () => {
    expect(menuHelp('HELP')).toBe('CONTROLS CHEAT.');
  });
  it('CLOSE', () => {
    expect(menuHelp('CLOSE')).toBe('BACK TO WORK.');
  });
  it('falls back to empty string for an unknown item', () => {
    expect(menuHelp('NOPE')).toBe('');
  });
  it('every known blurb fits the help bar (≤17 chars)', () => {
    for (const item of ['PACK', 'PARTY', 'STATUS', 'SAVE', 'SOUND', 'HELP', 'CLOSE']) {
      expect(menuHelp(item).length, `${item}: "${menuHelp(item)}"`).toBeLessThanOrEqual(17);
    }
  });
});

// ── MNU.4: STATUS explainers ────────────────────────────────────────────────
describe('statusHelp', () => {
  afterEach(() => resetQuest());

  it('COINS', () => {
    expect(statusHelp('COINS')).toBe('PICKPOCKET GAINS.');
  });
  it('DEX', () => {
    expect(statusHelp('DEX')).toBe('MON LINES OWNED.');
  });
  it('EGGS', () => {
    expect(statusHelp('EGGS')).toBe('STOLEN EGG STASH.');
  });
  it('TIME', () => {
    expect(statusHelp('TIME')).toBe('YOUR SHIFT SO FAR.');
  });
  it('PARTY', () => {
    expect(statusHelp('PARTY')).toBe('MONS ON DUTY.');
  });
  it('falls back to empty string for an unknown item', () => {
    expect(statusHelp('NOPE')).toBe('');
  });

  it('JOB reuses currentObjective() live — no duplicated string', () => {
    resetQuest();
    expect(statusHelp('JOB')).toBe(currentObjective());
    expect(statusHelp('JOB')).toBe('SEE THE BOSS');
    quest.flags.briefed = true; // flip the flag currentObjective() depends on
    expect(statusHelp('JOB')).toBe(currentObjective());
    expect(statusHelp('JOB')).toBe('BEAT THE GUARD');
  });

  // RNK.1 re-pin (red-first, deliberate): MNU.4 shipped these as vague
  // milestones because the reward decision didn't exist; the 2026-08-10 spec
  // back-feed says they now NAME THE PAYLOAD of the next rung instead.
  const RANK_EXPECTED: Record<string, string> = {
    GRUNT: 'NEXT: 300C+SHADES.',
    AGENT: 'NEXT: 600C+DEALS.',
    OPERATIVE: 'NEXT: 1000C+GLOVES',
    LIEUTENANT: 'NEXT: 1500C+WAGES.',
    EXECUTIVE: 'NEXT: 2500C+COAT.',
    "BOSS'S RIVAL": 'TOP OF THE LADDER.',
  };
  it('RANK — per-rank next-milestone blurb for every rank on the ladder', () => {
    for (const r of RANKS) {
      quest.rank = r;
      expect(statusHelp('RANK'), r).toBe(RANK_EXPECTED[r]);
    }
  });
  it('RANK — a corrupt/unrecognised rank falls back to empty string', () => {
    quest.rank = 'NOT-A-REAL-RANK';
    expect(statusHelp('RANK')).toBe('');
  });

  it('every static blurb and every RANK value fits the help bar (<= PACK_DESC_CAP glyphs)', () => {
    for (const item of ['COINS', 'DEX', 'EGGS', 'TIME', 'PARTY']) {
      expect(statusHelp(item).length, `${item}: "${statusHelp(item)}"`).toBeLessThanOrEqual(PACK_DESC_CAP);
    }
    for (const r of RANKS) {
      quest.rank = r;
      expect(statusHelp('RANK').length, `${r}: "${statusHelp('RANK')}"`).toBeLessThanOrEqual(PACK_DESC_CAP);
    }
  });
});

describe('STATUS cursor nav (input harness)', () => {
  function frame(): void {
    menuUpdate();
    keys.pressed.clear();
  }
  function tap(k: string): void {
    keys.pressed.add(k);
    frame();
  }

  beforeEach(() => {
    resetQuest();
    keys.down.clear();
    keys.pressed.clear();
    openMenu();
    tap('down'); // PACK -> PARTY
    tap('down'); // PARTY -> STATUS
    tap('a'); // enter STATUS sub-screen, statusNav resets to sel 0 (RANK row, y=10)
  });

  it('DOWN moves the cursor to the next row (JOB, y=22)', () => {
    tap('down');
    vi.mocked(text).mockClear();
    menuDraw(BG_PAL.green);
    expect(text).toHaveBeenCalledWith('>', 6, 22, BG_PAL.green[0]);
  });

  // HRD.14 ruling (2026-08-14): list navigation wraps EVERYWHERE. These two
  // pins previously froze MNU.4's clamp — a deliberate behaviour change,
  // re-pointed red-first (both failed against the wrap before this edit).
  it('UP at row 0 wraps to the last row (PARTY, y=92) — HRD.14 ruling', () => {
    tap('up');
    vi.mocked(text).mockClear();
    menuDraw(BG_PAL.green);
    expect(text).toHaveBeenCalledWith('>', 6, 92, BG_PAL.green[0]);
    expect(text).not.toHaveBeenCalledWith('>', 6, 10, BG_PAL.green[0]);
  });

  it('DOWN through all seven rows wraps back to the top (RANK, y=10)', () => {
    for (let i = 0; i < 6; i++) tap('down');
    vi.mocked(text).mockClear();
    menuDraw(BG_PAL.green);
    expect(text).toHaveBeenCalledWith('>', 6, 92, BG_PAL.green[0]); // 6 downs reach the last row
    tap('down'); // the 7th wraps
    vi.mocked(text).mockClear();
    menuDraw(BG_PAL.green);
    expect(text).toHaveBeenCalledWith('>', 6, 10, BG_PAL.green[0]);
  });
});

// ── RNK.2: ladder window wiring (closes F16's MNU.5) — the ladder's own
// tag/footer/wrap logic is covered in tests/rankLadder.test.ts; this suite
// only proves menu.ts's three-line wire-up: A opens it from the RANK row
// (sel 0) and nowhere else, B returns to STATUS rather than the world.
describe('RANK ladder window wiring', () => {
  function frame(): void {
    menuUpdate();
    keys.pressed.clear();
  }
  function tap(k: string): void {
    keys.pressed.add(k);
    frame();
  }

  beforeEach(() => {
    resetQuest();
    keys.down.clear();
    keys.pressed.clear();
    closeRankLadder(); // isolate from any prior test's open ladder
    openMenu();
    tap('down'); // PACK -> PARTY
    tap('down'); // PARTY -> STATUS
    tap('a'); // enter STATUS sub-screen, statusNav resets to sel 0 (RANK row)
  });

  it('A on the RANK row (sel 0) opens the ladder', () => {
    tap('a');
    expect(isRankLadderOpen()).toBe(true);
    expect(G.menu!.sub).toBe('status'); // frozen contract: m.sub stays 'status' underneath
  });

  it('A on a different STATUS row (sel !== 0) does not open the ladder', () => {
    tap('down'); // RANK -> JOB, sel 1
    tap('a');
    expect(isRankLadderOpen()).toBe(false);
  });

  it('B while the ladder is open closes the ladder, not the STATUS screen', () => {
    tap('a'); // open ladder
    expect(isRankLadderOpen()).toBe(true);
    tap('b');
    expect(isRankLadderOpen()).toBe(false);
    expect(G.state).toBe('menu');
    expect(G.menu!.sub).toBe('status'); // landed on STATUS, not the world
  });

  it('B after the ladder is closed behaves like plain STATUS (leaves the sub-screen)', () => {
    tap('a'); // open ladder
    tap('b'); // close ladder, lands on STATUS
    tap('b'); // now the ordinary STATUS B — leaves the sub-screen
    expect(G.menu!.sub).toBeNull();
    expect(G.state).toBe('menu');
  });
});

// ── QOL.8: party reorder ────────────────────────────────────────────────────
describe('swapParty', () => {
  function party(): { species: string; lv: number; hp: number; xp: number; moves: [] }[] {
    return [
      { species: 'a', lv: 1, hp: 1, xp: 0, moves: [] },
      { species: 'b', lv: 1, hp: 1, xp: 0, moves: [] },
      { species: 'c', lv: 1, hp: 1, xp: 0, moves: [] },
    ];
  }

  it('swaps two in-range slots in place', () => {
    const p = party();
    swapParty(p, 0, 2);
    expect(p.map((m) => m.species)).toEqual(['c', 'b', 'a']);
  });

  it('i === j is a no-op', () => {
    const p = party();
    swapParty(p, 1, 1);
    expect(p.map((m) => m.species)).toEqual(['a', 'b', 'c']);
  });

  it('out-of-range indices are a no-op (both directions)', () => {
    const p = party();
    swapParty(p, -1, 1);
    expect(p.map((m) => m.species)).toEqual(['a', 'b', 'c']);
    swapParty(p, 1, 3);
    expect(p.map((m) => m.species)).toEqual(['a', 'b', 'c']);
    swapParty(p, 5, 9);
    expect(p.map((m) => m.species)).toEqual(['a', 'b', 'c']);
  });
});

describe('QOL.8 PARTY reorder (input harness)', () => {
  function frame(): void {
    menuUpdate();
    keys.pressed.clear();
  }
  function tap(k: string): void {
    keys.pressed.add(k);
    frame();
  }

  beforeEach(() => {
    resetQuest();
    G.party = [makeMon(SPECIES.koffink, 5), makeMon(SPECIES.voltorbb, 4)];
    G.party[0].nick = 'FIRST';
    G.party[1].nick = 'SECOND';
    keys.down.clear();
    keys.pressed.clear();
    openMenu();
  });

  it('RIGHT picks up slot 0, DOWN moves the cursor, RIGHT swaps into slot 1', () => {
    tap('down'); // PACK -> PARTY
    tap('a'); // open PARTY (mode 'list')
    tap('right'); // pick up slot 0 (moveSrc = 0)
    tap('down'); // cursor -> slot 1
    tap('right'); // swap 0 <-> 1
    expect(G.party.map((m) => m.nick)).toEqual(['SECOND', 'FIRST']);
    expect(G.menu!.sub).toBe('party'); // still on the party screen
  });

  it('B during a pick-up cancels without leaving the party screen', () => {
    tap('down');
    tap('a'); // PARTY list
    tap('right'); // pick up slot 0
    tap('b'); // cancel the pick-up
    expect(G.party.map((m) => m.nick)).toEqual(['FIRST', 'SECOND']); // unchanged
    expect(G.menu!.sub).toBe('party'); // did NOT exit the sub-screen
  });

  it('A with no pick-up still enters detail mode (regression)', () => {
    tap('down');
    tap('a'); // PARTY list
    tap('a'); // no pick-up active -> detail view
    vi.mocked(text).mockClear();
    menuDraw(BG_PAL.green);
    // MNU.3: detail mode draws the mon's label in monDetail.ts's right
    // column at (72,8) — list mode draws it at (16,30+).
    expect(text).toHaveBeenCalledWith('FIRST', 72, 8, BG_PAL.green[0]);
  });
});

// ── QOL.4: PARTY heal-item flash (useHealOnMon isn't exported — driven via
// the input harness, same idiom as tests/battle.test.ts) ───────────────────
describe('QOL.4 PARTY heal flash', () => {
  function frame(): void {
    menuUpdate();
    keys.pressed.clear();
  }
  function tap(k: string): void {
    keys.pressed.add(k);
    frame();
  }

  beforeEach(() => {
    resetQuest();
    G.party = [makeMon(SPECIES.koffink, 5)];
    G.party[0].hp = 1;
    quest.items.push('SODA');
    keys.down.clear();
    keys.pressed.clear();
    openMenu();
  });

  it('useHealOnMon records pn.heal and list-mode partyDraw shows the +amt flash beside the hp line', () => {
    tap('down'); // PACK -> PARTY
    tap('a'); // open PARTY (mode 'list')
    tap('left'); // MNU.3: LEFT opens the heal-item list straight from the list (mode 'item')
    const preHp = G.party[0].hp;
    tap('a'); // use SODA -> useHealOnMon, sets pn.heal {row:0, amt, t:40}, mode back to 'list'
    const healAmt = G.party[0].hp - preHp;
    expect(healAmt).toBeGreaterThan(0);
    frame(); // one settle frame (no input) — pn.heal.t now 39, still >0, flash still active
    vi.mocked(text).mockClear();
    menuDraw(BG_PAL.green);
    // hp text sits at y+8 for row 0 (y=30); '+amt' rides the same line at x=72.
    expect(text).toHaveBeenCalledWith('+' + healAmt, 72, 38, BG_PAL.green[1]);
    // floor(39/4)=9, 9&1=1 -> the odd branch (pal[1]) per the frozen formula.
    expect(text).toHaveBeenCalledWith('KOFFINK', 16, 30, BG_PAL.green[1]);
  });

  it('a fainted mon refuses SODA out of battle too — no revive, not consumed', () => {
    // Aligns with the QOL.6 in-battle rule: SODA does not revive anywhere;
    // the HQ bunk and the whiteout are the only revive paths until a REVIVE
    // item exists (2026-08-04 playtest follow-up).
    G.party[0].hp = 0;
    tap('down');
    tap('a'); // PARTY list
    tap('left'); // MNU.3: item list
    tap('a'); // try SODA on the fainted mon — must refuse
    expect(G.party[0].hp).toBe(0); // still out cold
    expect(quest.items).toContain('SODA'); // not consumed
  });

  it('a full-hp target refuses and never touches pn.heal (no flash on the row)', () => {
    G.party[0].hp = maxHp(SPECIES.koffink, 5); // full — SODA refuses
    tap('down');
    tap('a'); // PARTY list
    tap('left'); // MNU.3: item list
    tap('a'); // refused — flashP('HP IS FULL!'), pn.heal stays null, mode stays 'item'
    tap('b'); // item -> list (MNU.3: B from item goes straight to list)
    vi.mocked(text).mockClear();
    menuDraw(BG_PAL.green);
    expect(text).toHaveBeenCalledWith('KOFFINK', 16, 30, BG_PAL.green[0]); // resting color, no blink
    expect(text).not.toHaveBeenCalledWith(expect.stringMatching(/^\+/), expect.anything(), expect.anything(), expect.anything());
  });
});

// ── MNU.3: dex-style PARTY detail screen (BDD) — the old A→'mon' readout is
// gone (mode 'mon' deleted); A opens 'detail' (monDetail.ts's layout), LEFT
// on the list opens the heal-item picker directly. ────────────────────────
describe('MNU.3 PARTY detail screen (BDD)', () => {
  function frame(): void {
    menuUpdate();
    keys.pressed.clear();
  }
  function tap(k: string): void {
    keys.pressed.add(k);
    frame();
  }

  beforeEach(() => {
    resetQuest();
    // Given a party of 3, three different species.
    G.party = [makeMon(SPECIES.koffink, 5), makeMon(SPECIES.voltorbb, 4), makeMon(SPECIES.ratikatt, 6)];
    keys.down.clear();
    keys.pressed.clear();
    openMenu();
    tap('down'); // PACK -> PARTY
    tap('a'); // open PARTY (mode 'list', monSel 0)
  });

  it('cursor to row 1, A opens the detail page on that mon (label + pager)', () => {
    tap('down'); // monSel -> 1 (VOLTORBB)
    tap('a'); // -> detail
    vi.mocked(text).mockClear();
    menuDraw(BG_PAL.green);
    expect(text).toHaveBeenCalledWith('VOLTORBB', 72, 8, BG_PAL.green[0]);
    expect(text).toHaveBeenCalledWith('<2/3>', 8, 106, BG_PAL.green[0]);
  });

  it('RIGHT twice from row 1 wraps around to the index-0 mon', () => {
    tap('down'); // monSel -> 1
    tap('a'); // detail, page 1
    tap('right'); // page -> 2 (RATIKATT)
    tap('right'); // page -> 0 (KOFFINK) — wraps
    vi.mocked(text).mockClear();
    menuDraw(BG_PAL.green);
    expect(text).toHaveBeenCalledWith('KOFFINK', 72, 8, BG_PAL.green[0]);
    expect(text).toHaveBeenCalledWith('<1/3>', 8, 106, BG_PAL.green[0]);
  });

  it('B from detail returns to the list, landed on the paged-to mon (decision 3)', () => {
    tap('down'); // monSel -> 1
    tap('a'); // detail
    tap('right'); // page -> 2
    tap('right'); // page -> 0
    tap('b'); // -> list, monSel stays 0
    vi.mocked(text).mockClear();
    menuDraw(BG_PAL.green);
    expect(text).toHaveBeenCalledWith('PARTY', 12, 14, BG_PAL.green[0]); // list-mode marker
    expect(text).toHaveBeenCalledWith('>', 8, 30, BG_PAL.green[0]); // cursor on row 0
  });

  it('LEFT on the list with no heal items flashes NO HEAL ITEMS.', () => {
    tap('left');
    vi.mocked(text).mockClear();
    menuDraw(BG_PAL.green);
    expect(text).toHaveBeenCalledWith('NO HEAL ITEMS.', 8, 100, BG_PAL.green[0]);
  });

  it('LEFT on the list with a heal item opens the item picker ("USE ON …")', () => {
    quest.items.push('SODA');
    tap('left');
    vi.mocked(text).mockClear();
    menuDraw(BG_PAL.green);
    expect(text).toHaveBeenCalledWith('USE ON KOFFINK', 12, 14, BG_PAL.green[0]);
  });

  it('B from item mode returns to list mode, not the deleted mon mode', () => {
    quest.items.push('SODA');
    tap('left'); // item mode
    tap('b'); // -> list
    vi.mocked(text).mockClear();
    menuDraw(BG_PAL.green);
    expect(text).toHaveBeenCalledWith('PARTY', 12, 14, BG_PAL.green[0]); // list-mode marker
  });

  it('the deleted mon-mode readout ("A:ITEM B:BACK") is never drawn, in detail or item mode', () => {
    tap('down'); // monSel -> 1
    tap('a'); // -> detail
    vi.mocked(text).mockClear();
    menuDraw(BG_PAL.green);
    expect(text).not.toHaveBeenCalledWith('A:ITEM B:BACK', expect.anything(), expect.anything(), expect.anything());

    tap('b'); // detail -> list
    quest.items.push('SODA');
    tap('left'); // -> item mode
    vi.mocked(text).mockClear();
    menuDraw(BG_PAL.green);
    expect(text).not.toHaveBeenCalledWith('A:ITEM B:BACK', expect.anything(), expect.anything(), expect.anything());
  });
});
