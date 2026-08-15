// Favicon = the title screen's 32×32 Rökket "R" emblem (the 2×2 RUG tiles)
// as an inline SVG data URI. Pure: rows in, string out. tests/favicon.test.ts
// composes the real T.RUG_* rows + BG_PAL.green through this and asserts
// index.html carries exactly that href, so the tab icon can't drift from
// the art. Rects are merged horizontally (runs) and vertically (identical
// runs on consecutive rows) to keep the URI small; the dominant shade is
// painted once as the background so only three shades need paths.

/**
 * @param {string[]} tl @param {string[]} tr @param {string[]} bl @param {string[]} br
 *   16-row pixel strings ('0'-'3'), the four quadrants
 * @returns {string[]} 32 rows of 32 chars
 */
export function composeEmblem(tl, tr, bl, br) {
  const top = tl.map((row, i) => row + tr[i]);
  const bottom = bl.map((row, i) => row + br[i]);
  return [...top, ...bottom];
}

/**
 * @param {string[]} rows square pixel grid, chars '0'-'3'
 * @param {readonly string[]} palette 4 CSS colours, index = shade
 * @returns {string} minimal SVG markup
 */
export function emblemSvg(rows, palette) {
  const size = rows.length;
  const counts = [0, 0, 0, 0];
  for (const row of rows) for (const ch of row) counts[Number(ch)]++;
  const bg = counts.indexOf(Math.max(...counts));

  // per shade: rects {x,y,w,h}, merged vertically when the same (x,w) run
  // sits directly below
  const rects = new Map();
  for (let y = 0; y < size; y++) {
    const row = rows[y];
    let x = 0;
    while (x < size) {
      const shade = Number(row[x]);
      let w = 1;
      while (x + w < size && Number(row[x + w]) === shade) w++;
      if (shade !== bg) {
        const list = rects.get(shade) ?? [];
        const above = list.find((r) => r.x === x && r.w === w && r.y + r.h === y);
        if (above) above.h++;
        else list.push({ x, y, w, h: 1 });
        rects.set(shade, list);
      }
      x += w;
    }
  }

  let out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">`;
  out += `<rect width="${size}" height="${size}" fill="${palette[bg]}"/>`;
  for (const [shade, list] of [...rects.entries()].sort((a, b) => a[0] - b[0])) {
    const d = list.map((r) => `M${r.x} ${r.y}h${r.w}v${r.h}h-${r.w}z`).join('');
    out += `<path fill="${palette[shade]}" d="${d}"/>`;
  }
  return out + '</svg>';
}

/** @param {string} svg @returns {string} `data:image/svg+xml,…` href */
export function svgDataUri(svg) {
  // encodeURIComponent is safe and unambiguous; keep the few chars browsers
  // accept raw so the URI stays readable and short.
  return 'data:image/svg+xml,' + encodeURIComponent(svg).replace(/%20/g, ' ').replace(/%3D/g, '=').replace(/%3A/g, ':').replace(/%2F/g, '/').replace(/%22/g, "'");
}
