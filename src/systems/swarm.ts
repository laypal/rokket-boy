// CH8-FB.4 — the lockdown bust as a swarm (Lyall, 2026-09-16): at ALARM 0 s
// a dozen guards in the map's own charset pour in from the four screen
// edges and close on the player before the whiteout fires, so the bust
// reads on screen instead of cutting straight to HQ. The tick is pure
// (tests); the draw decodes the frames once per swarm, on first draw.
import { CHARSETS, type Charset } from '../data/chars';
import { OBJ_PAL } from '../data/palettes';
import { stack, mirrorRows } from '../data/sprites';
import { decode, ctx, W, H, TILE } from '../engine/renderer';
import type { Dir } from '../types';

export const SWARM_COUNT = 12;
export const SWARM_FRAMES = 54; // ~0.9 s at 60 fps — long enough to read, short enough to sting
const SPEED = 3; // px per frame
const STEP_BEAT = 6; // frames per run frame

export interface SwarmSprite { x: number; y: number; dir: Dir }

interface Swarm {
  char: string;
  pal: string | undefined;
  tx: number; // target (the player) in world px
  ty: number;
  sprites: SwarmSprite[];
  t: number;
  onDone: () => void;
  frames: Record<Dir, HTMLCanvasElement[]> | null;
}

let swarm: Swarm | null = null;

/** Start a swarm converging on world tile (px, py). `onDone` fires once,
 *  after SWARM_FRAMES ticks, and is where the caller puts the whiteout. */
export function startSwarm(char: string, pal: string | undefined, px: number, py: number, onDone: () => void): void {
  const tx = px * TILE;
  const ty = py * TILE;
  const sprites: SwarmSprite[] = [];
  // three per edge, spread along it, just off the screen around the player
  const hw = W / 2 + TILE;
  const hh = H / 2 + TILE;
  for (let i = 0; i < SWARM_COUNT; i++) {
    const edge = i % 4;
    const k = (Math.floor(i / 4) - 1) * 0.6; // -0.6, 0, 0.6 along the edge
    if (edge === 0) sprites.push({ x: tx + k * hw, y: ty - hh, dir: 'down' });
    else if (edge === 1) sprites.push({ x: tx + hw, y: ty + k * hh, dir: 'left' });
    else if (edge === 2) sprites.push({ x: tx + k * hw, y: ty + hh, dir: 'up' });
    else sprites.push({ x: tx - hw, y: ty + k * hh, dir: 'right' });
  }
  swarm = { char, pal, tx, ty, sprites, t: 0, onDone, frames: null };
}

export function swarmActive(): boolean {
  return swarm !== null;
}

/** Read-only view for tests. */
export function swarmSprites(): readonly SwarmSprite[] {
  return swarm ? swarm.sprites : [];
}

/** One frame of the swarm. Returns true while it owns the frame. */
export function swarmTick(): boolean {
  if (!swarm) return false;
  const s = swarm;
  for (const sp of s.sprites) {
    const dx = s.tx - sp.x;
    const dy = s.ty - sp.y;
    const d = Math.hypot(dx, dy);
    if (d <= TILE) continue; // arrived: hold a tile off the player, crowding
    sp.x += (dx / d) * SPEED;
    sp.y += (dy / d) * SPEED;
    sp.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
  }
  s.t++;
  if (s.t >= SWARM_FRAMES) {
    swarm = null;
    s.onDone();
  }
  return true;
}

export function clearSwarm(): void {
  swarm = null;
}

function buildFrames(cs: Charset, pal: string[]): Record<Dir, HTMLCanvasElement[]> {
  const f = (head: 'd' | 'u' | 's', body: 'd0' | 'd1' | 'u0' | 'u1' | 's0' | 's1', mirror: boolean) => {
    const rows = stack(cs.head[head], cs.body[body]);
    return decode(mirror ? mirrorRows(rows) : rows, pal);
  };
  return {
    down: [f('d', 'd1', false), f('d', 'd1', true)],
    up: [f('u', 'u1', false), f('u', 'u1', true)],
    left: [f('s', 's1', false), f('s', 's0', false)],
    right: [f('s', 's1', true), f('s', 's0', true)],
  };
}

/** Draw the swarm in world space (after the NPC layer). */
export function swarmDraw(camX: number, camY: number): void {
  if (!swarm) return;
  const s = swarm;
  if (!s.frames) {
    const cs = CHARSETS[s.char] ?? CHARSETS.guard;
    s.frames = buildFrames(cs, OBJ_PAL[s.pal ?? ''] ?? cs.pal);
  }
  const step = Math.floor(s.t / STEP_BEAT) & 1;
  for (const sp of s.sprites) {
    ctx.drawImage(s.frames[sp.dir][step], Math.round(sp.x - camX), Math.round(sp.y - camY) - 4);
  }
}
