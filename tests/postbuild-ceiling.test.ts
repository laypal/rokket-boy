// HRD.6 — the postbuild size ceiling is a pure check so a fixture over the
// limit can fail without running a real build.
import { describe, expect, it } from 'vitest';
import { checkArtifactSize, SIZE_LIMIT_BYTES } from '../scripts/postbuild-lib.mjs';

describe('postbuild size ceiling', () => {
  it('pins the AUD.2 ceiling at 400 KB', () => {
    expect(SIZE_LIMIT_BYTES).toBe(400 * 1024);
  });

  it('passes an artifact under the limit', () => {
    expect(checkArtifactSize(130_000, SIZE_LIMIT_BYTES)).toBeNull();
  });

  it('passes an artifact exactly at the limit', () => {
    expect(checkArtifactSize(SIZE_LIMIT_BYTES, SIZE_LIMIT_BYTES)).toBeNull();
  });

  it('fails an artifact one byte over the limit', () => {
    const err = checkArtifactSize(SIZE_LIMIT_BYTES + 1, SIZE_LIMIT_BYTES);
    expect(err).not.toBeNull();
  });

  it('names both sizes in the failure message so the CI log is actionable', () => {
    const err = checkArtifactSize(500 * 1024, SIZE_LIMIT_BYTES);
    expect(err).toContain('512000');
    expect(err).toContain('409600');
  });
});
