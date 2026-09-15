// Pixel-string sprite helpers. Rows are strings of '0'-'3' (palette shade)
// or '.' (transparent). Rows carry a _id tag used as the decode cache key.
export type SpriteRows = string[] & { _id: string };

let _sid = 0;
export function S(...rows: string[]): SpriteRows {
  const r = rows as SpriteRows;
  r._id = 's' + _sid++;
  return r;
}

export function mirrorRows(rows: SpriteRows): SpriteRows {
  const m = rows.map((r) => r.split('').reverse().join('')) as SpriteRows;
  m._id = rows._id + 'm';
  return m;
}

/** F46 ART.3: idle frame 2 for a pure floater — the same silhouette moved
 *  dx columns right / dy rows down (|d| ≤ 1). Throws if any ink would be
 *  clipped, so a full-height sprite can't silently lose a row. */
export function shiftRows(rows: SpriteRows, dx: number, dy: number): SpriteRows {
  const w = rows[0].length;
  const blank = '.'.repeat(w);
  const out = rows.map((_, y) => {
    const r = rows[y - dy] ?? blank;
    return dx > 0 ? blank.slice(0, dx) + r.slice(0, w - dx) : r.slice(-dx) + blank.slice(0, -dx);
  }) as SpriteRows;
  const ink = (rs: string[]) => rs.reduce((n, r) => n + r.replace(/\./g, '').length, 0);
  if (ink(out) !== ink(rows)) throw new Error(`shiftRows: ${rows._id} would clip ink at (${dx},${dy})`);
  out._id = `${rows._id}s${dx},${dy}`;
  return out;
}

/** F46 ART.5: the same rows rotated dx columns left, wrapping — a scrolling
 *  tile's frames (the sea) come from here, so four frames cost no bytes. */
export function rotateRows(rows: SpriteRows, dx: number): SpriteRows {
  const out = rows.map((r) => r.slice(dx) + r.slice(0, dx)) as SpriteRows;
  out._id = `${rows._id}r${dx}`;
  return out;
}

/** The shared tile-animation cycle: a step every 32 frames, round the
 *  tile's frame list however long it is (2 for the TERM/SLOT shimmer, 4
 *  for the sea). */
export function cycleFrame(frames: SpriteRows[], frame: number): SpriteRows {
  return frames[(frame >> 5) % frames.length];
}

export function stack(head: SpriteRows, body: SpriteRows): SpriteRows {
  const rows = head.concat(body) as SpriteRows;
  rows._id = head._id + '+' + body._id;
  return rows;
}

/** RNK.5a worn-gear compose: per-pixel overlay, the top pixel wins unless
 *  transparent ('.'). Mints a fresh deterministic _id — decode() caches
 *  canvases by _id, so a composed set must never collide with its base but
 *  the same pair must still hit the cache. */
export function overlayRows(base: SpriteRows, top: SpriteRows): SpriteRows {
  const rows = base.map((r, y) => {
    const t = top[y] ?? '';
    let out = '';
    for (let x = 0; x < r.length; x++) out += t[x] && t[x] !== '.' ? t[x] : r[x];
    return out;
  }) as SpriteRows;
  rows._id = base._id + '^' + top._id;
  return rows;
}

// ── Battle FX micro-sprites (13-battle-fx.md) ─────────────────────────────
// A shared 8×8 pool, positioned procedurally by battleFx.ts and tinted per
// move type via typePal — Gen-1 style: few effects, recoloured everywhere.
export type FxSpriteId = 'puff' | 'spark' | 'star' | 'ring' | 'ball';

export const FX_SPRITES: Record<FxSpriteId, SpriteRows> = {
  ball: S(
    '..0000..',
    '.011110.',
    '01111110',
    '00000000',
    '03333330',
    '.033330.',
    '..0000..',
    '........',
  ),
  puff: S(
    '..2332..',
    '.233332.',
    '23333332',
    '23233232',
    '23333332',
    '.233332.',
    '..2332..',
    '........',
  ),
  spark: S(
    '...3....',
    '...3....',
    '..232...',
    '3323233.',
    '..232...',
    '...3....',
    '...3....',
    '........',
  ),
  star: S(
    '...3....',
    '..333...',
    '.33333..',
    '3333333.',
    '.33333..',
    '..333...',
    '...3....',
    '........',
  ),
  ring: S(
    '..333...',
    '.3...3..',
    '3.....3.',
    '3.....3.',
    '3.....3.',
    '.3...3..',
    '..333...',
    '........',
  ),
};

// UI (2026-09-09, Lyall): the "press A" button — a 10×10 round key with
// an A on it, drawn in the window's own palette (0 ink on 3 paper) where
// the dialog box and the system toast used to blink a bare `v`.
export const BTN_A = S(
  '..000000..',
  '.03333330.',
  '0330003330',
  '0303330330',
  '0303330330',
  '0300000030',
  '0303330330',
  '0303330330',
  '.03333330.',
  '..000000..',
);
