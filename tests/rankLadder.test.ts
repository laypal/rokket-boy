// RNK.2 — rank ladder window (closes F16's MNU.5): tag derivation per rung,
// wrapping cursor (HRD.14 ruling), the frozen footer table, its ≤18-glyph
// lint, and open/close state transitions. Mock setup mirrors tests/menu.
// test.ts's harness — rankLadder.ts imports renderer/audio/input the same
// way menu.ts's STATUS sub-screen does.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const keys = { down: new Set<string>(), pressed: new Set<string>() };

vi.mock('../src/engine/renderer', () => ({
  drawWindow: vi.fn(),
  text: vi.fn(),
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

import {
  RANK_LADDER_HELP,
  LADDER_LABEL,
  rankTag,
  openRankLadder,
  closeRankLadder,
  isRankLadderOpen,
  rankLadderUpdate,
  rankLadderDraw,
} from '../src/systems/rankLadder';
import { text } from '../src/engine/renderer';
import { RANKS, quest, resetQuest } from '../src/systems/quest';
import { BG_PAL } from '../src/data/palettes';

function frame(): void {
  rankLadderUpdate();
  keys.pressed.clear();
}
function tap(k: string): void {
  keys.pressed.add(k);
  frame();
}

// ── rankTag: pure per-rung tag derivation ───────────────────────────────────
describe('rankTag', () => {
  it('GRUNT current: GRUNT is YOU, everything above is LOCKED', () => {
    expect(rankTag('GRUNT', 'GRUNT')).toBe('YOU');
    expect(rankTag('AGENT', 'GRUNT')).toBe('LOCKED');
    expect(rankTag('OPERATIVE', 'GRUNT')).toBe('LOCKED');
    expect(rankTag('LIEUTENANT', 'GRUNT')).toBe('LOCKED');
    expect(rankTag('EXECUTIVE', 'GRUNT')).toBe('LOCKED');
    expect(rankTag("BOSS'S RIVAL", 'GRUNT')).toBe('LOCKED');
  });

  it('OPERATIVE current: below is DONE, at is YOU, above is LOCKED', () => {
    expect(rankTag('GRUNT', 'OPERATIVE')).toBe('DONE');
    expect(rankTag('AGENT', 'OPERATIVE')).toBe('DONE');
    expect(rankTag('OPERATIVE', 'OPERATIVE')).toBe('YOU');
    expect(rankTag('LIEUTENANT', 'OPERATIVE')).toBe('LOCKED');
    expect(rankTag('EXECUTIVE', 'OPERATIVE')).toBe('LOCKED');
    expect(rankTag("BOSS'S RIVAL", 'OPERATIVE')).toBe('LOCKED');
  });

  it("BOSS'S RIVAL current: every other rung is DONE, itself is YOU", () => {
    for (const r of RANKS) {
      if (r === "BOSS'S RIVAL") continue;
      expect(rankTag(r, "BOSS'S RIVAL"), r).toBe('DONE');
    }
    expect(rankTag("BOSS'S RIVAL", "BOSS'S RIVAL")).toBe('YOU');
  });

  it('a corrupt/unrecognised current rank behaves as GRUNT (house corrupt-save stance, matches rankUp())', () => {
    expect(rankTag('GRUNT', 'NOT-A-REAL-RANK')).toBe('YOU');
    expect(rankTag('AGENT', 'NOT-A-REAL-RANK')).toBe('LOCKED');
    expect(rankTag("BOSS'S RIVAL", 'NOT-A-REAL-RANK')).toBe('LOCKED');
  });
});

// ── RANK_LADDER_HELP: the frozen footer table ───────────────────────────────
describe('RANK_LADDER_HELP (frozen footer table, PLAN "Frozen contracts — RNK.2")', () => {
  it('transcribes the frozen reward strings exactly', () => {
    expect(RANK_LADDER_HELP.GRUNT).toBe('WHERE YOU BEGAN.');
    expect(RANK_LADDER_HELP.AGENT).toBe('300C + SHADES.');
    expect(RANK_LADDER_HELP.OPERATIVE).toBe('600C + SHOP -10%.');
    expect(RANK_LADDER_HELP.LIEUTENANT).toBe('1000C + GLOVES.');
    expect(RANK_LADDER_HELP.EXECUTIVE).toBe('1500C + JOBS +25%.');
    expect(RANK_LADDER_HELP["BOSS'S RIVAL"]).toBe('2500C + THE COAT.');
  });

  it('covers every rung on the ladder, nothing else', () => {
    expect(Object.keys(RANK_LADDER_HELP).sort()).toEqual([...RANKS].sort());
  });

  it('every entry is <= 18 glyphs', () => {
    for (const r of RANKS) {
      expect(RANK_LADDER_HELP[r].length, `${r}: "${RANK_LADDER_HELP[r]}"`).toBeLessThanOrEqual(18);
    }
  });

  it('never leaks a chapter name or unlock condition — rewards only', () => {
    for (const r of RANKS) {
      expect(RANK_LADDER_HELP[r]).not.toMatch(/CHAPTER|FLAG|WHEN|UNLOCK|CH\d/);
    }
  });
});

// ── cursor wrap (HRD.14 ruling) ─────────────────────────────────────────────
describe('cursor wrap', () => {
  beforeEach(() => {
    keys.down.clear();
    keys.pressed.clear();
    closeRankLadder();
    openRankLadder();
  });

  it('UP at the top (sel 0) wraps to the last rung', () => {
    tap('up');
    vi.mocked(text).mockClear();
    rankLadderDraw(BG_PAL.green);
    expect(text).toHaveBeenCalledWith('>', 6, 14 + (RANKS.length - 1) * 15, BG_PAL.green[0]);
  });

  it('DOWN through every rung wraps back to the first', () => {
    for (let i = 0; i < RANKS.length; i++) tap('down');
    vi.mocked(text).mockClear();
    rankLadderDraw(BG_PAL.green);
    expect(text).toHaveBeenCalledWith('>', 6, 14, BG_PAL.green[0]);
  });
});

// ── open/close state transitions ────────────────────────────────────────────
describe('open/close transitions', () => {
  beforeEach(() => {
    keys.down.clear();
    keys.pressed.clear();
    closeRankLadder();
  });

  it('closed by default', () => {
    expect(isRankLadderOpen()).toBe(false);
  });

  it('openRankLadder opens it', () => {
    openRankLadder();
    expect(isRankLadderOpen()).toBe(true);
  });

  it('B closes it', () => {
    openRankLadder();
    tap('b');
    expect(isRankLadderOpen()).toBe(false);
  });

  it('start also closes it (shared B/start idiom)', () => {
    openRankLadder();
    tap('start');
    expect(isRankLadderOpen()).toBe(false);
  });
});

// ── rankLadderDraw: row content + hovered-rung footer ───────────────────────
describe('rankLadderDraw', () => {
  beforeEach(() => {
    resetQuest();
    keys.down.clear();
    keys.pressed.clear();
    closeRankLadder();
    openRankLadder();
  });
  afterEach(() => {
    closeRankLadder();
    resetQuest();
  });

  it('draws the cursor, every rank label + tag, and the hovered footer at rank GRUNT', () => {
    vi.mocked(text).mockClear();
    rankLadderDraw(BG_PAL.green);
    const pal = BG_PAL.green;
    expect(text).toHaveBeenCalledWith('>', 6, 14, pal[0]); // cursor on row 0
    expect(text).toHaveBeenCalledWith('GRUNT', 14, 14, pal[0]);
    expect(text).toHaveBeenCalledWith('YOU', 128, 14, pal[0]); // rightText('YOU', 14, ...)
    expect(text).toHaveBeenCalledWith('AGENT', 14, 29, pal[0]);
    expect(text).toHaveBeenCalledWith('LOCKED', 104, 29, pal[0]); // rightText('LOCKED', 29, ...)
    expect(text).toHaveBeenCalledWith(RANK_LADDER_HELP.GRUNT, 6, 132, pal[0]); // footer for hovered rung
  });

  it('hovering a different rung updates the footer to that rung reward', () => {
    tap('down'); // sel -> AGENT row
    vi.mocked(text).mockClear();
    rankLadderDraw(BG_PAL.green);
    expect(text).toHaveBeenCalledWith(RANK_LADDER_HELP.AGENT, 6, 132, BG_PAL.green[0]);
  });

  it('BDD: rank OPERATIVE — rung 2 (OPERATIVE) shows YOU, rungs 0-1 DONE, rungs 3-5 LOCKED', () => {
    quest.rank = 'OPERATIVE';
    vi.mocked(text).mockClear();
    rankLadderDraw(BG_PAL.green);
    const pal = BG_PAL.green;
    expect(text).toHaveBeenCalledWith('DONE', 120, 14, pal[0]); // GRUNT row (y=14), 'DONE' is 4 glyphs
    expect(text).toHaveBeenCalledWith('DONE', 120, 29, pal[0]); // AGENT row (y=29)
    expect(text).toHaveBeenCalledWith('YOU', 128, 44, pal[0]); // OPERATIVE row (y=44)
    expect(text).toHaveBeenCalledWith('LOCKED', 104, 59, pal[0]); // LIEUTENANT row (y=59)
    expect(text).toHaveBeenCalledWith('LOCKED', 104, 74, pal[0]); // EXECUTIVE row (y=74)
    expect(text).toHaveBeenCalledWith('LOCKED', 104, 89, pal[0]); // BOSS'S RIVAL row (y=89)
  });

  // Playtester 2026-08-14: "BOSS'S RIVAL" (12 glyphs from x=14, ending x=109)
  // painted into its right-aligned LOCKED tag (starts x=104) — a 6px overlap
  // reading as "BOSS'S RIVALOCKED". 12 label + 6 tag glyphs + cursor cannot
  // share 160px, so the ladder alone compresses the top rung's label; STATUS
  // and the rank card keep the full name. The MNU.6 collision class, caught
  // and fixed before merge this time.
  describe('row label geometry (the MNU.6 collision class)', () => {
    it('every row label ends before the widest tag column (LOCKED at x=104)', () => {
      for (const r of RANKS) {
        const label = LADDER_LABEL[r] ?? r;
        expect(14 + label.length * 8, `${r}: "${label}" collides with its tag`).toBeLessThanOrEqual(104);
      }
    });

    it('the top rung draws the compressed label, never the full rank name', () => {
      vi.mocked(text).mockClear();
      rankLadderDraw(BG_PAL.green);
      expect(text).toHaveBeenCalledWith('BOSS RIVAL', 14, 89, BG_PAL.green[0]);
      expect(text).not.toHaveBeenCalledWith("BOSS'S RIVAL", 14, 89, BG_PAL.green[0]);
    });
  });
});
