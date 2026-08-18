// Pause menu (PACK/PARTY/STATUS/SAVE/SOUND/HELP).
import { G } from '../state';
import type { MonInstance } from '../types';
import { clamp, drawWindow, rect, text, W } from '../engine/renderer';
import { Input } from '../engine/input';
import { Audio2 } from '../engine/audio';
import { DUR, EASE, lerp, msToFrames, tween } from '../engine/easing';
import { quest, currentObjective, formatPlayTime } from './quest';
import { SPECIES } from '../data/mons';
import { EGG_TOTAL } from '../data/eggs';
import { MOVES } from '../data/moves';
import { maxHp, dexCount, xpProgress } from './mon';
import { itemDef, applyHeal, usableOutOfBattle, packCounts } from './inventory';
import { reduceHeat } from './heat';
import { writeSave, sessionOnlyWarning } from './save';
import type { Palette } from '../data/palettes';
import { listInput, flash, tickFlash } from './ui/listScreen';
import { isRankLadderOpen, openRankLadder, rankLadderUpdate, rankLadderDraw } from './rankLadder';
import { detailPage, monDetailDraw, pageIndex } from './monDetail';

export function openMenu(): void {
  Audio2.sfx('confirm');
  G.menu = {
    sel: 0,
    sub: null,
    items: ['PACK', 'PARTY', 'STATUS', 'SAVE', 'SOUND', 'HELP', 'CLOSE'],
    openFrame: G.frame,
  };
  G.state = 'menu';
}

let saveMsg: string[] = [];

// QOL.10: START menu footer blurb, one line per entry — shown while the
// menu is open and no sub-screen has been entered yet (m.sub null).
const MENU_HELP: Record<string, string> = {
  PACK: 'ITEMS YOU CARRY.',
  PARTY: 'YOUR MONS. HEAL.',
  STATUS: 'RANK+JOB READOUT.',
  SAVE: 'RECORD PROGRESS.',
  SOUND: 'VOLUME + MUTE.',
  HELP: 'CONTROLS CHEAT.',
  CLOSE: 'BACK TO WORK.',
};
/** Pure lookup so it unit-tests without the renderer; '' for unknown items
 *  (menuDraw skips the footer window when this comes back empty). */
export function menuHelp(item: string): string {
  return MENU_HELP[item] ?? '';
}

// MNU.2: the pack window's interior fits only 13 glyphs per line, but
// items.ts authors descs to ≤17 — so the footer (desc / flash / prompt)
// draws in its own full-width 16px help bar below the window, the QOL.10
// idiom the top-level menu footer already uses. Capacity is derived from
// the SAME geometry the draw uses (drawWindow's double border leaves
// interior x ∈ [x+4, x+w−5], glyphs are 8px) and exported so the item-desc
// lint fails the moment any desc outgrows the box it actually draws in.
// MNU.2 also widened the window itself (was 4,8,118,100): its interior fit
// only 12 row glyphs, so 'ROKKET BALL x1' and longer bled onto the menu
// column behind — near-full width is the STATUS-window idiom.
const PACK_WIN = { x: 2, y: 8, w: 156, h: 100 };
const PACK_ROW_X = 16;
const PACK_HELP = { x: 0, y: 128, w: W, h: 16, tx: 6, ty: 132 };
export const PACK_DESC_CAP = Math.floor((PACK_HELP.x + PACK_HELP.w - 4 - PACK_HELP.tx) / 8);
// Row labels ('ID xN') must fit the window too — same derivation, and the
// item-id lint budgets ' x99' on top of this cap.
export const PACK_ROW_CAP = Math.floor((PACK_WIN.x + PACK_WIN.w - 4 - PACK_ROW_X) / 8);

