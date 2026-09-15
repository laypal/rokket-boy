// F46 ART.6 — ambient sky over the intro's tower cards (ONB.8 beat 2):
// clouds drift behind the building on G.frame, parallaxed slower than the
// climb, and two birds cross the frame once on the last tower card. Data
// plus one draw call from introUpdate(); the world renderer is untouched —
// the clouds are drawn AFTER worldDraw() and clipped to the sky, which is
// what puts them behind the facade.
import { G } from '../state';
import { S, type SpriteRows } from '../data/sprites';
import { BG_PAL } from '../data/palettes';
import { ctx, decode, W } from '../engine/renderer';

// Moonlit clouds in the tower palette: shade 2 crest, shade 1 underside.
const CLOUD_A = S(
  '......11111.........',
  '....112222211.......',
  '..1122222222211.....',
  '.112222222222211111.',
  '11222222222222222211',
  '11111111111111111111',
  '.111111111111111111.');
const CLOUD_B = S(
  '....1111......',
  '..11222211....',
  '.1122222221111',
  '11111111111111',
  '.111111111111.');
const CLOUD_C = S(
  '.........11111............',
  '.......112222211..........',
  '.....1122222222211........',
  '...11222222222222211111...',
  '..112222222222222222222111',
  '.1122222222222222222222211',
  '11111111111111111111111111',
  '.111111111111111111111111.');
export const BIRD: SpriteRows[] = [
  S('2.....2',
    '.2...2.',
    '..2.2..',
    '...2...'),
  S('.......',
    '...2...',
    '.22.22.',
    '2.....2'),
];

/** Each cloud: its rows, a phase offset, its height at camY 0, and how many
 *  frames per pixel of drift (bigger = slower). Heights sit between the
 *  words band (ends y 76) and the prompt floor (y 116) at the top of the
 *  climb, and parallax lifts them above the band at street level. */
export const CLOUDS: { rows: SpriteRows; x0: number; cy: number; slow: number }[] = [
  { rows: CLOUD_A, x0: 10, cy: 100, slow: 6 },
  { rows: CLOUD_B, x0: 120, cy: 84, slow: 8 },
  { rows: CLOUD_C, x0: 70, cy: 108, slow: 10 },
];

/** Parallax: the camera climbs 336 px over beat 2; the sky moves a quarter of that. */
export const PARALLAX = 4;
/** Map y of the roof line — tiles above it are sky right across the screen. */
export const ROOF_Y = 80;
/** The tower is columns 2–7 of a 10-wide map: sky either side of x 32..128. */
export const SKY_L = 32, SKY_R = 128;
/** The prompt floor (introUpdate) starts here; nothing in the sky draws below it. */
export const FLOOR_Y = 116;

/** Screen position of cloud `i` this frame: drifts right 1 px every `slow`
 *  frames, wrapping at W + its width, and rides a quarter of the camera. */
export function cloudAt(i: number, frame: number, camY: number): { x: number; y: number } {
  const c = CLOUDS[i];
  const w = c.rows[0].length;
  return { x: ((c.x0 + Math.floor(frame / c.slow)) % (W + w)) - w, y: c.cy - Math.floor(camY / PARALLAX) };
}

/** Rectangles that are sky on the tower map at this camY: the two side
 *  strips, plus everything above the roof once the climb brings it on screen. */
export function skyRects(camY: number): [number, number, number, number][] {
  const out: [number, number, number, number][] = [[0, 0, SKY_L, FLOOR_Y], [SKY_R, 0, W - SKY_R, FLOOR_Y]];
  const top = Math.min(FLOOR_Y, ROOF_Y - camY);
  if (top > 0) out.push([0, 0, W, top]);
  return out;
}

/** The birds' pass on the last tower card: from off the left edge at
 *  introT BIRD_T0, 3 px a frame, the second bird a wingspan behind and a
 *  little lower; wings flap every 8 frames. Null before they set off. */
export const BIRD_T0 = 70;
export function birdAt(introT: number): { x: number; y: number; frame: number }[] | null {
  if (introT < BIRD_T0) return null;
  const x = -8 + (introT - BIRD_T0) * 3;
  const frame = (introT >> 3) & 1;
  return [{ x, y: 8, frame }, { x: x - 12, y: 14, frame }];
}

/** Draw the sky over the tower backdrop. Call after worldDraw(), before the
 *  words band. `birds` is true only on the card where they cross. */
export function drawIntroSky(introT: number, camY: number, birds: boolean): void {
  const pal = BG_PAL.tower;
  ctx.save();
  ctx.beginPath();
  for (const [x, y, w, h] of skyRects(camY)) ctx.rect(x, y, w, h);
  ctx.clip();
  CLOUDS.forEach((c, i) => {
    const p = cloudAt(i, G.frame, camY);
    ctx.drawImage(decode(c.rows, pal), p.x, p.y);
  });
  ctx.restore();
  if (!birds) return;
  for (const b of birdAt(introT) ?? []) ctx.drawImage(decode(BIRD[b.frame], pal), b.x, b.y);
}
