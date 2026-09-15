// F44 — the start-menu MAP (spec: docs/superpowers/specs/2026-09-11-world-map-design.md).
// Two modes. WORLD: a scrolling 40×36 grid of 8px parchment terrain, every
// undiscovered region's rect painted with the fog tile, every VISITED map
// inked on it at 1px a tile (the shape IS the map), a cursor that jumps to
// the nearest lit region, the job's region flashing. DETAIL: one map at 8px
// a tile, only tiles in quest.seen drawn. Rank-ladder idiom:
// menu.ts only wires open/close; everything else lives here. Draws in
// BG_PAL.parchment regardless of the map palette handed in.
import { W, H, rect, text, decode, ctx } from '../engine/renderer';
import { Input } from '../engine/input';
import { Audio2 } from '../engine/audio';
import { G } from '../state';
import type { Dir, MapDef, MapId } from '../types';
import type { Palette } from '../data/palettes';
import { BG_PAL } from '../data/palettes';
import { MAPS } from '../data/maps';
import { REGIONS, REGION_TILE, regionOf, regionById, regionDiscovered, type RegionDef, type RegionId } from '../data/region';
import { WORLD_ROWS, WORLD_W, WORLD_H, WORLD_TILES, FOG_CHAR, MINI } from '../data/worldMap';
import { quest, currentTargetRegion, npcGone, npcTodo, npcFights } from './quest';
import { isSeen, type Seen } from './seen';
import { TODO_BOB } from '../engine/easing';

// ── geometry ────────────────────────────────────────────────────────────────
/** Title bar 0–11, the field, footer 132–143 (a 12px bar holds an 8px glyph line). */
export const FIELD = { x: 0, y: 12, w: W, h: 120 };
const FOOTER = { y: 132, tx: 6, ty: 134 };
export const MAP_NAME_CAP = Math.floor((W - 4 - FOOTER.tx) / 8) - 1; // -1 for the '!'
const WORLD_PX_W = WORLD_W * REGION_TILE; // 320
const WORLD_PX_H = WORLD_H * REGION_TILE; // 288
const PAL = (): Palette => BG_PAL.parchment;

const cx = (r: RegionDef): number => (r.world.x + r.world.w / 2) * REGION_TILE;
const cy = (r: RegionDef): number => (r.world.y + r.world.h / 2) * REGION_TILE;

// ── pure helpers (unit-tested) ──────────────────────────────────────────────
/** The nearest lit region whose rect lies wholly beyond this one's edge in
 *  `dir` (the GB Town Map idiom — a neighbour beside you is never "up"). */
export function nextRegion(cur: RegionId, dir: Dir, discovered: (r: RegionDef) => boolean): RegionId {
  const from = regionById(cur);
  const f = from.world;
  let best: RegionDef | null = null;
  let bestD = Infinity;
  for (const r of REGIONS) {
    if (r.id === cur || !discovered(r)) continue;
    const b = r.world;
    const ahead = dir === 'left' ? b.x + b.w <= f.x
      : dir === 'right' ? b.x >= f.x + f.w
      : dir === 'up' ? b.y + b.h <= f.y
      : b.y >= f.y + f.h;
    if (!ahead) continue;
    const dx = cx(r) - cx(from), dy = cy(r) - cy(from);
    const d = dx * dx + dy * dy;
    if (d < bestD) { best = r; bestD = d; }
  }
  return best ? best.id : cur;
}

/** F42 MAP.0: the quest target flashes on the todo-marker cadence — lit on
 *  the raised frames of the `!` bob, so the map and the world agree. */
export function targetLit(frame: number): boolean {
  return TODO_BOB[(frame >> 3) & 3] > 0;
}

/** The terrain char at a world tile, or FOG_CHAR inside an undiscovered region. */
export function worldCell(wx: number, wy: number, discovered: (r: RegionDef) => boolean): string {
  for (const r of REGIONS) {
    const b = r.world;
    if (wx >= b.x && wx < b.x + b.w && wy >= b.y && wy < b.y + b.h) return discovered(r) ? WORLD_ROWS[wy][wx] : FOG_CHAR;
  }
  return WORLD_ROWS[wy][wx];
}