// MNU.4: STATUS sub-screen rows — index order IS cursor order. The JOB row's
// objective text (y 32) is a second text line, not its own cursor stop.
const STATUS_ROWS: { label: string; y: number }[] = [
  { label: 'RANK', y: 10 },
  { label: 'JOB', y: 22 },
  { label: 'COINS', y: 44 },
  { label: 'DEX', y: 56 },
  { label: 'EGGS', y: 68 },
  { label: 'TIME', y: 80 },
  { label: 'PARTY', y: 92 },
];
// Next-rung payload blurb per rank (RNK.1, the MNU.4 back-feed): the reward
// decision exists now (rankRewards.ts), so each line names what the next
// promotion pays instead of promising nothing. Conditions stay undisclosed —
// the ladder window (RNK.2) is the full readout. ≤18 glyphs, lint-pinned.
const RANK_HELP: Record<string, string> = {
  GRUNT: 'NEXT: 300C+SHADES.',
  AGENT: 'NEXT: 600C+DEALS.',
  OPERATIVE: 'NEXT: 1000C+GLOVES',
  LIEUTENANT: 'NEXT: 1500C+WAGES.',
  EXECUTIVE: 'NEXT: 2500C+COAT.',
  "BOSS'S RIVAL": 'TOP OF THE LADDER.',
};
const STATUS_HELP: Record<string, string> = {
  COINS: 'PICKPOCKET GAINS.',
  DEX: 'MON LINES OWNED.',
  EGGS: 'STOLEN EGG STASH.',
  TIME: 'YOUR SHIFT SO FAR.',
  PARTY: 'MONS ON DUTY.',
};
/** Pure lookup for the STATUS hover bar (PACK_HELP idiom). JOB reuses
 *  currentObjective() live rather than duplicating its string; RANK keys
 *  off quest.rank; unknown item/rank → '' (menuHelp idiom). */
export function statusHelp(item: string): string {
  if (item === 'JOB') return currentObjective();
  if (item === 'RANK') return RANK_HELP[quest.rank] ?? '';
  return STATUS_HELP[item] ?? '';
}

export function menuUpdate(): void {
  const m = G.menu!;
  if (m.sub) {
    if (m.sub === 'party') {
      partyUpdate();
      return;
    }
    if (m.sub === 'pack') {
      packUpdate();
      return;
    }
    if (m.sub === 'status') {
      // RNK.2: while the ladder is open it owns input — status nav pauses,
      // and its own B/start closes it back to STATUS, not out of the menu.
      if (isRankLadderOpen()) {
        rankLadderUpdate();
        return;
      }
      const s = statusNav!;
      s.sel = listInput(s.sel, STATUS_ROWS.length);
      if (Input.hit('a') && s.sel === 0) openRankLadder(); // RANK row (closes F16 MNU.5)
    }
    if (m.sub === 'sound') {
      if (Input.hit('left')) {
        Audio2.setVolume(clamp(Audio2.volume - 0.1, 0, 1));
        Audio2.sfx('beep');
      }
      if (Input.hit('right')) {
        Audio2.setVolume(clamp(Audio2.volume + 0.1, 0, 1));
        Audio2.sfx('beep');
      }
      if (Input.hit('a')) {
        Audio2.setMuted(!Audio2.muted);
        Audio2.sfx('beep');
      }
    }
    if (Input.hit('b') || Input.hit('start')) {
      Audio2.sfx('cancel');
      m.sub = null;
    }
    return;
  }
  m.sel = listInput(m.sel, m.items.length);
  if (Input.hit('b') || Input.hit('start')) {
    closeMenu();
    return;
  }
  if (Input.hit('a')) {
    const it = m.items[m.sel];
    Audio2.sfx('confirm');
    if (it === 'CLOSE') closeMenu();
    else {
      m.sub = it.toLowerCase();
      if (m.sub === 'party') pn = { mode: 'list', monSel: 0, itemSel: 0, msg: null, msgT: 0, heal: null, moveSrc: null };
      if (m.sub === 'pack') packNav = { sel: 0, msg: null, msgT: 0 };
      if (m.sub === 'status') statusNav = { sel: 0 };
      if (m.sub === 'save') {
        writeSave();
        Audio2.sfx('item');
        saveMsg = sessionOnlyWarning() ? ['SAVED!', 'SESSION ONLY.'] : ['SAVED!'];
      }
    }
  }
}
function closeMenu(): void {
  Audio2.sfx('cancel');
  G.menu = null;
  G.state = 'world';
}

// ── PACK sub-screen (§4.8, 1f.7): interactive key-item use — SMOKE BALL ──
interface PackNav {
  sel: number;
  msg: string | null;
  msgT: number;
}
let packNav: PackNav | null = null;

