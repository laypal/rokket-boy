// HRD.6 — pure size-ceiling check, unit-tested in tests/postbuild-ceiling.test.ts.
// AUD.2 ceiling: the single-file build must never silently balloon past 400 KB.
export const SIZE_LIMIT_BYTES = 400 * 1024;

/**
 * @param {number} bytes actual artifact size
 * @param {number} limitBytes ceiling
 * @returns {string | null} failure message, or null when within the ceiling
 */
export function checkArtifactSize(bytes, limitBytes) {
  if (bytes <= limitBytes) return null;
  return `build artifact is ${bytes} bytes — over the ${limitBytes}-byte ceiling (AUD.2). ` +
    'Either the build ballooned by accident, or the ceiling needs a deliberate card to raise it.';
}
