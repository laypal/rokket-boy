// MAIN LOOP — fixed-step dispatch at display rate (target 60fps).
// States register a per-frame handler; main.ts wires the combinations.
import { G, type StateName } from '../state';
import { drawFade, rect, text, W } from './renderer';
import { Input } from './input';
import { recordError, toastLines } from './diagnostics';

const handlers: Partial<Record<StateName, () => void>> = {};

export function registerState(name: StateName, fn: () => void): void {
  handlers[name] = fn;
}

const UNTIMED = new Set<StateName>(['boot', 'title', 'intro']);

// Error-recording seam (HRD.1). Default sink is HRD.3's diagnostics ring —
// recordError keeps console.error in dev and stores context for
// __rokket.report() in the field. Tests swap the sink; null restores it.
let errorSink: (err: unknown) => void = recordError;

export function setErrorSink(fn: ((err: unknown) => void) | null): void {
  errorSink = fn ?? recordError;
}

/** The per-frame body, extracted so it's callable (and testable in Node)
 *  without requestAnimationFrame. One throw here must never kill the loop:
 *  the state-update/draw is wrapped, and Input.endFrame() + the next rAF
 *  schedule always run via `finally` — skipping endFrame on a throw would
 *  leave key-edge state stuck (flagged assumption, .paul/PLAN.md). */
export function runFrame(): void {
  G.frame++;
  if (!UNTIMED.has(G.state)) G.playSeconds += 1 / 60; // §4.6 play clock
  try {
    handlers[G.state]?.();
    drawFade();
  } catch (err) {
    errorSink(err);
  } finally {
    drawErrorToast();
    Input.endFrame();
  }
}

/** HRD.1-FB: the visible GLITCH toast (D4 trade-off — prod crashes are
 *  report-by-screenshot, so the screenshot must carry the build + message).
 *  Drawn in the finally so it lands on top of the frame in every state and
 *  never consumes input. */
let toastDrawFailed = false;
function drawErrorToast(): void {
  const lines = toastLines();
  if (!lines) return;
  try {
    rect(0, 0, W, 16, '#000');
    text(lines[0], 2, 0, '#f8f8f8');
    text(lines[1], 2, 8, '#f8f8f8');
  } catch (err) {
    // Latched: if the renderer itself is broken this would re-throw at
    // 60 fps, and re-recording every frame would evict the ORIGINAL error
    // from the 20-entry ring. One record, then quiet.
    if (!toastDrawFailed) {
      toastDrawFailed = true;
      recordError(err);
    }
  }
}

function frame(): void {
  try {
    runFrame();
  } finally {
    requestAnimationFrame(frame);
  }
}

export function startLoop(): void {
  requestAnimationFrame(frame);
}
