// SHOP — vendor buy/sell screen (plan §4.5). Opened by a `{ shop: id }` script
// step at a vendor NPC; suspends the script until the player LEAVEs, then
// resumes with no follow-up. Reuses the menu-window components (drawWindow/
// text) and the pure inventory helpers; the only state it owns is coins in
// quest and the item list.
import { G } from '../state';
import { SHOPS, type ShopDef } from '../data/shops';
import { itemDef, sellPrice, canSell, packCounts } from './inventory';
import { quest, RANKS } from './quest';
import { perkPct } from './perks';
import { text, miniText, miniTextW, MINI_BASELINE_DY } from '../engine/renderer';
import { Input } from '../engine/input';
import { Audio2 } from '../engine/audio';
import type { Palette } from '../data/palettes';
import { listInput, flash, tickFlash, clampScroll, drawScreenChrome } from './ui/listScreen';

// FLW.3 — hold-to-buy repeat timer. Numbers frozen by design (PLAN): a
// plain press always buys exactly one; holding repeats after an initial
// delay, then at a fixed interval. Pure state so the cadence is unit-tested
// without mocking Input — shopUpdate is the only caller that touches Input.
export const HOLD_BUY_DELAY = 30; // frames held before the first repeat
export const HOLD_BUY_INTERVAL = 8; // frames between repeats after that

export interface HoldBuyState {
  heldT: number; // frames 'a' has been continuously held; 0 = not held
  blocked: boolean; // set once a repeat tick refuses a buy — held A stays
  // inert until release (FLW.3 Don't: a refusal on screen must not keep
  // re-attempting every interval)
}

/** Advances the hold-timer by one frame and reports whether THIS frame
 *  should attempt a repeat buy. The caller still owns the actual
 *  afford/stack check (shopUpdate below) and must set `blocked` itself when
 *  that check fails — this function only tracks cadence. Release (`held`
 *  false) resets BOTH heldT and `blocked` completely: the next press starts
 *  a clean hold, no partial credit carried over. */
export function tickHoldBuy(s: HoldBuyState, held: boolean): boolean {
  if (!held) {
    s.heldT = 0;
    s.blocked = false;
    return false;
  }
  if (s.blocked) return false;
  s.heldT++;
  if (s.heldT < HOLD_BUY_DELAY) return false;
  return (s.heldT - HOLD_BUY_DELAY) % HOLD_BUY_INTERVAL === 0;
}

interface ShopState {
  shop: ShopDef;
  mode: 'root' | 'buy' | 'sell';
  sel: number;
  top: number;
  msg: string | null;
  msgT: number;
  hold: HoldBuyState; // FLW.3 — hold-to-buy cadence, ticks every frame in 'buy' mode
  plus: { id: string; t: number } | null; // FLW.3 — draw-only "+1" flash, the QOL.4 juice idiom; never saved, never gates logic
  done: () => void;
}
let S: ShopState | null = null;

const ROOT = ['BUY', 'SELL', 'LEAVE'];
const VIS = 4;

// Row geometry (FLW.3 + follow-up). BUY and SELL are one three-column
// table — label / owned count / price:
//
//     > ROKKET BALL   x17  $200
//       ^ROW_X           ^COUNT_EDGE  ^PRICE_EDGE
//     label left-aligned at ROW_X; count and price right-aligned so their
//     last pixel lands just before COUNT_EDGE / PRICE_EDGE respectively.
//
// Derived from the body window's real bounds, not the shared rightText
// "8px from canvas" margin the header and other screens use — a shop row
// is the one place that needs every spare pixel:
//   - ROW_X=16 — label flush against the '>' gutter, the PACK_ROW_X
//     precedent in menu.ts.
//   - PRICE_EDGE=155 — drawWindow's double border leaves x ∈ [4,155]
//     (the PACK_ROW_CAP derivation).
//   - The owned count is drawn in the renderer's 3x5 MINI numerals, not
//     the 8px font. In 8px the worst stackable row — ROKKET BALL (11 chars,
//     88px) + 'x99' (24px) + '$200' (32px) — wants 144px of the 139px
//     between ROW_X and PRICE_EDGE: over budget before any gap. That's why
//     FLW.3 first shipped the BUY count bare and touching the label, and
//     why SELL (count hard-coded at x=104 since Phase 1c, label at 18)
//     overlapped both neighbours on that row. At MINI_W=4 pitch 'x99' is
//     11px, which buys COL_GAP of clear pixels either side of the count at
//     the cap — and the size difference is itself the cue that the number
//     is not part of the name or the price. Shortening the label or the
//     price is off the table (FLW.3 Don't, MNU.2 rule).
// Two caps fall out, one per row shape (derive-and-lint — shop-data-lint
// .test.ts checks every stock id, every sellable id and every price
// against them so the next long name or price fails loud):
//   - SHOP_STACK_ROW_CAP (11): label + 'x' + 2-digit count + price ≤ $999
//     (ROKKET BALL's $200 is the only stackable price today; sell-back
//     halves it). Used by BUY stackables and every SELL row — canSell only
//     admits heal/ball kinds, so SELL never shows gear. A stack past 99 is
//     the same "design question, not a draw bug" PACK_ROW_CAP accepts.
//   - SHOP_GEAR_ROW_CAP (12): label + price ≤ $9999, no count column (gear
//     is worn, not stacked — isGear below). UTILITY VEST sits exactly at
//     this cap with 3px before its always-4-digit price (perkPct('shop')
//     caps the discount at 40%, so $3000 never drops below $1800).
export const ROW_X = 16;
export const PRICE_EDGE = 155; // drawWindow's true interior right edge (x+w-5 for x=0,w=160)
export const COL_GAP = 4; // minimum ink-free px between neighbouring columns
const STACK_PRICE_W = 4; // '$' + up to 3 digits
const GEAR_PRICE_W = 5; // '$' + up to 4 digits
const COUNT_W = miniTextW('x99'); // the widest count the column budgets for
export const COUNT_EDGE = PRICE_EDGE - STACK_PRICE_W * 8 - COL_GAP;
export const SHOP_STACK_ROW_CAP = Math.floor((COUNT_EDGE - COUNT_W - COL_GAP - ROW_X) / 8);
export const SHOP_GEAR_ROW_CAP = Math.floor((PRICE_EDGE - GEAR_PRICE_W * 8 - ROW_X) / 8);

