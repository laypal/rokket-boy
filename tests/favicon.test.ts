// The browser-tab icon is the title screen's 32×32 Rökket "R" emblem
// (the four RUG tiles, BG_PAL.green), inlined in index.html as a data: SVG
// so the single-file build stays single-file and the CSP's `img-src data:`
// covers it. This test regenerates that href from the live art through
// scripts/favicon-lib.mjs and asserts index.html carries exactly it — a
// re-drawn emblem or a palette change fails here instead of shipping a
// stale tab icon.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { T } from '../src/data/tiles';
import { BG_PAL } from '../src/data/palettes';
import { composeEmblem, emblemSvg, svgDataUri } from '../scripts/favicon-lib.mjs';

const REPO_ROOT = join(__dirname, '..');

function expectedHref(): string {
  const rows = composeEmblem(T.RUG_TL, T.RUG_TR, T.RUG_BL, T.RUG_BR);
  return svgDataUri(emblemSvg(rows, BG_PAL.green));
}

describe('favicon (title-screen R emblem, inlined)', () => {
  it('index.html carries exactly one rel="icon" link, and it is the emblem', () => {
    const html = readFileSync(join(REPO_ROOT, 'index.html'), 'utf8');
    const links = [...html.matchAll(/<link rel="icon" href="([^"]+)">/g)];
    expect(links.length, 'exactly one <link rel="icon">').toBe(1);
    expect(links[0][1]).toBe(expectedHref());
  });

  it('is a data: SVG under 2 KB (single-file, CSP img-src data:)', () => {
    const href = expectedHref();
    expect(href.startsWith('data:image/svg+xml,')).toBe(true);
    expect(href.length).toBeLessThan(2048);
  });

  it('composes a 32×32 grid from the four 16×16 rug tiles', () => {
    const rows = composeEmblem(T.RUG_TL, T.RUG_TR, T.RUG_BL, T.RUG_BR);
    expect(rows.length).toBe(32);
    expect(rows.every((r) => r.length === 32)).toBe(true);
  });

  it('merges runs: a solid 2×2 block becomes one rect, not four', () => {
    const svg = emblemSvg(['11', '11'], ['#000', '#fff', '#0f0', '#00f']);
    // shade 1 is dominant → painted as the background rect; no paths needed
    expect(svg).toContain('<rect width="2" height="2" fill="#fff"/>');
    expect(svg).not.toContain('<path');
    const svg2 = emblemSvg(['10', '10'], ['#000', '#fff', '#0f0', '#00f']);
    // tie → lowest shade wins as background; shade 1 is one 1×2 rect
    expect(svg2).toContain('d="M0 0h1v2h-1z"');
  });
});
