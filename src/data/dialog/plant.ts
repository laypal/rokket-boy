// KANTOO POWER PLANT — shared script helpers (CH7.0 §3). A mine is `step:`
// data: stepping on a cell that is secretly VOLTORBB starts encounter
// `plant_mineN`; the encounter's own onWin spends var `mineN` (a catch runs
// onWin too), so a flee or whiteout leaves it armed (Lyall, 2026-09-09).
// `vars` is saved — a spent mine stays spent across reload, no enter repair.
import type { ScriptStep } from '../../types';

export function mine(n: number): ScriptStep[] {
  return [
    { if: { varEq: ['mine' + n, 1] }, then: [], else: [{ battle: 'plant_mine' + n }] },
  ];
}
