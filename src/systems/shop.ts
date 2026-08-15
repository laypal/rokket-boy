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
import { text } from '../engine/renderer';
import { Input } from '../engine/input';
import { Audio2 } from '../engine/audio';
import type { Palette } from '../data/palettes';
import { listInput, flash, tickFlash, clampScroll, drawScreenChrome, rightText } from './ui/listScreen';

interface ShopState {
  shop: ShopDef;
  mode: 'root' | 'buy' | 'sell';
  sel: number;
  top: number;
  msg: string | null;
  msgT: number;
  done: () => void;
}
let S: ShopState | null = null;

const ROOT = ['BUY', 'SELL', 'LEAVE'];
const VIS = 4;

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
  S = { shop: SHOPS[shopId], mode: 'root', sel: 0, top: 0, msg: null, msgT: 0, done };
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

function buy(s: ShopState, id: string): void {
  const price = buyPrice(id);
  if (quest.coins < price) {
    flash(s, 'NOT ENOUGH COINS!');
    return;
  }
  quest.coins -= price;
  quest.items.push(id);
  flash(s, 'BOUGHT ' + id + '!', true);
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
  const n = rowCount(s);
  s.sel = listInput(s.sel, n);
  clampScroll(s, n, VIS);
  if (Input.hit('a')) {
    if (s.mode === 'root') {
      Audio2.sfx('confirm');
      if (s.sel === 0) { s.mode = 'buy'; s.sel = 0; s.top = 0; }
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
    buyStock(s).slice(s.top, s.top + VIS).forEach((id, r) => {
      const idx = s.top + r;
      const y = 34 + r * 18;
      if (idx === s.sel) text('>', 8, y, pal[0]);
      text(id, 18, y, pal[0]);
      rightText('$' + buyPrice(id), y, pal[0]);
    });
  } else {
    const list = sellList();
    if (list.length === 0) text('NOTHING TO SELL.', 18, 40, pal[0]);
    list.slice(s.top, s.top + VIS).forEach((e, r) => {
      const idx = s.top + r;
      const y = 34 + r * 18;
      if (idx === s.sel) text('>', 8, y, pal[0]);
      text(e.id, 18, y, pal[0]);
      text('x' + e.count, 104, y, pal[0]);
      rightText('$' + sellPrice(e.id), y, pal[0]);
    });
  }
}