// MNU.4: STATUS sub-screen cursor — wraps like every list (HRD.14 ruling;
// the original clamp here cited the pack idiom, which actually wraps).
interface StatusNav {
  sel: number;
}
let statusNav: StatusNav | null = null;

function packUpdate(): void {
  const m = G.menu!;
  const p = packNav!;
  tickFlash(p);
  const entries = packCounts(quest.items);
  const n = Math.max(1, entries.length);
  p.sel = listInput(p.sel, n);
  if (Input.hit('a') && entries.length) usePackItem(p, entries[Math.min(p.sel, entries.length - 1)].id);
  if (Input.hit('b') || Input.hit('start')) { Audio2.sfx('cancel'); m.sub = null; packNav = null; }
}


function usePackItem(p: PackNav, id: string): void {
  const kind = itemDef(id).kind;
  if (kind === 'heal') {
    flash(p, 'USE IN PARTY.'); // heals need a mon target — PARTY owns that
    return;
  }
  const stage = G.heatState[G.map.id]?.stage ?? 0;
  if (!usableOutOfBattle(id, stage)) {
    flash(p, "CAN'T USE NOW.");
    return;
  }
  // SMOKE BALL with the map hot: one stage off, 3→2 cancels the lockdown
  consumeItem(id);
  reduceHeat(G.heatState, G.map.id, G.playSeconds);
  flash(p, 'HEAT DOWN!', true);
}

export function menuDraw(pal: Palette): void {
  const m = G.menu!;
  // Cosmetic slide-in: the main column eases in from the right edge (72→0px)
  // over DUR.menuOpen. Sub-windows below draw at rest — by the time one opens,
  // openFrame is old so the offset is already 0.
  const p = tween(G.frame - m.openFrame, msToFrames(DUR.menuOpen), EASE.decelerate);
  const dx = Math.round(lerp(72, 0, p));
  drawWindow(88 + dx, 0, 72, 102, pal);
  m.items.forEach((it, i) => {
    text(it, 104 + dx, 8 + i * 13, pal[0]);
    if (i === m.sel) text('>', 94 + dx, 8 + i * 13, pal[0]);
  });
  if (!m.sub) {
    // QOL.10: footer blurb for the selected entry, only while no sub-screen
    // is open — sub-screens draw their own footer line (item desc, A:BACK…).
    const help = menuHelp(m.items[m.sel]);
    if (help) {
      // 16px tall: drawWindow's double border leaves h-8 of interior, so an
      // 8px glyph line needs exactly this (12px drew text ON the border —
      // Lyall's playtest catch, same fix as the battle help bar).
      drawWindow(0, 128, W, 16, pal);
      text(help, 6, 132, pal[0]);
    }
    return;
  }
  if (m.sub === 'party') {
    partyDraw(pal);
  } else if (m.sub === 'pack') {
    const p = packNav!;
    const entries = packCounts(quest.items);
    drawWindow(PACK_WIN.x, PACK_WIN.y, PACK_WIN.w, PACK_WIN.h, pal);
    text('PACK', 12, 14, pal[0]);
    if (entries.length === 0) text('EMPTY...', 16, 34, pal[0]);
    // first 5 distinct items; Ch.1 never carries more — scroll comes with
    // a later content phase if an inventory ever outgrows the window
    entries.slice(0, 5).forEach((e, i) => {
      const y = 32 + i * 12;
      if (i === p.sel) text('>', 8, y, pal[0]);
      text(e.id + ' x' + e.count, 16, y, pal[0]);
    });
    // QOL.1: with no flash message active, the footer shows the SELECTED
    // item's desc instead of the static prompt (row labels already show
    // counts via the x-count pattern above — leave those). MNU.2: drawn in
    // the PACK_HELP bar, not the pack window — see the capacity note above.
    const footer =
      p.msgT > 0 && p.msg
        ? p.msg
        : entries.length
          ? itemDef(entries[Math.min(p.sel, entries.length - 1)].id).desc
          : 'A:USE B:BACK';
    drawWindow(PACK_HELP.x, PACK_HELP.y, PACK_HELP.w, PACK_HELP.h, pal);
    text(footer, PACK_HELP.tx, PACK_HELP.ty, pal[0]);
  } else if (m.sub === 'status') {
    // §4.7 full readout. Near-full-width window: the objective line may be
    // 17 chars × 8px = 136px, wider than the old 110px box.
    // MNU.4: cursor over the 7 rows + a PACK_HELP-idiom bar with a per-row
    // explainer (statusHelp) — labels shifted x10→x14 to make room for '>'.
    if (isRankLadderOpen()) {
      rankLadderDraw(pal);
      return;
    }
    const s = statusNav!;
    drawWindow(2, 2, 156, 106, pal);
    STATUS_ROWS.forEach((r, i) => {
      if (i === s.sel) text('>', 6, r.y, pal[0]);
    });
    text('RANK: ' + quest.rank, 14, 10, pal[0]);
    text('JOB:', 14, 22, pal[0]);
    text(currentObjective(), 14, 32, pal[0]);
    text('COINS: ' + quest.coins, 14, 44, pal[0]);
    text('DEX: ' + dexCount([...G.party, ...G.box], SPECIES) + '/' + Object.keys(SPECIES).length, 14, 56, pal[0]);
    text('EGGS: ' + quest.eggs.size + '/' + EGG_TOTAL, 14, 68, pal[0]);
    text('TIME: ' + formatPlayTime(G.playSeconds), 14, 80, pal[0]);
    text('PARTY: ' + G.party.length + '/4', 14, 92, pal[0]);
    drawWindow(PACK_HELP.x, PACK_HELP.y, PACK_HELP.w, PACK_HELP.h, pal);
    text(statusHelp(STATUS_ROWS[s.sel].label), PACK_HELP.tx, PACK_HELP.ty, pal[0]);
  } else if (m.sub === 'save') {
    drawWindow(8, 20, 104, 24 + saveMsg.length * 12, pal);
    saveMsg.forEach((l, i) => text(l, 16, 30 + i * 12, pal[0]));
  } else if (m.sub === 'sound') {
    drawWindow(8, 20, 112, 52, pal);
    text('VOLUME', 16, 28, pal[0]);
    const bars = Math.round(Audio2.volume * 10);
    text('<' + '#'.repeat(bars) + '.'.repeat(10 - bars) + '>', 16, 40, pal[0]);
    text(Audio2.muted ? 'A: UNMUTE' : 'A: MUTE', 16, 56, pal[0]);
  } else if (m.sub === 'help') {
    drawWindow(4, 12, 118, 70, pal);
    ['DPAD: MOVE', 'A: TALK/CHECK', 'B: FAST TEXT', 'START: MENU', '', 'STEAL SMART.'].forEach((l, i) =>
      text(l, 12, 20 + i * 10, pal[0]),
    );
  }
}