/** One table row. `count` is the mini-font column (null = gear, no column);
 *  it and the price are right-aligned at their edges, the count sitting on
 *  the 8px font's cap baseline. */
function drawRow(y: number, label: string, count: string | null, countCol: string, price: number, pal: Palette): void {
  text(label, ROW_X, y, pal[0]);
  if (count !== null) miniText(count, COUNT_EDGE - miniTextW(count), y + MINI_BASELINE_DY, countCol);
  const p = '$' + price;
  text(p, PRICE_EDGE - p.length * 8, y, pal[0]);
}

/** FLW.3: "gear" — worn, not stacked — is exactly the items carrying a
 *  `wear` def (items.ts:23; the three RNK.1 trophies plus the three BACK
 *  ROOM pieces are the only kind:'gear' items and all six carry one).
 *  Gated on `wear` rather than `kind === 'gear'` because `wear` is the
 *  field the data actually uses to mean "equip slot, not a bag stack" —
 *  they agree on every item today (item-data-lint.test.ts pins that so the
 *  two fields can't quietly drift apart), but `wear` is the one this draw
 *  logic is actually about. */
function isGear(id: string): boolean {
  return itemDef(id).wear !== undefined;
}

/** The buy-mode rows actually visible: `gate`-absent stock is unconditional
 *  (existing shops, unchanged); gated stock needs rankIdx >= its gate. A
 *  corrupt/unrecognised rank (RANKS.indexOf === -1) reads as GRUNT (idx 0),
 *  same stance as rankUp's and perkPct's corrupt-save handling. Hidden until
 *  earned — no locked-row UI, the row just isn't in this list. */
function buyStock(s: ShopState): string[] {
  const gate = s.shop.gate;
  if (!gate) return s.shop.stock;
  const rankIdx = Math.max(0, RANKS.indexOf(quest.rank as (typeof RANKS)[number]));
  return s.shop.stock.filter((id) => (gate[id] ?? 0) <= rankIdx);
}

/** Distinct sellable items the player is carrying, with counts. */
function sellList(): { id: string; count: number }[] {
  return packCounts(quest.items).filter((e) => canSell(e.id));
}
function rowCount(s: ShopState): number {
  if (s.mode === 'buy') return buyStock(s).length;
  if (s.mode === 'sell') return sellList().length;
  return ROOT.length;
}

export function openShop(shopId: string, done: () => void): void {
  Audio2.sfx('confirm');
  S = {
    shop: SHOPS[shopId],
    mode: 'root',
    sel: 0,
    top: 0,
    msg: null,
    msgT: 0,
    hold: { heldT: 0, blocked: false },
    plus: null,
    done,
  };
  G.state = 'shop';
}

function leave(): void {
  const s = S!;
  Audio2.sfx('cancel');
  const done = s.done;
  S = null;
  G.state = 'world';
  done();
}

/** What the till actually charges: base price minus the shop perk (RNK.0).
 *  Exported so the draw's price column shows the same number the buy takes —
 *  the discount is honest UI, not a surprise at the till. Sell-back stays on
 *  the BASE price (sellPrice), so even at the 40% cap buying (≥60%) never
 *  profits against selling (50%). */
export function buyPrice(id: string): number {
  return Math.floor(itemDef(id).price * (1 - perkPct('shop')));
}

/** Returns whether the buy succeeded — shopUpdate needs this to know when a
 *  repeat tick must set `hold.blocked` (FLW.3: a refusal blocks further
 *  repeats until release, checked fresh on EVERY tick, not just the first). */
