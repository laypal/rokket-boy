// Injectable RNG. `Rng` matches Math.random's contract ([0,1)) so any
// consumer can take a seeded generator in tests and Math.random in the game.
export type Rng = () => number;

/** Mulberry32 — tiny seeded PRNG, deterministic per seed. */
export function mulberry32(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer roll in [a, z] inclusive, driven by the supplied rng. */
export function rollInt(a: number, z: number, rng: Rng): number {
  return a + Math.floor(rng() * (z - a + 1));
}