/** A map's footprint at 1px a tile: the ink pixels (walls and void). */
export function footprintPixels(map: MapDef): [number, number][] {
  const out: [number, number][] = [];
  for (let y = 0; y < map.h; y++)
    for (let x = 0; x < map.w; x++) {
      const ch = map.grid[y][x];
      if (ch === '#' || ch === '=' || ch === '.') out.push([x, y]);
    }
  return out;
}

/** Top-left of the view in world pixels: the region centred, clamped. */
export function worldCamera(id: RegionId): [number, number] {
  const r = regionById(id);
  const camX = Math.max(0, Math.min(WORLD_PX_W - FIELD.w, Math.round(cx(r) - FIELD.w / 2)));
  const camY = Math.max(0, Math.min(WORLD_PX_H - FIELD.h, Math.round(cy(r) - FIELD.h / 2)));
  return [camX, camY];
}

// ── state ───────────────────────────────────────────────────────────────────
type Mode = 'world' | 'detail';
interface Nav { mode: Mode; cursor: RegionId; map: MapId; scrollX: number; scrollY: number }
let nav: Nav | null = null;

export function isMapScreenOpen(): boolean { return nav !== null; }
/** The cursor's region (tests, `__debug`); null while closed. */
export function mapCursor(): RegionId | null { return nav?.cursor ?? null; }
export function mapMode(): Mode | null { return nav?.mode ?? null; }
/** The map the detail view is showing (tests, __debug). */
export function mapDetailMap(): MapId | null { return nav?.mode === 'detail' ? nav.map : null; }

const discovered = (r: RegionDef): boolean => regionDiscovered(r, quest.visited);

export function openMapScreen(): void {
  nav = { mode: 'world', cursor: regionOf(G.map.id)!.id, map: G.map.id, scrollX: 0, scrollY: 0 };
}
export function closeMapScreen(): void {
  Audio2.sfx('cancel');
  nav = null;
}

/** First visited map of a region, in table order; the player's own map if it is in there.
 *  The `?? r.maps[0]` fallback is unreachable — the cursor only lands on a
 *  discovered region, and discovered means at least one of its maps is visited. */
function firstVisited(r: RegionDef): MapId {
  if (r.maps.includes(G.map.id)) return G.map.id;
  return r.maps.find((m) => quest.visited.has(m)) ?? r.maps[0];
}

function enterDetail(map: MapId): void {
  const n = nav!;
  n.mode = 'detail';
  n.map = map;
  n.scrollX = 0;
  n.scrollY = 0;
  Audio2.sfx('confirm');
}

export function mapScreenUpdate(): void {
  const n = nav!;
  if (n.mode === 'detail') { detailUpdate(n); return; }
  for (const dir of ['left', 'right', 'up', 'down'] as const) {
    if (!Input.hit(dir)) continue;
    const next = nextRegion(n.cursor, dir, discovered);
    if (next !== n.cursor) { n.cursor = next; Audio2.sfx('beep'); }
  }
  if (Input.hit('a') && discovered(regionById(n.cursor))) enterDetail(firstVisited(regionById(n.cursor)));
  else if (Input.hit('b') || Input.hit('start')) closeMapScreen();
}

// ── world draw ──────────────────────────────────────────────────────────────
function chrome(title: string, footer: string): void {
  const pal = PAL();
  rect(0, 0, W, H, pal[3]);
  rect(0, 0, W, FIELD.y, pal[0]);
  text(title, 4, 2, pal[3]);
  rect(0, FOOTER.y, W, H - FOOTER.y, pal[0]);
  text(footer, FOOTER.tx, FOOTER.ty, pal[3]);
}

function clipField(): void {
  ctx.save(); ctx.beginPath(); ctx.rect(FIELD.x, FIELD.y, FIELD.w, FIELD.h); ctx.clip();
}

