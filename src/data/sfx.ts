// SFX — every sound effect as data (TOOL.2, 2026-09-04). `engine/audio.ts`
// plays a recipe through its real oscillators; `scripts/sfx-preview.mjs`
// renders the same recipe to a WAV so a sound can be auditioned without
// booting the game, and `script-ref-lint` reads the ids straight from here
// instead of mirroring a switch by hand. Adding a sound = adding a key.
//
// A step is a note `[at, hz, dur, vol, duty]` — `at` in seconds from the
// trigger, duty 0 = triangle, otherwise a pulse of that duty (0.5 square,
// 0.25 thin) — or a drum `[at, kind]` with `k` kick, `s` snare, `h` hat.
// This module must stay import-free and erasable TS: node runs it directly
// (type stripping) for the preview script.
export type SfxStep =
  | readonly [number, number, number, number, number]
  | readonly [number, 'k' | 's' | 'h'];

const seq = (n: number, f: (i: number) => SfxStep[]): SfxStep[] =>
  Array.from({ length: n }, (_, i) => f(i)).flat();

export const SFX: Record<string, readonly SfxStep[]> = {
  blip: [[0, 1046, 0.03, 0.12, 0.5]],
  beep: [[0, 784, 0.05, 0.2, 0.25]],
  confirm: [[0, 660, 0.06, 0.22, 0.5], [0.06, 990, 0.08, 0.22, 0.5]],
  cancel: [[0, 440, 0.06, 0.2, 0.5], [0.05, 330, 0.08, 0.18, 0.5]],
  bump: [[0, 90, 0.08, 0.6, 0]],
  door: [[0, 262, 0.07, 0.2, 0.25], [0.07, 392, 0.1, 0.2, 0.25]],
  stairs: seq(4, (i) => [[i * 0.05, 523 - i * 90, 0.05, 0.16, 0.25]]),
  hit: [[0, 's'], [0, 180, 0.1, 0.3, 0.5]],
  hurt: [[0, 220, 0.08, 0.28, 0.5], [0.08, 165, 0.12, 0.26, 0.5]],
  coin: [[0, 1319, 0.05, 0.2, 0.5], [0.06, 1760, 0.14, 0.2, 0.5]],
  switch: [[0, 523, 0.04, 0.2, 0.25], [0.05, 523, 0.04, 0.2, 0.25]],
  // CH4.1 disguise on/off — a quick rising zip (plan §7 SFX list)
  disguise: [[0, 392, 0.05, 0.18, 0.25], [0.05, 523, 0.05, 0.18, 0.25], [0.1, 784, 0.1, 0.18, 0.25]],
  alarm: seq(3, (i) => [[i * 0.16, 880, 0.08, 0.26, 0.5], [i * 0.16 + 0.08, 660, 0.08, 0.26, 0.5]]),
  item: [523, 659, 784, 1047].map((f, i): SfxStep => [i * 0.09, f, i === 3 ? 0.3 : 0.09, 0.24, 0.5]),
  faint: seq(5, (i) => [[i * 0.06, 440 - i * 70, 0.06, 0.24, 0.5]]),
  // UX2.4: rises with the silhouette ramp — 16 notes over ~3.9s, pitch
  // climbing and gaps shrinking to match EVO_FLIPS, then a held chord
  // landing in the whiteout window (3.75-4.08s when fired at cinematic
  // frame 0, which resolveEvolve does). Scheduled ahead in one call;
  // nothing polls it.
  evolve: (() => {
    const base = [262, 294, 330, 349, 392, 440, 494, 523, 587, 659, 698, 784, 880, 988, 1047, 1175];
    const out: SfxStep[] = [];
    let at = 0;
    base.forEach((f, i) => {
      out.push([at, f, 0.12, 0.18, 0.5]);
      at += 0.4 - (0.4 - 0.09) * (i / (base.length - 1));
    });
    out.push([at, 1319, 0.5, 0.26, 0.5], [at, 659, 0.5, 0.3, 0]);
    return out;
  })(),
  // CH6-FB.2: the card reader — two rising notes then a soft click, a
  // different shape from `switch` (one pitch twice) and `door` (low, slow).
  keycard: [[0, 659, 0.04, 0.2, 0.5], [0.05, 988, 0.05, 0.2, 0.5], [0.14, 'h']],
  // F38 JCE.1 — overworld juice, nine new moments.
  // A posted guard's `!` — sharp startle, not `alarm`'s repeating two-tone.
  spotted: [[0, 'h'], [0, 1568, 0.04, 0.28, 0.5], [0.04, 220, 0.1, 0.22, 0.5]],
  // SAVE menu confirm — settled triangle rise, calmer/lower than `item`.
  save: [[0, 392, 0.07, 0.2, 0], [0.07, 494, 0.07, 0.2, 0], [0.14, 587, 0.12, 0.22, 0]],
  // Level-up flourish — thin-pulse arpeggio with a skip, shorter than `evolve`.
  levelup: [[0, 349, 0.06, 0.2, 0.25], [0.06, 523, 0.06, 0.22, 0.25], [0.12, 698, 0.06, 0.22, 0.25], [0.18, 932, 0.12, 0.26, 0.25]],
  // "Gotcha!" — descending clinch landing on a kick.
  catch: [[0, 880, 0.05, 0.22, 0.5], [0.05, 659, 0.06, 0.22, 0.5], [0.11, 440, 0.09, 0.24, 0.5], [0.11, 'k']],
  // NPC vanish — hat/snare puff over a quick low triangle drop, airy.
  poof: [[0, 'h'], [0.02, 's'], [0.03, 220, 0.05, 0.16, 0], [0.08, 110, 0.07, 0.14, 0]],
  // HQ/CH6 heal pad — soft ascending triangle chime, gentle not fanfare.
  heal: [[0, 392, 0.08, 0.14, 0], [0.08, 494, 0.08, 0.16, 0], [0.16, 587, 0.08, 0.18, 0], [0.24, 784, 0.16, 0.2, 0]],
  // Lift pad warp — mirrors `stairs` but rising.
  pad: seq(5, (i) => [[i * 0.04, 220 + i * 90, 0.05, 0.16, 0.25]]),
  // Chest lid click — hat plus two short low-mid pulses.
  unlock: [[0, 'h'], [0.01, 330, 0.04, 0.2, 0.5], [0.05, 262, 0.06, 0.18, 0.5]],
  // Floor item pickup — two thin plinks, lighter than `coin`.
  pickup: [[0, 988, 0.04, 0.16, 0.25], [0.04, 1319, 0.05, 0.16, 0.25]],
};
