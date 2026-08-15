// Field diagnostics (HRD.3): before this module the game had zero error
// capture — no window.onerror, no version stamp, and __debug is dev-only, so
// a field bug produced no evidence. A fixed-size ring keeps the last RING_CAP
// errors with game-state context; report() bundles them with the build stamp
// and the exact save blob. Engine-free on purpose (state + save only — no
// renderer/world imports) so it unit-tests in Node. Captures nothing beyond
// the player's own local game state — no UA strings, no wall-clock
// timestamps, nothing network (HRD.3 don't).
import { G } from '../state';
import { snapshot, type SaveV3 } from '../systems/save';

export const RING_CAP = 20;

/** HRD.1-FB: how long the GLITCH toast stays up (~10 s at 60 fps) — long
 *  enough to screenshot, re-armed by each new error. */
export const TOAST_FRAMES = 600;

export interface ErrorEntry {
  message: string;
  stack?: string;
  frame: number;
  state: string;
  mapId: string;
}

export interface DiagnosticsReport {
  build: string;
  errors: ErrorEntry[];
  state: string;
  frame: number;
  save: SaveV3;
}

// `define`-injected in real builds; the typeof guard keeps plain-Node
// consumers (tests without the vite pipeline) working.
const BUILD = typeof __BUILD__ !== 'undefined' ? __BUILD__ : 'dev';

const ring: ErrorEntry[] = [];
let lastErrorAt: number | null = null;
let lastErrorMsg = '';

/** Record an error with the game context needed to reproduce it. Also the
 *  frame-loop's default sink (loop.ts). Console output stays dev-only —
 *  the ring IS the record in the field. */
export function recordError(err: unknown): void {
  if (import.meta.env.DEV) console.error(err);
  const message = err instanceof Error ? err.message : String(err);
  ring.push({
    message,
    stack: err instanceof Error ? err.stack : undefined,
    frame: G.frame,
    state: G.state,
    mapId: G.map.id,
  });
  if (ring.length > RING_CAP) ring.shift();
  lastErrorAt = G.frame;
  lastErrorMsg = message;
}

/** Test hook — the ring is module-level state. */
export function clearErrors(): void {
  ring.length = 0;
  lastErrorAt = null;
  lastErrorMsg = '';
}

/** HRD.1-FB: content + timing of the visible GLITCH toast — prod has no
 *  report surface (D4), so a crash is report-by-screenshot and the
 *  screenshot must carry evidence: the build sha and the start of the
 *  message. Pure so it tests in Node; the loop draws it. Line budget is
 *  20 chars (160 px ÷ 8 px glyphs); the bitmap font is caps-only. */
export function toastLines(): [string, string] | null {
  if (lastErrorAt === null || G.frame - lastErrorAt > TOAST_FRAMES) return null;
  return [`GLITCH! ${BUILD.split(' ')[0]}`, lastErrorMsg.toUpperCase().slice(0, 20)];
}

/** Copyable field bug report: build, recent errors, where the game is, and
 *  the save blob (snapshot() is exactly the persisted shape). Fresh copies
 *  every call — mutating a report never touches the ring. */
export function report(): DiagnosticsReport {
  return {
    build: BUILD,
    errors: ring.map((e) => ({ ...e })),
    state: G.state,
    frame: G.frame,
    save: snapshot(),
  };
}

/** Catch what the frame-loop guard can't: errors outside the loop and
 *  unhandled promise rejections. */
export function install(): void {
  window.addEventListener('error', (e) => recordError(e.error ?? e.message));
  window.addEventListener('unhandledrejection', (e) => recordError(e.reason));
}

/** The read-only staging surface (D4): main.ts attaches this as
 *  window.__rokket when __STAGING__ — never in prod, never a mutator. */
export const rokketApi = Object.freeze({ report });