function worldModeDraw(n: Nav): void {
  const pal = PAL();
  const [camX, camY] = worldCamera(n.cursor);
  const target = currentTargetRegion();
  const lit = targetLit(G.frame);
  const here = regionOf(G.map.id)!.id;
  const at = regionById(n.cursor);
  chrome('MAP', at.name + (at.id === target ? '!' : ''));
  clipField();
  const x0 = Math.floor(camX / REGION_TILE), y0 = Math.floor(camY / REGION_TILE);
  for (let wy = y0; wy <= y0 + FIELD.h / REGION_TILE && wy < WORLD_H; wy++)
    for (let wx = x0; wx <= x0 + FIELD.w / REGION_TILE && wx < WORLD_W; wx++)
      ctx.drawImage(decode(WORLD_TILES[worldCell(wx, wy, discovered)], pal), wx * REGION_TILE - camX, FIELD.y + wy * REGION_TILE - camY);
  for (const r of REGIONS) {
    if (!discovered(r)) continue;
    const flash = r.id === target && lit;
    for (const id of r.maps) {
      if (!quest.visited.has(id)) continue;
      const [ax, ay] = r.anchors[id]!;
      const m = MAPS[id];
      rect(ax - camX - 1, FIELD.y + ay - camY - 1, m.w + 2, m.h + 2, flash ? pal[3] : pal[2]); // paper behind the ink
      for (const [px, py] of footprintPixels(m)) rect(ax + px - camX, FIELD.y + ay + py - camY, 1, 1, pal[0]);
    }
    if (r.id === n.cursor) {
      const b = r.world;
      const x = b.x * REGION_TILE - camX, y = FIELD.y + b.y * REGION_TILE - camY, w = b.w * REGION_TILE, h = b.h * REGION_TILE;
      rect(x, y, w, 1, pal[1]); rect(x, y + h - 1, w, 1, pal[1]); rect(x, y, 1, h, pal[1]); rect(x + w - 1, y, 1, h, pal[1]);
    }
    if (r.id === here) {
      const [ax, ay] = r.anchors[G.map.id] ?? r.anchors[r.maps[0]]!;
      // +8 is deliberate: anti-phase with the target region's flash, so the two never blink together.
      if (targetLit(G.frame + 8)) ctx.drawImage(decode(MINI.grunt, pal), ax + G.player.x - camX - 3, FIELD.y + ay + G.player.y - camY - 7);
    }
  }
  ctx.restore();
}

// menu.ts hands the CURRENT map's palette in, as it does to every sub-screen.
// The MAP deliberately ignores it — the paper is always BG_PAL.parchment.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function mapScreenDraw(_mapPal: Palette): void {
  const n = nav!;
  if (n.mode === 'world') worldModeDraw(n);
  else detailDraw(n);
}

// ── detail: legend, seen edge, scroll ───────────────────────────────────────
export type TileClass = 'wall' | 'floor' | 'water' | 'void' | 'furniture' | 'door' | 'stairs' | 'sign' | 'chest' | 'pad';
/** The drill-in legend: one class per grid char. Lint-pinned against tiles.ts
 *  — the test walks TILES and WALKABLE, so a blocking tile can never read as
 *  paper and a walkable one can never read as an obstacle. */
export function tileClass(ch: string): TileClass {
  if (ch === '#' || ch === '=' || ch === '&') return 'wall';
  if (ch === 'w' || ch === 'S') return 'water'; // '~' is RUBBLE — walkable, so it draws as floor; S = the sea (F46 ART.5)
  if (ch === '.') return 'void';
  if ('BXPILKMDCVptJQRT'.includes(ch)) return 'furniture';
  if (ch === 'o' || ch === 'd') return 'door';
  if (ch === '>') return 'stairs';
  if (ch === 's') return 'sign';
  if (ch === '$' || ch === '%' || ch === 'b') return 'chest';
  if (ch === 'W' || ch === 'h') return 'pad';
  return 'floor';
}

export function seenEdge(s: Seen, w: number, h: number, x: number, y: number): boolean {
  if (isSeen(s, w, x, y)) return false;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < w && ny < h && isSeen(s, w, nx, ny)) return true;
  }
  return false;
}

const DETAIL_TILE = 8;
const SCROLL_STEP = 8;

function detailBounds(m: MapDef): { ox: number; oy: number; maxX: number; maxY: number } {
  const pw = m.w * DETAIL_TILE, ph = m.h * DETAIL_TILE;
  return {
    ox: pw < FIELD.w ? Math.floor((FIELD.w - pw) / 2) : 0,
    oy: ph < FIELD.h ? Math.floor((FIELD.h - ph) / 2) : 0,
    maxX: Math.max(0, pw - FIELD.w),
    maxY: Math.max(0, ph - FIELD.h),
  };
}

