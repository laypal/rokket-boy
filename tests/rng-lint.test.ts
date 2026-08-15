// HRD.11: RNG hygiene lint. battleRng/encounterRng exist precisely so
// gameplay rolls are injectable/seedable under test — a stray Math.random()
// anywhere else in src/ would be a second, unseedable source of randomness
// that no test could pin or reproduce. This walks every src/ file and
// asserts the only call sites are the documented ones: the two `Rng`
// defaults (the injection point itself, replaced by setBattleRng/
// setEncounterRng before any gameplay roll happens) and audio.ts's
// white-noise buffer (cosmetic SFX, never gameplay-affecting).
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const REPO_ROOT = join(__dirname, '..');
const SRC_DIR = join(REPO_ROOT, 'src');

interface Hit {
  file: string; // posix-style, relative to repo root
  line: number;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith('.ts')) out.push(full);
  }
  return out;
}

/** Drop everything from the first `//` onward — comments that merely mention
 *  Math.random (there are several, documenting exactly this lint) must not
 *  count as a call site. */
function stripLineComment(line: string): string {
  const idx = line.indexOf('//');
  return idx === -1 ? line : line.slice(0, idx);
}

function findMathRandom(): Hit[] {
  const hits: Hit[] = [];
  for (const file of walk(SRC_DIR)) {
    const rel = relative(REPO_ROOT, file).split('\\').join('/');
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      // no trailing `(` required: battleRng/encounterRng assign the
      // function itself (`= Math.random`), they don't call it
      if (/Math\.random\b/.test(stripLineComment(line))) hits.push({ file: rel, line: i + 1 });
    });
  }
  return hits;
}

// The only sanctioned Math.random() call sites in src/, located by running
// this lint's walker over the tree at HRD.11 time and pinning exactly what
// it found — any new occurrence, moved occurrence, or removed default fails
// this test until the allowlist is updated on purpose.
const ALLOWED: Hit[] = [
  { file: 'src/engine/audio.ts', line: 30 }, // white-noise SFX buffer, cosmetic
  { file: 'src/systems/battle.ts', line: 30 }, // battleRng's injectable default
  { file: 'src/systems/encounter.ts', line: 41 }, // encounterRng's injectable default
];

describe('RNG hygiene lint (HRD.11)', () => {
  it('Math.random() appears only at the documented sites in src/', () => {
    const hits = findMathRandom()
      .map((h) => `${h.file}:${h.line}`)
      .sort();
    const allowed = ALLOWED.map((h) => `${h.file}:${h.line}`).sort();
    expect(hits, 'every Math.random() call in src/ must be one of the documented defaults').toEqual(allowed);
  });
});
