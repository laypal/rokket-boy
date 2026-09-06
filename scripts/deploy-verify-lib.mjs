// DEP.2 — pure helpers for deploy-verify.mjs, unit-tested in
// tests/deploy-verify.test.ts. The build stamp is the `sha7 YYYY-MM-DD`
// literal Vite's define inlines from vite.config.ts buildStamp().

const STAMP = /\b([0-9a-f]{7}) \d{4}-\d{2}-\d{2}\b/;

/** The short SHA out of a served page, or null when the page carries none
 *  (an `unknown` build, a Coolify 503 page, a Traefik error). */
export function stampOf(html) {
  return STAMP.exec(html)?.[1] ?? null;
}

/** True when the page's stamp is the commit we're waiting for. */
export function isLive(html, sha) {
  const want = sha.trim().slice(0, 7);
  return want.length === 7 && stampOf(html) === want;
}
