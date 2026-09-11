// F44 WM.1 — per-map "seen" bitmaps for the MAP's drill-in fog. Pure: no
// engine imports, so it unit-tests in Node and save.ts can serialise it.
// One bit per tile, row-major, ceil(w*h/8) bytes. The ring is the CH5
// lantern (fogVisible, radius 3) so the map and the world agree on what
// "seen" means.
import { fogVisible, FOG_RADIUS } from './fog';

export type Seen = Uint8Array;

export function newSeen(w: number, h: number): Seen {
  return new Uint8Array(Math.ceil((w * h) / 8));
}

export function isSeen(s: Seen, w: number, x: number, y: number): boolean {
  const i = y * w + x;
  return (s[i >> 3] & (1 << (i & 7))) !== 0;
}

function set(s: Seen, w: number, x: number, y: number): void {
  const i = y * w + x;
  s[i >> 3] |= 1 << (i & 7);
}

/** Mark the lantern ring around (x, y), clipped to the map. */
export function markSeen(s: Seen, w: number, h: number, x: number, y: number): void {
  for (let dy = -FOG_RADIUS; dy <= FOG_RADIUS; dy++) {
    for (let dx = -FOG_RADIUS; dx <= FOG_RADIUS; dx++) {
      if (!fogVisible(dx, dy)) continue;
      const tx = x + dx, ty = y + dy;
      if (tx < 0 || ty < 0 || tx >= w || ty >= h) continue;
      set(s, w, tx, ty);
    }
  }
}

export function seenCount(s: Seen): number {
  let n = 0;
  for (const b of s) for (let k = 0; k < 8; k++) if (b & (1 << k)) n++;
  return n;
}

export function seenToB64(s: Seen): string {
  let bin = '';
  for (const b of s) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** Lenient: anything that isn't a base64 blob of exactly the right length
 *  reads as nothing seen — a bad save field never invalidates the save. */
export function seenFromB64(b64: unknown, w: number, h: number): Seen {
  const fresh = newSeen(w, h);
  if (typeof b64 !== 'string' || b64 === '') return fresh;
  try {
    const bin = atob(b64);
    if (bin.length !== fresh.length) return fresh;
    for (let i = 0; i < bin.length; i++) fresh[i] = bin.charCodeAt(i) & 0xff;
    return fresh;
  } catch {
    return fresh;
  }
}
