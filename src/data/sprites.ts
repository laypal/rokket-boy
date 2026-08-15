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
