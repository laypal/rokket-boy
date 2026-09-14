#!/usr/bin/env node
// TOOL.1 — sprite round-trip CLI (docs/tasks/completed/39-art-audio-pipeline.md).
//   node scripts/sprite-io.mjs export MACHOPP_FRONT [--pal machopp]   (tiles: export T.WALL --pal hq)
//     → scratch/sprites/MACHOPP_FRONT.png (1×) + MACHOPP_FRONT@4x.png
//   node scripts/sprite-io.mjs import some.png --name MACHOPP_FRONT --pal machopp [--write]
//     → quantises to the 4 shades, validates, prints the S(...) block
//       (--write replaces the constant in chars.ts / tiles.ts in place)
// TOOL.3 — the Aseprite bridge (docs/tasks/45-aseprite-bridge.md):
//   node scripts/sprite-io.mjs ase MYOWTH_A MYOWTH_B [--pal myowth] [--out NAME] [--open] [--sheet]
//     → scratch/ase/NAME.aseprite — indexed, one frame per constant, each
//       frame tagged with its constant name; --open launches the editor on it;
//       --sheet also writes NAME@4x-sheet.png, every frame side by side (A/B)
//   node scripts/sprite-io.mjs ase-import scratch/ase/NAME.aseprite [--pal p] [--write]
//     → one PNG per frame, quantised back through `import` under the tag name
// Names: MACHOPP_FRONT · T.WALL · BODY_DARK.d0 · HEADS.grunt.d (nested paths).
// Palette defaults to the one mons.ts pairs with the constant (GRAVLR_* → geodood);
// charsets and tiles need --pal. `ASEPRITE` env overrides the exe path.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { basename, resolve } from 'node:path';
import { PNG } from 'pngjs';
import { formatSprite, paletteFor, parsePalette, parseSprite, pngToRows, replaceSprite, rowsToPng, toGpl, validateRows } from './sprite-io-lib.mjs';

const [cmd, ...rest] = process.argv.slice(2);
const flags = new Set(['--write', '--open', '--sheet']);
const opt = (k) => { const i = rest.indexOf(k); return i >= 0 ? rest[i + 1] : undefined; };
const positional = rest.filter((a, i) => !a.startsWith('--') && !(rest[i - 1]?.startsWith('--') && !flags.has(rest[i - 1])));
const usage = () => {
  console.error('usage: sprite-io export <CONST> [--pal p] | import <png> --name <CONST> [--pal p] [--write]\n' +
    '       sprite-io ase <CONST…> [--pal p] [--out NAME] [--open] | ase-import <file.aseprite> [--pal p] [--write]');
  process.exit(2);
};

const dataFileFor = (name) => (name.startsWith('T.') ? 'src/data/tiles.ts' : 'src/data/chars.ts');
const PALS = readFileSync('src/data/palettes.ts', 'utf8');
const MONS = readFileSync('src/data/mons.ts', 'utf8');
const palFor = (name) => parsePalette(PALS, opt('--pal') ?? paletteFor(MONS, name));

const ASEPRITE = process.env.ASEPRITE ?? 'C:/Program Files/Aseprite/Aseprite.exe';
function aseprite(args) {
  const r = spawnSync(ASEPRITE, ['-b', ...args], { encoding: 'utf8' });
  if (r.error || r.status !== 0) { console.error(r.error?.message ?? (r.stderr || r.stdout)); process.exit(1); }
  return r.stdout;
}

/** Quantise a PNG to NAME's rows; prints the block or writes it in place. */
function importPng(file, name) {
  const rows = pngToRows(PNG.sync.read(readFileSync(file)), palFor(name));
  const faults = validateRows(rows);
  if (faults.length) { console.error(`${name}:\n` + faults.join('\n')); process.exit(1); }
  if (rest.includes('--write')) {
    const dataFile = dataFileFor(name);
    writeFileSync(dataFile, replaceSprite(readFileSync(dataFile, 'utf8'), name, rows));
    console.log(`${dataFile}: ${name} replaced (${rows.length} rows)`);
  } else console.log(formatSprite(name, rows));
}

if (cmd === 'export' && positional[0]) {
  const name = positional[0];
  const rows = parseSprite(readFileSync(dataFileFor(name), 'utf8'), name);
  mkdirSync('scratch/sprites', { recursive: true });
  for (const scale of [1, 4]) {
    const out = `scratch/sprites/${name}${scale > 1 ? `@${scale}x` : ''}.png`;
    writeFileSync(out, rowsToPng(rows, palFor(name), scale));
    console.log(out);
  }
} else if (cmd === 'import' && positional[0] && opt('--name')) {
  importPng(positional[0], opt('--name'));
} else if (cmd === 'ase' && positional.length) {
  const names = positional;
  const out = opt('--out') ?? names[0].replace(/\./g, '_');
  const dir = resolve(`scratch/ase/${out}`);
  mkdirSync(dir, { recursive: true });
  const pal = palFor(names[0]);
  const pngs = names.map((name) => {
    const rows = parseSprite(readFileSync(dataFileFor(name), 'utf8'), name);
    const png = `${dir}/${name}.png`;
    writeFileSync(png, rowsToPng(rows, pal, 1));
    return png;
  });
  const gpl = `${dir}/${out}.gpl`;
  writeFileSync(gpl, toGpl(out, pal));
  const file = resolve(`scratch/ase/${out}.aseprite`);
  process.stdout.write(aseprite(['--script-param', `pngs=${pngs.join(';')}`, '--script-param', `names=${names.join(';')}`,
    '--script-param', `pal=${gpl}`, '--script-param', `out=${file}`, '--script', 'scripts/aseprite/build.lua']));
  if (rest.includes('--sheet')) { // ART.0 — every frame side by side at 4×, for an A/B by eye
    const sheet = resolve(`scratch/ase/${out}@4x-sheet.png`);
    aseprite([file, '--scale', '4', '--sheet-type', 'horizontal', '--sheet', sheet]);
    console.log(sheet);
  }
  if (rest.includes('--open')) spawn(ASEPRITE, [file], { detached: true, stdio: 'ignore' }).unref();
} else if (cmd === 'ase-import' && positional[0]) {
  const file = resolve(positional[0]);
  const dir = resolve(`scratch/ase/${basename(file, '.aseprite')}`);
  mkdirSync(dir, { recursive: true });
  const names = aseprite([file, '--script-param', `dir=${dir}`, '--script', 'scripts/aseprite/split.lua']).trim().split(/\r?\n/);
  for (const name of names) importPng(`${dir}/${name}.png`, name);
} else usage();
