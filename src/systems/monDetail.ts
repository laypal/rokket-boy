// MNU.3 — PARTY sub-mode 'detail': a full dex-style page for one mon,
// replacing the old A→'mon' readout (name/L/HP/moves + A:ITEM). Pure
// formatters below read no G — menu.ts owns navigation/mode; this module
// owns layout only, the same split rankLadder.ts and battleFx.ts use.
import type { MonInstance, MonSpecies } from '../types';
import { ALERT_IDX, type Palette } from '../data/palettes';
import { ctx, decode, drawWindow, text } from '../engine/renderer';
import { maxHp, hpBand, type HpBand } from './mon';

// Geometry (all pinned — the playtester screenshots against these):
//   page window   drawWindow(0, 0, 160, 120)     interior x 4..155, y 4..115
//   sprite box    56×56 at (8, 8): the 2× front sprite CENTRED in the box
//                 (battle draws front at 2×; placeholder fronts may be 24×20)
//   right column  x = 72, 10 glyphs wide (72..152), rows y = 8,18,28,38,48,58
//                 (label, lv, type, hp, ht, wt)
//   bottom-left   x = 8,  rows y = 76, 86, 96 (ATK/DEF/SPD), y = 106 pager
//   bottom-right  x = 72, rows y = 76, 86, 96, 106 (moves 1–4)
//   dex bar       drawWindow(0, 120, 160, 24), lines at (6,124) and (6,132)
export const DEX_LINE_CAP = 18;   // derived: floor((0 + 160 - 4 - 6) / 8)
export const DETAIL_COL_CAP = 10; // right column: (152 - 72) / 8

export interface DetailPage {
  label: string;      // nick ?? species name              (≤10)
  lv: string;         // 'LV 12' or 'LV 12 PSN' when status set (≤10)
  type: string;       // sp.type.join('/')                 (≤10, linted)
  hp: string;         // 'HP 45/45'  (current/maxHp)      (≤10)
  band: HpBand;       // FLW.2 — hpBand(mon.hp, maxHp); build once, draw twice
  ht: string;         // 'HT 0.6M'   = 'HT ' + heightM.toFixed(1) + 'M'
  wt: string;         // 'WT 12.5KG' = 'WT ' + weightKg.toFixed(1) + 'KG'
  atk: string;        // 'ATK 65'  (species base stat — only hp scales with level)
  def: string;        // 'DEF 95'
  spd: string;        // 'SPD 35'
  moves: string[];    // moveName(id) for each of mon.moves (≤4)
  dex: string[];      // sp.dex (1–2 lines)
  pager: string;      // '<2/3>' — 1-based index of the shown mon / party size
}

export function detailPage(
  mon: MonInstance,
  sp: MonSpecies,
  moveName: (id: string) => string,
  index: number,
  count: number,
): DetailPage {
  return {
    label: mon.nick ?? sp.name,
    lv: 'LV ' + mon.lv + (mon.status ? ' ' + mon.status : ''),
    type: sp.type.join('/'),
    hp: 'HP ' + mon.hp + '/' + maxHp(sp, mon.lv),
    band: hpBand(mon.hp, maxHp(sp, mon.lv)),
    ht: 'HT ' + sp.heightM.toFixed(1) + 'M',
    wt: 'WT ' + sp.weightKg.toFixed(1) + 'KG',
    atk: 'ATK ' + sp.atk,
    def: 'DEF ' + sp.def,
    spd: 'SPD ' + sp.spd,
    moves: mon.moves.map(moveName),
    dex: sp.dex,
    pager: '<' + (index + 1) + '/' + count + '>',
  };
}

/** LEFT/RIGHT paging with wrap: dir -1 | +1, count ≥ 1. */
export function pageIndex(i: number, dir: -1 | 1, count: number): number {
  if (count <= 0) return 0;
  return (i + count + dir) % count;
}

/** Top-left + size of a w×h sprite drawn at 2× and centred in the 56×56 box at (8,8). */
export function spriteBox(w: number, h: number): { x: number; y: number; w: number; h: number } {
  const dw = w * 2;
  const dh = h * 2;
  return { x: 8 + Math.floor((56 - dw) / 2), y: 8 + Math.floor((56 - dh) / 2), w: dw, h: dh };
}

export function monDetailDraw(page: DetailPage, sp: MonSpecies, pal: Palette): void {
  drawWindow(0, 0, 160, 120, pal);
  const box = spriteBox(sp.front[0].length, sp.front.length);
  ctx.drawImage(decode(sp.front, sp.pal), box.x, box.y, box.w, box.h);
  // right column
  text(page.label, 72, 8, pal[0]);
  text(page.lv, 72, 18, pal[0]);
  text(page.type, 72, 28, pal[0]);
  // FLW.2: same hp readout as the PARTY list — hurt draws in ALERT_IDX, the
  // label/lv/type lines above keep pal[0] (the number is the signal).
  text(page.hp, 72, 38, page.band === 'hurt' ? pal[ALERT_IDX] : pal[0]);
  text(page.ht, 72, 48, pal[0]);
  text(page.wt, 72, 58, pal[0]);
  // bottom-left: ATK/DEF/SPD + pager
  text(page.atk, 8, 76, pal[0]);
  text(page.def, 8, 86, pal[0]);
  text(page.spd, 8, 96, pal[0]);
  text(page.pager, 8, 106, pal[0]);
  // bottom-right: up to 4 moves
  const moveY = [76, 86, 96, 106];
  page.moves.slice(0, 4).forEach((m, i) => text(m, 72, moveY[i], pal[0]));
  // dex bar — line 2 may be absent
  drawWindow(0, 120, 160, 24, pal);
  text(page.dex[0], 6, 124, pal[0]);
  if (page.dex[1] !== undefined) text(page.dex[1], 6, 132, pal[0]);
}
