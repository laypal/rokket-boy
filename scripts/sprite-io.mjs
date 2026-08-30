#!/usr/bin/env node
// TOOL.1 — sprite round-trip CLI (docs/tasks/39-art-audio-pipeline.md).
//   node scripts/sprite-io.mjs export MACHOPP_FRONT [--pal machopp]   (tiles: export T.WALL --pal hq)
//     → scratch/sprites/MACHOPP_FRONT.png (1×) + MACHOPP_FRONT@4x.png
//   node scripts/sprite-io.mjs import some.png --name MACHOPP_FRONT --pal machopp [--write]
//     → quantises to the 4 shades, validates, prints the S(...) block
//       (--write replaces the constant in chars.ts / tiles.ts in place)
// Palette defaults to the one mons.ts pairs with the constant (GRAVLR_* → geodood).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { formatSprite, paletteFor, parsePalette, parseSprite, pngToRows, replaceSprite, rowsToPng, validateRows } from './sprite-io-lib.mjs';

const [cmd, target, ...rest] = process.argv.slice(2);
const opt = (k) => { const i = rest.indexOf(k); return i >= 0 ? rest[i + 1] : undefined; };
const name = cmd === 'export' ? target : opt('--name');
if (!['export', 'import'].includes(cmd) || !name) {
  console.error('usage: sprite-io export <CONST> [--pal <name>] | import <png> --name <CONST> [--pal <name>] [--write]');
  process.exit(2);
}
const dataFile = name.startsWith('T.') ? 'src/data/tiles.ts' : 'src/data/chars.ts'; // tiles: `T.WALL`, --pal required
const src = readFileSync(dataFile, 'utf8');
const palName = opt('--pal') ?? paletteFor(readFileSync('src/data/mons.ts', 'utf8'), name);
const pal = parsePalette(readFileSync('src/data/palettes.ts', 'utf8'), palName);

if (cmd === 'export') {
  const rows = parseSprite(src, name);
  mkdirSync('scratch/sprites', { recursive: true });
  for (const scale of [1, 4]) {
    const out = `scratch/sprites/${name}${scale > 1 ? `@${scale}x` : ''}.png`;
    writeFileSync(out, rowsToPng(rows, pal, scale));
    console.log(out);
  }
} else {
  const rows = pngToRows(PNG.sync.read(readFileSync(target)), pal);
  const faults = validateRows(rows);
  if (faults.length) { console.error(faults.join('\n')); process.exit(1); }
  if (rest.includes('--write')) {
    writeFileSync(dataFile, replaceSprite(src, name, rows));
    console.log(`${dataFile}: ${name} replaced (${rows.length} rows)`);
  } else console.log(formatSprite(name, rows));
}