// ── PARTY sub-screen (plan §4.3): per-mon hp/lv/moves + heal-item use.
// MNU.3: the old A→'mon' readout is gone — A now opens a full dex-style
// 'detail' page (monDetail.ts owns its layout) and heal moved to LEFT on
// the list, straight into 'item' (no more list -> mon -> item hop). ─────────
interface PartyNav {
  mode: 'list' | 'detail' | 'item';
  monSel: number;
  itemSel: number;
  msg: string | null;
  msgT: number;
  heal: { row: number; amt: number; t: number } | null; // QOL.4 — list-mode heal flash
  moveSrc: number | null; // QOL.8 — party slot picked up for a reorder swap, list mode only
}
let pn: PartyNav | null = null;

// MNU.3: list-mode footer cap — the PACK_ROW_CAP derivation applied to the
// party window (2,8,156,100) with the footer at x=8 (was 12: the new
// 'A:VIEW <HEAL >MOVE' hint is 18 glyphs, one more than x=12 allows).
const PARTY_WIN = { x: 2, w: 156 };
const PARTY_FOOTER_X = 8;
export const PARTY_FOOTER_CAP = Math.floor((PARTY_WIN.x + PARTY_WIN.w - 4 - PARTY_FOOTER_X) / 8);

/** QOL.8: in-place party slot swap — pure, no-op when i===j or either index
 *  is out of range. Party array order IS battle send-out priority (meIdx
 *  already picks the first non-fainted) and IS the save order, so this is
 *  the whole reorder feature — no shape change needed anywhere else. */
