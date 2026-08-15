// Rename dist/index.html → dist/team-rokket.html (the distributable artifact)
// and enforce the HRD.6 size ceiling so the single file can't silently balloon.
import { renameSync, existsSync, rmSync, statSync } from 'node:fs';
import { checkArtifactSize, SIZE_LIMIT_BYTES } from './postbuild-lib.mjs';

const src = 'dist/index.html';
const out = 'dist/team-rokket.html';
if (existsSync(out)) rmSync(out);
renameSync(src, out);

const bytes = statSync(out).size;
const err = checkArtifactSize(bytes, SIZE_LIMIT_BYTES);
if (err) {
  console.error(err);
  process.exit(1);
}
console.log('build artifact: ' + out + ' (' + bytes + ' bytes)');
