// CH4 playtest fix: generated battle lines that carry a trainer name wrap at
// the box's 17-glyph cap instead of relying on a hand-split that only fit
// the names it was written around. The playtester caught "...SECURITY
// CHIEF i" clipped mid-word on LEG IT; the same template shape sat under
// "<TRAINER> sent out".
import { describe, it, expect } from 'vitest';
import { wrapWords } from '../src/systems/battle';

describe('wrapWords (battle message cap)', () => {
  it('keeps every line at or under 17 glyphs and never splits a word', () => {
    for (const text of [
      '...SECURITY CHIEF is still there.',
      'SECURITY CHIEF sent out RATIKATE!',
      '...GUARD is still there.',
      'GUARD sent out VOLTORBB!',
      'AGENT KIRA sent out ARBOK!',
    ]) {
      const lines = wrapWords(text);
      for (const l of lines) expect(l.length, `${text} -> "${l}"`).toBeLessThanOrEqual(17);
      expect(lines.join(' ')).toBe(text);
    }
  });

  it('the chief, the case that clipped', () => {
    expect(wrapWords('...SECURITY CHIEF is still there.')).toEqual(['...SECURITY CHIEF', 'is still there.']);
    expect(wrapWords('SECURITY CHIEF sent out RATIKATE!')).toEqual(['SECURITY CHIEF', 'sent out', 'RATIKATE!']);
  });

  it('short names keep the shipped shape for "sent out" (zero-diff for GUARD)', () => {
    expect(wrapWords('GUARD sent out VOLTORBB!')).toEqual(['GUARD sent out', 'VOLTORBB!']);
  });

  it('a single over-long word is emitted as its own line rather than dropped', () => {
    expect(wrapWords('ABCDEFGHIJKLMNOPQRSTU x')).toEqual(['ABCDEFGHIJKLMNOPQRSTU', 'x']);
  });
});
