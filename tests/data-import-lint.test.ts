// HRD.16: data is a leaf. `src/data/**` holds registries and pixel/track
// strings — types in, data out — and `src/systems/*` / `src/engine/*` read
// them, never the reverse. That direction is what keeps content authorable
// without dragging runtime modules into the import graph (and what let
// HRD.12 break the items↔battle cycle by moving BALL_ITEM into data). This
// walks every src/data file and fails on any import that reaches into
// systems/ or engine/, so the rule CONTRIBUTING.md states stays true.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const REPO_ROOT = join(__dirname, '..');
const DATA_DIR = join(REPO_ROOT, 'src', 'data');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith('.ts')) out.push(full);
  }
  return out;
}

// Matches the module specifier of every static import/re-export, including
// multi-line `import { … } from '…'` forms.
const SPECIFIER = /\bfrom\s+['"]([^'"]+)['"]/g;
const FORBIDDEN = /(^|\/)(systems|engine)(\/|$)/;

describe('data-import lint (src/data is a leaf)', () => {
  it('no src/data module imports from systems/ or engine/', () => {
    const offenders: string[] = [];
    for (const file of walk(DATA_DIR)) {
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(SPECIFIER)) {
        const spec = m[1];
        if (FORBIDDEN.test(spec)) {
          offenders.push(`${relative(REPO_ROOT, file).replace(/\\/g, '/')} → '${spec}'`);
        }
      }
    }
    expect(offenders, `src/data must not import runtime modules:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('walks a non-empty data tree (guards against a silently-passing empty walk)', () => {
    expect(walk(DATA_DIR).length).toBeGreaterThan(10);
  });
});
