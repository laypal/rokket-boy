// ONB.2/FLW.5 — the { tour } guided camera: pans the world draw centre stop
// to stop over the live map (G.cutscene targets, the ONB.8 camera; cameraFor
// clamps at draw time), holds each stop under a text band, and always
// returns to the player before the script resumes. A advances, B/START
// exits the whole sequence — never trap a player who has seen it. Module
// state only, never saved: a reload mid-tour lands a normal world frame
// (the one-shot flag was set before the tour started).
import { G } from '../state';
import type { TourStop } from '../types';
import { BG_PAL } from '../data/palettes';
import { rect, textC, W, H, TILE } from '../engine/renderer';
import { cameraFor } from './camera';
import { Input } from '../engine/input';
import { Audio2 } from '../engine/audio';

/** Camera-target px per frame, per axis. 3px ≈ a brisk two-second cross of
 *  a full screen — quicker than the cold open's drifts, slower than a cut. */
export const TOUR_PAN_SPEED = 3;

type Phase = 'pan' | 'hold' | 'return';
interface TourState {
  stops: TourStop[];
  i: number;
  phase: Phase;
  camX: number;
  camY: number;
  done: () => void;
}
let st: TourState | null = null;

function playerPx(): [number, number] {
  return [G.player.x * TILE, G.player.y * TILE];
}

/** ScriptHooks.tour entry. Empty stops resolve immediately — the
 *  missing-npcRun rule: stale data must never freeze the game. */
export function startTour(stops: TourStop[], done: () => void): void {
  if (stops.length === 0) {
    done();
    return;
  }
  const [px, py] = playerPx();
  st = { stops, i: 0, phase: 'pan', camX: px, camY: py, done };
}

export function tourActive(): boolean {
  return st !== null;
}

/** Test-only reset (the clearMapGuardRuntime precedent): module state must
 *  not leak between specs. Also hands the camera back. */
export function resetTour(): void {
  st = null;
  G.cutscene = null;
}

/** Move one axis toward a target, clamping overshoot. */
function toward(v: number, t: number): number {
  return v < t ? Math.min(v + TOUR_PAN_SPEED, t) : Math.max(v - TOUR_PAN_SPEED, t);
}

/** Tick. Returns true while the tour owns the frame — player input,
 *  movement, warps and guards all wait (the npcRunTick contract). */
export function tourTick(): boolean {
  const s = st;
  if (!s) return false;
  // B/START at ANY point (pan or hold) drops the rest and goes home.
  if (s.phase !== 'return' && (Input.hit('b') || Input.hit('start'))) {
    Audio2.sfx('beep');
    s.phase = 'return';
  } else if (s.phase === 'pan') {
    const [tx, ty] = s.stops[s.i].cam;
    s.camX = toward(s.camX, tx);
    s.camY = toward(s.camY, ty);
    if (s.camX === tx && s.camY === ty) s.phase = 'hold';
  } else if (s.phase === 'hold' && Input.hit('a')) {
    Audio2.sfx('beep');
    if (s.i + 1 < s.stops.length) {
      s.i++;
      s.phase = 'pan';
    } else {
      s.phase = 'return';
    }
  }
  if (s.phase === 'return') {
    const [px, py] = playerPx();
    s.camX = toward(s.camX, px);
    s.camY = toward(s.camY, py);
    if (s.camX === px && s.camY === py) {
      st = null;
      G.cutscene = null;
      s.done();
      return true;
    }
  }
  G.cutscene = { camX: s.camX, camY: s.camY, hidePlayer: false };
  return true;
}

/** Band + prompt while a stop holds (worldDraw tail). Night palette floor,
 *  the ONB.8 rule: words need a floor before any backdrop can carry them.
 *  Bottom-anchored so the centred stop stays clear — EXCEPT when the map
 *  edge clamps the camera and the target lands in the band's own rows (the
 *  market vendor, two tiles off HQ's south edge, vanished behind the band
 *  exactly this way in the playtest): if the clamped target's sprite would
 *  reach the bottom band, the whole band flips to the top instead. The
 *  band must never cover the thing it names. */
export function tourDraw(): void {
  const s = st;
  if (!s || s.phase !== 'hold') return;
  const night = BG_PAL.night;
  const stop = s.stops[s.i];
  const bandH = stop.lines.length * 14 + 6;
  const bandTop = H - bandH - 12;
  const [, camY] = cameraFor(G.map, s.camX, s.camY);
  // sprite bottom = target screen y + 12 (drawn at -4, 16px tall)
  const y0 = stop.cam[1] - camY + 12 > bandTop ? 0 : bandTop;
  rect(0, y0, W, bandH + 12, night[0]);
  stop.lines.forEach((l, i) => textC(l, y0 + 6 + i * 14, night[3]));
  textC('A: NEXT  B: SKIP', y0 + bandH + 2, night[2]);
}
