#!/usr/bin/env node
// TOOL.2 — bounce SFX recipes and tracks to WAV for auditioning outside the game.
//   npm run sfx:preview                 → every sfx + one loop of every track
//   npm run sfx:preview -- keycard cave → just those ids (sfx or track names)
// Output: scratch/audio/<id>.wav and scratch/audio/track-<name>.wav (gitignored).
// Imports the game's own data modules — node ≥ 22.18 strips the types.
import { mkdirSync, writeFileSync } from 'node:fs';
import { SFX } from '../src/data/sfx.ts';
import { TRACKS } from '../src/data/music.ts';
import { renderSfx, renderTrack, wav } from './sfx-preview-lib.mjs';

const ids = process.argv.slice(2);
const want = ids.length ? ids : [...Object.keys(SFX), ...Object.keys(TRACKS)];
mkdirSync('scratch/audio', { recursive: true });
let bad = 0;
for (const id of want) {
  let out;
  if (SFX[id]) { out = `scratch/audio/${id}.wav`; writeFileSync(out, wav(renderSfx(SFX[id]))); }
  else if (TRACKS[id]) { out = `scratch/audio/track-${id}.wav`; writeFileSync(out, wav(renderTrack(TRACKS[id]))); }
  else { console.error(`unknown id "${id}" — sfx: ${Object.keys(SFX).join(' ')} · tracks: ${Object.keys(TRACKS).join(' ')}`); bad++; continue; }
  console.log(out);
}
process.exit(bad ? 1 : 0);
