// PKG.2: the PWA surface — manifest fields, icon bytes regenerated from the
// live emblem art (favicon.test.ts's pattern), index.html head tags.
// `UPDATE_ICONS=1 npx vitest run tests/pwa.test.ts` rewrites public/icon-*.png
// from the art; a plain run asserts the committed files match byte-for-byte.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { T } from '../src/data/tiles';
import { BG_PAL } from '../src/data/palettes';
import { composeEmblem } from '../scripts/favicon-lib.mjs';
import { encodePng, renderIcon } from '../scripts/icon-lib.mjs';

const REPO_ROOT = join(__dirname, '..');
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function ihdr(png: Buffer): { width: number; height: number } {
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

/** first IDAT payload, inflated — enough to check the raw scanlines */
function scanlines(png: Buffer): Buffer {
  let off = 8;
  while (off < png.length) {
    const len = png.readUInt32BE(off);
    const type = png.toString('latin1', off + 4, off + 8);
    if (type === 'IDAT') return inflateSync(png.subarray(off + 8, off + 8 + len));
    off += 12 + len;
  }
  throw new Error('no IDAT');
}

describe('icon-lib: encodePng', () => {
  it('writes a valid 2×1 RGB PNG (signature, IHDR, filter-0 scanline)', () => {
    const rgb = Buffer.from([255, 0, 0, 0, 0, 255]); // red, blue
    const png = encodePng(2, 1, rgb);
    expect(png.subarray(0, 8).equals(PNG_SIG)).toBe(true);
    expect(ihdr(png)).toEqual({ width: 2, height: 1 });
    expect(png.readUInt8(24)).toBe(8); // bit depth
    expect(png.readUInt8(25)).toBe(2); // colour type RGB
    expect([...scanlines(png)]).toEqual([0, 255, 0, 0, 0, 0, 255]);
    expect(png.subarray(png.length - 8).toString('latin1')).toBe('IEND' + '\xae\x42\x60\x82');
  });
});

describe('icon-lib: renderIcon', () => {
  it('scales a 2×2 grid ×2 onto a 6×6 canvas filled with the dominant shade, centred', () => {
    // shade 3 dominates (3 of 4 px) → background = palette[3]
    const rows = ['03', '33'];
    const pal = ['#000000', '#111111', '#222222', '#ffffff'];
    const png = renderIcon(rows, pal, 6, 2);
    expect(ihdr(png)).toEqual({ width: 6, height: 6 });
    const raw = scanlines(png);
    const px = (x: number, y: number): number[] => {
      const o = y * (1 + 6 * 3) + 1 + x * 3;
      return [raw[o], raw[o + 1], raw[o + 2]];
    };
    expect(px(0, 0)).toEqual([255, 255, 255]); // border = background
    expect(px(1, 1)).toEqual([0, 0, 0]); // top-left of the emblem at offset 1
    expect(px(2, 2)).toEqual([0, 0, 0]); // same source pixel, ×2
    expect(px(3, 1)).toEqual([255, 255, 255]); // rows[0][1] = '3'
    expect(px(5, 5)).toEqual([255, 255, 255]);
  });
});

const ICONS = [
  { file: 'icon-192.png', size: 192, scale: 6, purpose: 'any' },
  { file: 'icon-512.png', size: 512, scale: 16, purpose: 'any' },
  // maskable: emblem at ×12 (384 px) sits inside the 80 % safe zone of 512
  { file: 'icon-512-maskable.png', size: 512, scale: 12, purpose: 'maskable' },
] as const;

function emblemRows(): string[] {
  return composeEmblem(T.RUG_TL, T.RUG_TR, T.RUG_BL, T.RUG_BR);
}

describe('PWA icons (public/icon-*.png)', () => {
  for (const icon of ICONS) {
    it(`${icon.file} is the emblem at ×${icon.scale} on ${icon.size}²`, () => {
      const expected = renderIcon(emblemRows(), BG_PAL.green, icon.size, icon.scale);
      const path = join(REPO_ROOT, 'public', icon.file);
      if (process.env.UPDATE_ICONS) writeFileSync(path, expected);
      expect(existsSync(path), `${icon.file} missing — run with UPDATE_ICONS=1`).toBe(true);
      const actual = readFileSync(path);
      expect(actual.subarray(0, 8).equals(PNG_SIG)).toBe(true);
      expect(ihdr(actual)).toEqual({ width: icon.size, height: icon.size });
      expect(actual.equals(expected), `${icon.file} is stale — run with UPDATE_ICONS=1`).toBe(true);
    });
  }
});

describe('public/manifest.webmanifest', () => {
  const manifest = JSON.parse(readFileSync(join(REPO_ROOT, 'public/manifest.webmanifest'), 'utf8'));

  it('carries the fields Chrome needs for install + standalone', () => {
    expect(manifest).toMatchObject({
      name: 'TEAM RÖKKET — Rise of the Rocket',
      short_name: 'RÖKKET BOY',
      id: '/',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      orientation: 'portrait',
      theme_color: '#17131f',
      background_color: '#17131f',
    });
  });

  it('lists exactly the three generated icons', () => {
    expect(manifest.icons).toEqual(
      ICONS.map((i) => ({ src: `/${i.file}`, sizes: `${i.size}x${i.size}`, type: 'image/png', purpose: i.purpose })),
    );
  });
});

describe('index.html PWA head tags', () => {
  const html = readFileSync(join(REPO_ROOT, 'index.html'), 'utf8');
  it('links the manifest and sets theme-color + Safari home-screen tags', () => {
    expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest">');
    expect(html).toContain('<meta name="theme-color" content="#17131f">');
    expect(html).toContain('<meta name="apple-mobile-web-app-capable" content="yes">');
    expect(html).toContain('<link rel="apple-touch-icon" href="/icon-192.png">');
  });
});
