// DEP.2 — the stamp parser behind scripts/deploy-verify.mjs. The workflow
// itself is proven by its first real run (linked from the card's close note).
import { describe, expect, it } from 'vitest';
import { isLive, stampOf } from '../scripts/deploy-verify-lib.mjs';

const page = (stamp: string) =>
  `<!DOCTYPE html><html><script>var a="x";text(typeof b!=="undefined"?"${stamp}":"dev",2,133)</script></html>`;

describe('deploy-verify stamp parser', () => {
  it('reads the sha7 out of an inlined build stamp', () => {
    expect(stampOf(page('f0f6307 2026-09-06'))).toBe('f0f6307');
  });

  it('returns null for an unknown build, an error page, or no page', () => {
    expect(stampOf(page('unknown'))).toBeNull();
    expect(stampOf('<h1>503 Service Unavailable</h1>')).toBeNull();
    expect(stampOf('')).toBeNull();
  });

  it('does not mistake a date-free hex run or a hex-free date for a stamp', () => {
    expect(stampOf('deadbee and then 2026-09-06 elsewhere')).toBeNull();
    expect(stampOf('sha 0123456789abcdef 2026-09-06')).toBeNull();
  });

  it('matches a full or short sha against the served stamp', () => {
    const html = page('f0f6307 2026-09-06');
    expect(isLive(html, 'f0f6307e244d59da2bd32f47ad2018cf486350fd')).toBe(true);
    expect(isLive(html, 'f0f6307')).toBe(true);
    expect(isLive(html, '3f0008e')).toBe(false);
    expect(isLive(html, '')).toBe(false);
  });
});
