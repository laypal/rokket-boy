// SIDE.3: the egg-hunt registry. STATUS and the mission card show
// n/EGG_TOTAL; every addEgg / egg / notEgg id in src must be one of these
// (tests/egg-lint), and every id must be granted somewhere. Order = the
// order they shipped (a future stash screen lists them this way). Renaming
// a shipped id orphans it in every live save — add, never rename.
export const EGG_IDS = [
  // CH1 (shipped 2026-07): two chatter eggs, the slots jackpot, the title code
  'motto', 'myowth', 'jackpot', 'konami',
  // SIDE.3 map secrets (2026-08-17): vault ×2, moon1, moon2, moonDig, hqDrill, bridge
  'vaultbrick', 'vaultwall', 'moonecho', 'deadend', 'emptychest', 'drillsign', 'swim',
  // SIDE.4: the GRUNTDEX clerk's completion egg
  'dexmaster',
] as const;
export type EggId = (typeof EGG_IDS)[number];
export const EGG_TOTAL: number = EGG_IDS.length; // 12

/** CH10.3's unlock condition (the post-game bonus fight). */
export function allEggsFound(eggs: Set<string>): boolean {
  return EGG_IDS.every((id) => eggs.has(id));
}
