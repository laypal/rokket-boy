// TOOL.2 — the offline WAV renderer. The lib is plain JS under scripts/
// (node runs it with no build step); the .d.mts beside it lets this suite
// import it under `tsc --noEmit`. It duplicates freq()/parse() and the
// envelope numbers from engine/audio.ts on purpose (node can't import that
// module) — the cross-checks here are what keep the two honest.
import { describe, expect, it } from 'vitest';
import { freq as engineFreq, parse as engineParse } from '../src/engine/audio';
import { SFX } from '../src/data/sfx';
import { TRACKS } from '../src/data/music';
import { DRUM_LEN, SR, freq, parse, renderSfx, renderTrack, wav } from '../scripts/sfx-preview-lib.mjs';

describe('wav()', () => {
  it('writes a valid 16-bit mono RIFF header for a 1-second sine', () => {
    const s = new Float32Array(SR);
    for (let i = 0; i < SR; i++) s[i] = Math.sin((2 * Math.PI * 440 * i) / SR);
    const b = wav(s);
    expect(b.length).toBe(44 + SR * 2);
    expect(b.toString('ascii', 0, 4)).toBe('RIFF');
    expect(b.readUInt32LE(4)).toBe(36 + SR * 2);
    expect(b.toString('ascii', 8, 12)).toBe('WAVE');
    expect(b.toString('ascii', 12, 16)).toBe('fmt ');
    expect(b.readUInt16LE(20)).toBe(1); // PCM
    expect(b.readUInt16LE(22)).toBe(1); // mono
    expect(b.readUInt32LE(24)).toBe(SR);
    expect(b.readUInt32LE(28)).toBe(SR * 2); // byte rate
    expect(b.readUInt16LE(34)).toBe(16); // bits
    expect(b.toString('ascii', 36, 40)).toBe('data');
    expect(b.readUInt32LE(40)).toBe(SR * 2);
    expect(b.readInt16LE(44 + Math.round(SR / 440 / 4) * 2)).toBeGreaterThan(30000); // quarter cycle ≈ +1
  });
});

describe('the mirror stays honest with engine/audio.ts', () => {
  it('freq() and parse() agree with the engine', () => {
    for (const tok of ['A4', 'C4', 'F#3', 'G#5', '-', '=', 'H2']) expect(freq(tok)).toBe(engineFreq(tok));
    expect(parse('  A3\n  B3\tC4 ')).toEqual(engineParse('  A3\n  B3\tC4 '));
  });
});

describe('renderSfx()', () => {
  it('renders every registered recipe as non-silent audio within [-1, 1]', () => {
    for (const [id, steps] of Object.entries(SFX)) {
      const s = renderSfx(steps);
      let peak = 0;
      for (const v of s) peak = Math.max(peak, Math.abs(v));
      expect(peak, id).toBeGreaterThan(0.01);
      expect(peak, id).toBeLessThanOrEqual(1);
    }
  });
  it('sizes the buffer to the last note (+20 ms stop, +50 ms tail) or the last drum', () => {
    expect(renderSfx(SFX.blip).length).toBe(Math.round((0.03 + 0.02 + 0.05) * SR));
    expect(renderSfx([[0.1, 'k']]).length).toBe(Math.round((0.1 + DRUM_LEN.k + 0.05) * SR));
  });
  it('is deterministic (seeded noise)', () => {
    expect(renderSfx(SFX.hit)).toEqual(renderSfx(SFX.hit));
  });
});

describe('renderTrack()', () => {
  it('bounces one loop of a shipped track: 64 eighth notes at its bpm + 0.5 s', () => {
    const tr = TRACKS.title;
    const s = renderTrack(tr);
    expect(s.length).toBe(Math.round((64 * (30 / tr.bpm) + 0.5) * SR));
    let peak = 0;
    for (const v of s) peak = Math.max(peak, Math.abs(v));
    expect(peak).toBeGreaterThan(0.05);
  });
});
