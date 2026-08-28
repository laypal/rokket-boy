// Rename dist/index.html → dist/team-rokket.html (the distributable artifact)
// and enforce the HRD.6 size ceiling so the single file can't silently balloon.
import { renameSync, existsSync, rmSync, statSync } from 'node:fs';
import { checkArtifactSize, SIZE_LIMIT_BYTES } from './postbuild-lib.mjs';

const src = 'dist/index.html';
const out = 'dist/team-rokket.html';
if (existsSync(out)) rmSync(out);
renameSync(src, out);
// PKG.3: public/sw.d.ts is the tsc twin for tests/sw.test.ts, not a deploy
// asset — Vite copies public/ wholesale, so drop it here.
rmSync('dist/sw.d.ts', { force: true });

const bytes = statSync(out).size;
const err = checkArtifactSize(bytes, SIZE_LIMIT_BYTES);
if (err) {
  console.error(err);
  process.exit(1);
}
console.log('build artifact: ' + out + ' (' + bytes + ' bytes)');
