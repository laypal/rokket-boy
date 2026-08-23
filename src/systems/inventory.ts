// Pure inventory/item helpers (Phase 1c §5). No engine/DOM imports so these
// stay Node-testable, same discipline as mon.ts.
import type { MonInstance, MonSpecies } from '../types';
import { ITEMS, type ItemDef } from '../data/items';
import { maxHp } from './mon';

/** Looks up an item def; unknown ids (legacy content, future items) fall
 *  back to a harmless synthetic 'quest' def instead of crashing the UI. */
export function itemDef(id: string): ItemDef {
  return ITEMS[id] ?? { id, kind: 'quest', price: 0, desc: '' };
}

/** Half the buy price, floored — the shop's sell-back rate. */
export function sellPrice(id: string): number {
  return Math.floor(itemDef(id).price / 2);
}

/** Battle/PACK row label for a packCounts entry (QOL.1): `SODA x3`. */
export function itemLabel(e: { id: string; count: number }): string {
  return `${e.id} x${e.count}`;
}

/** Groups a flat item list into id+count pairs, preserving first-seen order. */
export function packCounts(items: string[]): { id: string; count: number }[] {
  const order: string[] = [];
  const counts = new Map<string, number>();
  for (const id of items) {
    if (!counts.has(id)) order.push(id);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return order.map((id) => ({ id, count: counts.get(id)! }));
}

/** Usable from the in-battle PACK menu: heals and the guaranteed-flee key
 *  item. Balls are thrown via SWIPE, not the pack; quest items never apply. */
export function usableInBattle(id: string): boolean {
  const kind = itemDef(id).kind;
  return kind === 'heal' || kind === 'key';
}

/** Usable from the overworld PACK menu. Heals always; the key-item SMOKE
 *  BALL only when the current map is hot (§4.8, 1f.7) — the caller passes
 *  the map's heat stage so this module stays pure. */
export function usableOutOfBattle(id: string, heatStage = 0): boolean {
  const kind = itemDef(id).kind;
  if (kind === 'heal' || kind === 'candy') return true; // SIDE.7: candy is a PARTY-picker item like a heal
  return kind === 'key' && id === 'SMOKE BALL' && heatStage > 0;
}

/** Sellable from the shop: heals and balls, never key/quest items. */
export function canSell(id: string): boolean {
  const kind = itemDef(id).kind;
  return kind === 'heal' || kind === 'ball';
}

/**
 * Applies a heal item to a mon, clamped to its max hp. Mutates `mon.hp` and
 * returns the amount actually restored (0 for non-heal items or a mon
 * already at full hp). This function itself will heal a fainted mon — the
 * no-revive rule (heal items never wake a mon at 0 hp; only the HQ bunk and
 * the whiteout revive) is enforced by BOTH callers before consuming: battle's
 * target pick and the PARTY screen. A future REVIVE item bypasses those
 * guards, not this function.
 */
export function applyHeal(mon: MonInstance, species: MonSpecies, item: ItemDef): number {
  if (item.kind !== 'heal' || item.heal === undefined) return 0;
  const healed = Math.min(item.heal, maxHp(species, mon.lv) - mon.hp);
  mon.hp += healed;
  return healed;
}
