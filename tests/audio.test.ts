import { describe, it, expect } from 'vitest';
import { parse, freq } from '../src/engine/audio';
import { TRACKS } from '../src/data/music';

describe('sequencer parse()', () => {
  it('splits tokens on any whitespace including newlines', () => {
    expect(parse('E4 =  -  G4')).toEqual(['E4', '=', '-', 'G4']);
    expect(parse('  A3\n  B3\tC4 ')).toEqual(['A3', 'B3', 'C4']);
  });

  it('parses every shipped track without empty tokens', () => {
    for (const [name, tr] of Object.entries(TRACKS)) {
      for (const ch of ['p1', 'p2', 'tri'] as const) {
        const src = tr[ch];
        if (!src) continue;
        const toks = parse(src);
        expect(toks.length, `${name}.${ch}`).toBeGreaterThan(0);
        for (const t of toks) {
          expect(t === '-' || t === '=' || freq(t) > 0, `${name}.${ch} token '${t}'`).toBe(true);
        }
      }
    }
  });
});

describe('freq()', () => {
  it('A4 is concert pitch', () => {
    expect(freq('A4')).toBeCloseTo(440, 6);
  });
  it('C4 is middle C', () => {
    expect(freq('C4')).toBeCloseTo(261.63, 1);
  });
  it('octaves double', () => {
    expect(freq('A5') / freq('A4')).toBeCloseTo(2, 6);
  });
  it('invalid tokens return 0', () => {
    expect(freq('-')).toBe(0);
    expect(freq('=')).toBe(0);
    expect(freq('H2')).toBe(0);
  });
});