export function swapParty(party: MonInstance[], i: number, j: number): void {
  if (i === j) return;
  if (i < 0 || i >= party.length || j < 0 || j >= party.length) return;
  const tmp = party[i];
  party[i] = party[j];
  party[j] = tmp;
}

function monLabel(mon: MonInstance): string {
  return mon.nick ?? SPECIES[mon.species].name;
}
/** Heal items the player carries (usable out of battle), with counts. */
function healItems(): { id: string; count: number }[] {
  return packCounts(quest.items).filter((e) => usableOutOfBattle(e.id));
}
function consumeItem(id: string): void {
  const i = quest.items.indexOf(id);
  if (i >= 0) quest.items.splice(i, 1);
}

/** QOL.8: RIGHT (or A) while a pick-up is active — re-selecting the picked
 *  row drops it without moving anything; any other row completes the swap.
 *  Assumes p.moveSrc !== null (caller-checked). */
function tryPartyMove(p: PartyNav): void {
  if (p.monSel === p.moveSrc) {
    p.moveSrc = null;
    Audio2.sfx('cancel');
  } else {
    swapParty(G.party, p.moveSrc!, p.monSel);
    p.moveSrc = null;
    flash(p, 'MOVED!', true);
  }
}

function partyUpdate(): void {
  const m = G.menu!;
  const p = pn!;
  tickFlash(p);
  if (p.heal && p.heal.t > 0) p.heal.t--; // QOL.4 — decrements regardless of mode
  if (p.mode === 'list') {
    const n = G.party.length;
    p.monSel = listInput(p.monSel, n);
    // QOL.8: RIGHT picks up the hovered mon; RIGHT again (any row) drops or
    // swaps. Fainted mons may be picked up and placed anywhere including
    // slot 0 — battle already skips fainted when picking who's sent out.
    if (Input.hit('right')) {
      if (p.moveSrc === null) { p.moveSrc = p.monSel; Audio2.sfx('confirm'); }
      else tryPartyMove(p);
    }
    // MNU.3: LEFT opens the heal-item picker straight from the list (used
    // to be A from the old 'mon' readout) — no heal items just flashes.
    if (Input.hit('left')) {
      if (healItems().length === 0) flash(p, 'NO HEAL ITEMS.');
      else { p.mode = 'item'; p.itemSel = 0; Audio2.sfx('confirm'); }
    }
    if (Input.hit('a')) {
      // A only swaps while a pick-up is active; with no pick-up it opens
      // the MNU.3 dex-style detail page.
      if (p.moveSrc !== null) tryPartyMove(p);
      else { Audio2.sfx('confirm'); p.mode = 'detail'; }
    }
    if (Input.hit('b') || Input.hit('start')) {
      if (p.moveSrc !== null) { p.moveSrc = null; Audio2.sfx('cancel'); return; } // cancel pick-up, stay on screen
      Audio2.sfx('cancel'); m.sub = null; pn = null;
    }
    return;
  }
  if (p.mode === 'detail') {
    // MNU.3: LEFT/RIGHT page through the party (p.monSel doubles as the
    // page index — decision 3, backing out lands the cursor on the paged-to
    // mon); A does nothing here.
    if (Input.hit('right')) { p.monSel = pageIndex(p.monSel, 1, G.party.length); Audio2.sfx('beep'); }
    if (Input.hit('left')) { p.monSel = pageIndex(p.monSel, -1, G.party.length); Audio2.sfx('beep'); }
    if (Input.hit('b') || Input.hit('start')) { Audio2.sfx('cancel'); p.mode = 'list'; }
    return;
  }
  // mode 'item'
  const items = healItems();
  const n = Math.max(1, items.length);
  p.itemSel = listInput(p.itemSel, n);
  if (Input.hit('a') && items.length) useHealOnMon(p, items[Math.min(p.itemSel, items.length - 1)].id);
  if (Input.hit('b') || Input.hit('start')) { Audio2.sfx('cancel'); p.mode = 'list'; }
}