/** The region's visited maps in table order — the floors A cycles through. */
function visitedIn(r: RegionDef): MapId[] {
  return r.maps.filter((id) => quest.visited.has(id));
}

function detailUpdate(n: Nav): void {
  const m = MAPS[n.map];
  const b = detailBounds(m);
  if (Input.hit('left')) n.scrollX = Math.max(0, n.scrollX - SCROLL_STEP);
  if (Input.hit('right')) n.scrollX = Math.min(b.maxX, n.scrollX + SCROLL_STEP);
  if (Input.hit('up')) n.scrollY = Math.max(0, n.scrollY - SCROLL_STEP);
  if (Input.hit('down')) n.scrollY = Math.min(b.maxY, n.scrollY + SCROLL_STEP);
  if (Input.hit('a')) {
    const lit = visitedIn(regionById(n.cursor));
    if (lit.length > 1) { n.map = lit[(lit.indexOf(n.map) + 1) % lit.length]; n.scrollX = 0; n.scrollY = 0; Audio2.sfx('beep'); }
  }
  if (Input.hit('b') || Input.hit('start')) { n.mode = 'world'; Audio2.sfx('cancel'); }
}

function detailDraw(n: Nav): void {
  const pal = PAL();
  const m = MAPS[n.map];
  const s = quest.seen[n.map];
  chrome(m.name, visitedIn(regionById(n.cursor)).length > 1 ? 'A:FLOOR B:BACK' : 'B:BACK');
  if (!s) return; // never stood here — bare parchment is the honest answer
  const b = detailBounds(m);
  clipField();
  for (let y = 0; y < m.h; y++) {
    for (let x = 0; x < m.w; x++) {
      const X = FIELD.x + b.ox + x * DETAIL_TILE - n.scrollX, Y = FIELD.y + b.oy + y * DETAIL_TILE - n.scrollY;
      if (X + DETAIL_TILE < FIELD.x || X > FIELD.x + FIELD.w || Y + DETAIL_TILE < FIELD.y || Y > FIELD.y + FIELD.h) continue;
      if (!isSeen(s, m.w, x, y)) {
        if (seenEdge(s, m.w, m.h, x, y)) for (let i = 0; i < DETAIL_TILE; i += 2) rect(X + i, Y + (i % 4 ? 1 : 0), 1, 1, pal[1]);
        continue;
      }
      const k = tileClass(m.grid[y][x]);
      const base = k === 'wall' ? pal[0] : k === 'water' || k === 'void' ? pal[2] : k === 'furniture' ? pal[1] : pal[3];
      rect(X, Y, DETAIL_TILE, DETAIL_TILE, base);
      if (k === 'floor' || k === 'water') rect(X, Y, DETAIL_TILE, 1, pal[2]); // faint grid line
      if (k === 'door' || k === 'stairs' || k === 'sign' || k === 'chest' || k === 'pad') ctx.drawImage(decode(MINI[k], pal), X, Y);
    }
  }
  // MAP.2: live NPCs on seen tiles — plain, fighter, and the `!` above a todo
  for (const p of m.npcs) {
    if (npcGone(p) || !isSeen(s, m.w, p.x, p.y)) continue;
    const X = FIELD.x + b.ox + p.x * DETAIL_TILE - n.scrollX, Y = FIELD.y + b.oy + p.y * DETAIL_TILE - n.scrollY;
    ctx.drawImage(decode(npcFights(m, p) ? MINI.fight : MINI.npc, pal), X, Y);
    if (npcTodo(p)) ctx.drawImage(decode(MINI.todo, pal), X, Y - DETAIL_TILE);
  }
  if (n.map === G.map.id && targetLit(G.frame)) {
    ctx.drawImage(decode(MINI.grunt, pal), FIELD.x + b.ox + G.player.x * DETAIL_TILE - n.scrollX, FIELD.y + b.oy + G.player.y * DETAIL_TILE - n.scrollY);
  }
  ctx.restore();
}