function buy(s: ShopState, id: string): boolean {
  const price = buyPrice(id);
  if (quest.coins < price) {
    flash(s, 'NOT ENOUGH COINS!');
    return false;
  }
  quest.coins -= price;
  quest.items.push(id);
  flash(s, 'BOUGHT ' + id + '!', true);
  if (!isGear(id)) s.plus = { id, t: 40 }; // FLW.3 — stackables only; gear never shows a count, so never flashes one
  return true;
}

function sell(s: ShopState, id: string): void {
  const i = quest.items.indexOf(id);
  if (i < 0) return;
  quest.items.splice(i, 1);
  const got = sellPrice(id);
  quest.coins += got;
  flash(s, 'SOLD FOR ' + got + '!', true);
  clampScroll(s, rowCount(s), VIS);
}

export function shopUpdate(): void {
  const s = S!;
  tickFlash(s);
  if (s.plus && s.plus.t > 0) s.plus.t--; // FLW.3 — +1 flash decay, draw-only, ticks regardless of mode
  const n = rowCount(s);
  s.sel = listInput(s.sel, n);
  clampScroll(s, n, VIS);
  // FLW.3: advance the hold-to-buy timer every frame regardless of mode, so
  // heldT/blocked never carry stale state across a mode switch — only 'buy'
  // mode acts on a fired repeat, below.
  const repeatFire = tickHoldBuy(s.hold, Input.held('a'));
  if (Input.hit('a')) {
    if (s.mode === 'root') {
      Audio2.sfx('confirm');
      // The confirm press that ENTERS buy mode must not seed a hold: a
      // player who keeps A down through this press would otherwise auto-buy
      // the first row HOLD_BUY_DELAY frames later without ever pressing A
      // on an item. blocked stays until release (tickHoldBuy), so only a
      // hold BEGUN on an item row repeats.
      if (s.sel === 0) { s.mode = 'buy'; s.sel = 0; s.top = 0; s.hold.blocked = true; }
      else if (s.sel === 1) { s.mode = 'sell'; s.sel = 0; s.top = 0; }
      else leave();
    } else if (s.mode === 'buy') {
      buy(s, buyStock(s)[s.sel]);
    } else {
      const list = sellList();
      if (list.length) sell(s, list[s.sel].id);
      else flash(s, 'NOTHING TO SELL.');
    }
    return;
  }
  if (s.mode === 'buy' && repeatFire) {
    // Every repeat tick re-runs the SAME afford/stack check a plain press
    // does (FLW.3 Don't) — buy() returns false on refusal, and that blocks
    // further repeats until A is released.
    if (!buy(s, buyStock(s)[s.sel])) s.hold.blocked = true;
  }
  if (Input.hit('b') || Input.hit('start')) {
    if (s.mode === 'root') leave();
    else { Audio2.sfx('cancel'); s.mode = 'root'; s.sel = 0; s.top = 0; }
  }
}

export function shopDraw(pal: Palette): void {
  const s = S!;
  // footer: transient message or a description of the selected buy item
  let footer = 'A:OK  B:BACK';
  if (s.msgT > 0 && s.msg) footer = s.msg;
  else if (s.mode === 'buy') footer = itemDef(buyStock(s)[s.sel]).desc;
  drawScreenChrome(pal, s.shop.name, '$' + quest.coins, footer);
  if (s.mode === 'root') {
    ROOT.forEach((it, i) => {
      const y = 34 + i * 14;
      if (i === s.sel) text('>', 8, y, pal[0]);
      text(it, 20, y, pal[0]);
    });
  } else if (s.mode === 'buy') {
    // FLW.3: owned counts only make sense for stackable items — gear is
    // worn, not carried in multiples (isGear above). Built once per draw,
    // not per row (the MNU.1 rule).
    const owned = new Map(packCounts(quest.items).map((e) => [e.id, e.count]));
    buyStock(s).slice(s.top, s.top + VIS).forEach((id, r) => {
      const idx = s.top + r;
      const y = 34 + r * 18;
      if (idx === s.sel) text('>', 8, y, pal[0]);
      let count: string | null = null;
      let col = pal[0];
      if (!isGear(id)) {
        // '+1' rides the SAME column as the count (both ≤3 mini glyphs, the
        // width SHOP_STACK_ROW_CAP already reserves) instead of adding
        // width — the QOL.4 flash-in-place idiom, alternating pal[1]/pal[0]
        // every 4 frames while active.
        const flashing = s.plus !== null && s.plus.t > 0 && s.plus.id === id;
        count = flashing ? '+1' : 'x' + (owned.get(id) ?? 0);
        if (flashing) col = Math.floor(s.plus!.t / 4) & 1 ? pal[1] : pal[0];
      }
      drawRow(y, id, count, col, buyPrice(id), pal);
    });
  } else {
    const list = sellList();
    if (list.length === 0) text('NOTHING TO SELL.', 18, 40, pal[0]);
    list.slice(s.top, s.top + VIS).forEach((e, r) => {
      const idx = s.top + r;
      const y = 34 + r * 18;
      if (idx === s.sel) text('>', 8, y, pal[0]);
      drawRow(y, e.id, 'x' + e.count, pal[0], sellPrice(e.id), pal);
    });
  }
}