function useHealOnMon(p: PartyNav, id: string): void {
  const mon = G.party[p.monSel];
  const sp = SPECIES[mon.species];
  // SODA does not revive ANYWHERE (QOL.6 rule, aligned out-of-battle after
  // the 2026-08-04 playtest): bunk + whiteout are the revive paths until a
  // REVIVE item exists.
  if (mon.hp <= 0) { flash(p, 'OUT COLD.'); return; }
  if (mon.hp >= maxHp(sp, mon.lv)) { flash(p, 'HP IS FULL!'); return; }
  consumeItem(id);
  const healed = applyHeal(mon, sp, itemDef(id));
  flash(p, monLabel(mon) + ' +' + healed + ' HP', true);
  p.heal = { row: p.monSel, amt: healed, t: 40 }; // QOL.4 — list-mode row flash
  p.mode = 'list'; // MNU.3: item mode now hangs off the list directly
}

function partyDraw(pal: Palette): void {
  const p = pn!;
  if (p.mode === 'list') {
    // MNU.1: near-full-width window (the MNU.2/STATUS idiom) — the extra
    // right column carries each row's xp mini-bar; rows keep their coords.
    drawWindow(2, 8, 156, 100, pal);
    text('PARTY', 12, 14, pal[0]);
    G.party.forEach((mon, i) => {
      const y = 30 + i * 18;
      // QOL.4: the just-healed row flashes pal[1]/pal[0] every 4 frames
      // instead of its resting color for ~40 frames (t counts down in
      // partyUpdate); '+amt' rides beside the hp text while it's active.
      const healing = p.heal && p.heal.t > 0 && p.heal.row === i;
      const col = healing ? (Math.floor(p.heal!.t / 4) & 1 ? pal[1] : pal[0]) : mon.hp > 0 ? pal[0] : pal[2];
      // QOL.8: the picked-up row shows '*' instead of the normal '>' cursor
      // (even when it's also the hovered row — the pick-up marker wins).
      if (p.moveSrc !== null && i === p.moveSrc) text('*', 8, y, pal[0]);
      else if (i === p.monSel) text('>', 8, y, pal[0]);
      text(monLabel(mon), 16, y, col);
      text('L' + mon.lv, 80, y, col);
      text(mon.hp + '/' + maxHp(SPECIES[mon.species], mon.lv), 16, y + 8, col);
      if (healing) text('+' + p.heal!.amt, 72, y + 8, col);
      // MNU.1: xp mini-bar under the L column (UX2.1's xpProgress — build
      // once, draw twice). Clearances: 'L12' ends ≤98, heal '+NN' ends ≤96.
      rect(100, y + 8, 52, 4, pal[0]);
      rect(101, y + 9, 50, 2, pal[3]);
      rect(101, y + 9, Math.round(50 * xpProgress(mon)), 2, pal[0]);
    });
    // QOL.8/MNU.3: list-mode footer — a flashP message (e.g. 'MOVED!' or the
    // 'NO HEAL ITEMS.' refusal) wins, else the pick-up state names who's
    // being moved, else the static A:VIEW/LEFT:HEAL/RIGHT:MOVE hint.
    const footer =
      p.msgT > 0 && p.msg
        ? p.msg
        : p.moveSrc !== null
          ? ('MOVING: ' + monLabel(G.party[p.moveSrc])).slice(0, PARTY_FOOTER_CAP)
          : 'A:VIEW <HEAL >MOVE';
    text(footer, PARTY_FOOTER_X, 100, pal[0]);
    return;
  }
  const mon = G.party[p.monSel];
  const sp = SPECIES[mon.species];
  if (p.mode === 'detail') {
    // MNU.3: full dex-style page — layout lives in monDetail.ts, this just
    // builds the DetailPage from live state and hands it off.
    monDetailDraw(detailPage(mon, sp, (id) => MOVES[id].name, p.monSel, G.party.length), sp, pal);
    return;
  }
  // mode 'item'
  drawWindow(4, 8, 118, 100, pal);
  text('USE ON ' + monLabel(mon), 12, 14, pal[0]);
  const items = healItems();
  if (items.length === 0) text('NO HEAL ITEMS.', 16, 34, pal[0]);
  items.forEach((e, i) => {
    const y = 32 + i * 14;
    if (i === p.itemSel) text('>', 8, y, pal[0]);
    text(e.id + ' x' + e.count, 16, y, pal[0]);
  });
  text(p.msgT > 0 && p.msg ? p.msg : 'A:USE B:BACK', 12, 92, pal[0]);
}
