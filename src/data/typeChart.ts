// The 9 simplified types (plan §4.1) and their effectiveness matrix.
// Gen-1-inspired, restricted to these 9, with three deliberate deviations so
// every attacking type bar NORMAL has a super-effective target and every
// defending type has a weakness (see decision journal):
//   POISON→WATER 2   — pollution; canon POISON has zero 2× targets here
//   FIRE→POISON 2    — flammable gas (the KOFFINK gag)
//   GHOST→PSYCHIC 2  — Gen 1's bugged 0× corrected to the intended value
export const TYPE_IDS = [
  'NORMAL', 'POISON', 'ELECTRIC', 'GHOST', 'FIGHTING',
  'GROUND', 'PSYCHIC', 'FIRE', 'WATER',
] as const;
export type TypeId = (typeof TYPE_IDS)[number];
export type Effectiveness = 0 | 0.5 | 1 | 2;

// Sparse: only non-neutral matchups listed; everything else is 1.
const CHART: Partial<Record<TypeId, Partial<Record<TypeId, Effectiveness>>>> = {
  NORMAL:   { GHOST: 0 },
  POISON:   { POISON: 0.5, GROUND: 0.5, GHOST: 0.5, WATER: 2 },
  ELECTRIC: { WATER: 2, ELECTRIC: 0.5, GROUND: 0 },
  GHOST:    { NORMAL: 0, GHOST: 2, PSYCHIC: 2 },
  FIGHTING: { NORMAL: 2, POISON: 0.5, PSYCHIC: 0.5, GHOST: 0 },
  GROUND:   { ELECTRIC: 2, POISON: 2, FIRE: 2 },
  PSYCHIC:  { FIGHTING: 2, POISON: 2, PSYCHIC: 0.5 },
  FIRE:     { POISON: 2, FIRE: 0.5, WATER: 0.5 },
  WATER:    { FIRE: 2, GROUND: 2, WATER: 0.5 },
};

/** Single-cell lookup: multiplier for `atk`-type damage on a `def`-type mon. */
export function typeMult(atk: TypeId, def: TypeId): Effectiveness {
  return CHART[atk]?.[def] ?? 1;
}

/** Combined multiplier against a (possibly dual-typed) defender. */
export function effectiveness(atk: TypeId, def: readonly TypeId[]): number {
  return def.reduce<number>((m, d) => m * typeMult(atk, d), 1);
}
