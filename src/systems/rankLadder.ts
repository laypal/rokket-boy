// RNK.2 — rank ladder window (closes F16's MNU.5). Opened by A on the
// STATUS sub-screen's RANK row (statusNav.sel === 0); B returns to STATUS,
// not the world (PLAN "Frozen contracts — RNK.2 ladder window"). All ladder
// state/logic/strings live here — menu.ts only wires the open/close edges.
import { W, drawWindow, text } from '../engine/renderer';
import { Input } from '../engine/input';
import { Audio2 } from '../engine/audio';
import { listInput, rightText } from './ui/listScreen';
import { RANKS, quest } from './quest';
import type { Palette } from '../data/palettes';

// Frozen footer strings, transcribed verbatim from the PLAN table. Rewards
// disclosed, conditions never — the tag (YOU/DONE/LOCKED) is the only
// condition text this window shows. Exported so a lint can bound every
// entry to the PACK_HELP-geometry footer's capacity.
export const RANK_LADDER_HELP: Record<(typeof RANKS)[number], string> = {
  GRUNT: 'WHERE YOU BEGAN.',
  AGENT: '300C + SHADES.',
  OPERATIVE: '600C + SHOP -10%.',
  LIEUTENANT: '1000C + GLOVES.',
  EXECUTIVE: '1500C + JOBS +25%.',
  "BOSS'S RIVAL": '2500C + THE COAT.',
};

/** Ladder-only display overrides. The top rung's full name is 12 glyphs;
 *  with the 6-glyph LOCKED tag right-aligned at x=104 and labels starting
 *  x=14, 12·8 ends at x=109 — a 6px paint-over the playtester caught (the
 *  MNU.6 collision class). 12+6 glyphs + cursor can't share 160px, so the
 *  ladder alone compresses the possessive; STATUS and the rank card keep
 *  the full "BOSS'S RIVAL". Exported for the geometry lint. */
export const LADDER_LABEL: Record<string, string> = { "BOSS'S RIVAL": 'BOSS RIVAL' };

export type RankTag = 'YOU' | 'DONE' | 'LOCKED';

/** Pure per-rung tag vs the player's current rank. An unrecognised current
 *  rank (corrupt save) behaves as GRUNT (index 0) — the same house
 *  corrupt-save stance quest.ts's rankUp() takes. */
export function rankTag(rung: string, currentRank: string): RankTag {
  const cur = RANKS.indexOf(currentRank as (typeof RANKS)[number]);
  const curIdx = cur < 0 ? 0 : cur;
  const rungIdx = RANKS.indexOf(rung as (typeof RANKS)[number]);
  if (rungIdx === curIdx) return 'YOU';
  return rungIdx < curIdx ? 'DONE' : 'LOCKED';
}

interface LadderNav {
  sel: number;
}
let ladder: LadderNav | null = null;

export function isRankLadderOpen(): boolean {
  return ladder !== null;
}

export function openRankLadder(): void {
  Audio2.sfx('confirm');
  ladder = { sel: 0 };
}

export function closeRankLadder(): void {
  Audio2.sfx('cancel');
  ladder = null;
}

/** 6 fixed rungs, no scrolling — listInput's wrap mode (HRD.14 ruling).
 *  B/start close the ladder; the caller (menu.ts) owns falling back to
 *  STATUS's own B on the next frame once this returns isRankLadderOpen()
 *  === false. */
export function rankLadderUpdate(): void {
  const s = ladder!;
  s.sel = listInput(s.sel, RANKS.length);
  if (Input.hit('b') || Input.hit('start')) closeRankLadder();
}

// Same geometry idiom as menu.ts's STATUS window (drawWindow(2,2,156,106))
// and its PACK_HELP-geometry footer bar (menu.ts:60) — replicated locally
// since PACK_HELP itself isn't exported.
const LADDER_WIN = { x: 2, y: 2, w: 156, h: 106 };
const LADDER_ROW_X = 14;
const LADDER_ROW_Y0 = 14;
const LADDER_ROW_DY = 15;
const LADDER_HELP = { x: 0, y: 128, w: W, h: 16, tx: 6, ty: 132 };

export function rankLadderDraw(pal: Palette): void {
  const s = ladder!;
  drawWindow(LADDER_WIN.x, LADDER_WIN.y, LADDER_WIN.w, LADDER_WIN.h, pal);
  RANKS.forEach((rung, i) => {
    const y = LADDER_ROW_Y0 + i * LADDER_ROW_DY;
    if (i === s.sel) text('>', 6, y, pal[0]);
    text(LADDER_LABEL[rung] ?? rung, LADDER_ROW_X, y, pal[0]);
    rightText(rankTag(rung, quest.rank), y, pal[0]);
  });
  drawWindow(LADDER_HELP.x, LADDER_HELP.y, LADDER_HELP.w, LADDER_HELP.h, pal);
  text(RANK_LADDER_HELP[RANKS[s.sel]], LADDER_HELP.tx, LADDER_HELP.ty, pal[0]);
}
