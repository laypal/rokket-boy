// Boot / Title / Intro / End screens.
import { G } from '../state';
import { T } from '../data/tiles';
import { BG_PAL } from '../data/palettes';
import { EGG_TOTAL } from '../data/eggs';
import { ctx, decode, fill, rect, text, textC, glyph, startFade, drawWindow, W, H } from '../engine/renderer';
import { Input } from '../engine/input';
import { Audio2 } from '../engine/audio';
import { CHAR_FRAMES } from '../engine/charFrames';
import { quest } from './quest';
import { hasSave, readSave, applySave } from './save';
import { performWarp } from './world';

let powered = false;
export function markPowered(): void {
  powered = true;
}

export function bootUpdate(): void {
  G.bootT++;
  const pal = BG_PAL.gray;
  fill(pal[3]);
  const y = Math.min(60, Math.floor(G.bootT * 1.4));
  textC('ROKKET', y, pal[0]);
  // umlaut over the O
  const ox = Math.floor((W - 48) / 2) + 8;
  rect(ox + 1, y - 3, 2, 2, pal[0]);
  rect(ox + 5, y - 3, 2, 2, pal[0]);
  textC('B O Y', y + 12, pal[1]);
  if (G.bootT === 45 && powered) Audio2.sfx('confirm');
  if (G.bootT > 90) {
    G.state = 'title';
    Audio2.play('title');
  }
}

const KONAMI = ['up', 'up', 'down', 'down', 'left', 'right', 'left', 'right', 'b', 'a'];

// §4.6 load surface: CONTINUE/NEW GAME window, shown only when a save exists.
let titleSel: number | null = null;

function startIntro(): void {
  G.state = 'intro';
  G.introPage = 0;
  Audio2.stop();
}

function continueGame(): void {
  const save = readSave();
  if (!save) {
    // save vanished between hasSave() and now — fall back to a fresh game
    startIntro();
    return;
  }
  // HRD.2: this ran OUTSIDE readSave's try — a blob that validated but still
  // blew up in apply/warp crashed CONTINUE into a frozen canvas. Land back on
  // the title screen instead; the catch records, never swallows.
  try {
    applySave(save);
    Audio2.stop();
    // dir isn't in SaveV1 — face down. performWarp fades in, plays map music
    // and runs enter scripts (which re-apply flag-gated map repairs).
    performWarp([save.mapId, save.x, save.y, 'down']);
  } catch (err) {
    console.error(err);
    G.state = 'title';
  }
}

export function titleUpdate(): void {
  G.titleT++;
  const pal = BG_PAL.green;
  fill(pal[2]);
  rect(0, 0, W, 14, pal[0]);
  rect(0, H - 14, W, 14, pal[0]);
  // big R emblem from rug tiles
  const rp = [pal[0], pal[1], pal[2], pal[3]];
  ctx.drawImage(decode(T.RUG_TL, rp), 64, 20);
  ctx.drawImage(decode(T.RUG_TR, rp), 80, 20);
  ctx.drawImage(decode(T.RUG_BL, rp), 64, 36);
  ctx.drawImage(decode(T.RUG_BR, rp), 80, 36);
  textC('TEAM', 58, pal[0]);
  // large ROKKET: draw glyphs at 2×
  const word = 'ROKKET';
  const bw = 16;
  const x0 = Math.floor((W - word.length * bw) / 2);
  for (let i = 0; i < word.length; i++) {
    const g = glyph(word[i], pal[0]);
    if (g) ctx.drawImage(g, x0 + i * bw, 68, 16, 16);
  }
  rect(x0 + 20, 64, 3, 3, pal[0]);
  rect(x0 + 26, 64, 3, 3, pal[0]); // umlaut
  textC('RISE OF THE ROCKET', 88, pal[1]);
  // cast strolls the bottom band
  const walk = (G.frame >> 3) % 3;
  const wx = ((G.frame >> 1) % (W + 80)) - 40;
  ctx.drawImage(CHAR_FRAMES.jessika.right[walk], wx - 20, H - 30);
  ctx.drawImage(CHAR_FRAMES.grunt.right[walk === 0 ? 0 : 3 - walk], wx, H - 30);
  ctx.drawImage(CHAR_FRAMES.djames.right[walk], wx + 20, H - 30);
  if (titleSel === null && (G.titleT >> 4) & 1) textC('PRESS START', 104, pal[0]);
  textC('ANTI-FAN GAMES 2026', 118, pal[1]);
  // HRD.3 build stamp — stays in prod (harmless, useful in bug screenshots)
  text(typeof __BUILD__ !== 'undefined' ? __BUILD__ : 'dev', 2, 133, pal[1]);
  // CONTINUE/NEW GAME window (only offered when a save exists)
  if (titleSel !== null) {
    drawWindow(40, 92, 80, 36, pal);
    ['CONTINUE', 'NEW GAME'].forEach((l, i) => {
      text(l, 58, 99 + i * 12, pal[0]);
      if (i === titleSel) text('>', 48, 99 + i * 12, pal[0]);
    });
    if (Input.hit('up') || Input.hit('down')) {
      titleSel ^= 1;
      Audio2.sfx('beep');
    }
    if (Input.hit('b')) {
      Audio2.sfx('cancel');
      titleSel = null;
      return;
    }
    if (Input.hit('a') || Input.hit('start')) {
      Audio2.sfx('confirm');
      const sel = titleSel;
      titleSel = null;
      if (sel === 0) continueGame();
      else startIntro();
    }
    return;
  }
  // konami
  for (const k of ['up', 'down', 'left', 'right', 'a', 'b', 'start']) {
    if (Input.hit(k)) {
      G.konami.push(k);
      if (G.konami.length > 10) G.konami.shift();
      if (KONAMI.every((v, i) => G.konami[i] === v)) {
        if (!quest.eggs.has('konami')) {
          quest.eggs.add('konami');
          quest.coins += 300;
          Audio2.sfx('item');
        }
      }
    }
  }
  if (Input.hit('start') || Input.hit('a')) {
    Audio2.sfx('confirm');
    if (hasSave()) titleSel = 0;
    else startIntro();
  }
}

const INTRO = [
  ['IN THE SHADOWS', 'OF KANTOO...', '', 'AN ORGANISATION', 'RISES AGAIN.'],
  ['YOU ARE ITS', 'NEWEST GRUNT.', '', 'TONIGHT IS YOUR', 'FIRST JOB.'],
  ['DO NOT MESS', 'THIS UP.', '', '      -- G.'],
];
export function introUpdate(): void {
  fill('#000');
  const pg = INTRO[G.introPage];
  pg.forEach((l, i) => textC(l, 34 + i * 14, '#b8b8e8'));
  if ((G.frame >> 4) & 1) textC('- A -', 122, '#5555a0');
  if (Input.hit('a') || Input.hit('start')) {
    Audio2.sfx('beep');
    G.introPage++;
    if (G.introPage >= INTRO.length) {
      startFade(() => {
        G.state = 'world';
        G.mapNameT = 90;
        Audio2.play('hq');
      });
      G.state = 'worldwait';
    }
  }
}

export function endUpdate(): void {
  G.endT++;
  const pal = BG_PAL.green;
  fill(pal[3]);
  drawWindow(8, 16, 144, 112, pal);
  textC('MISSION', 28, pal[0]);
  textC('COMPLETE!', 40, pal[0]);
  textC('COINS: ' + quest.coins, 62, pal[1]);
  textC('EGGS: ' + quest.eggs.size + '/' + EGG_TOTAL, 74, pal[1]);
  textC('RANK UP SOON...', 92, pal[0]);
  if (G.endT > 60 && (G.frame >> 4) & 1) textC('- A -', 112, pal[1]);
  if (G.endT > 60 && Input.hit('a')) {
    Audio2.sfx('confirm');
    G.state = 'world';
    Audio2.play(G.map.music);
  }
}

// §4.7 promotion card — same composition and timer as the end screen (the two
// states never coexist, so sharing G.endT is safe). G.rankCard is set by the
// rankUp script hook in world.ts; dismissing resumes the suspended script.
export function rankCardUpdate(): void {
  const card = G.rankCard;
  if (!card) {
    G.state = 'world'; // unreachable by script flow; bail rather than hang
    return;
  }
  G.endT++;
  const pal = BG_PAL.green;
  fill(pal[3]);
  drawWindow(8, 16, 144, 112, pal);
  textC('PROMOTION!', 30, pal[0]);
  textC('YOU ARE NOW', 56, pal[1]);
  textC(card.rank, 72, pal[0]);
  textC('KEEP CLIMBING.', 94, pal[1]);
  if (G.endT > 60 && (G.frame >> 4) & 1) textC('- A -', 112, pal[1]);
  if (G.endT > 60 && Input.hit('a')) {
    Audio2.sfx('confirm');
    G.rankCard = null;
    G.state = 'world';
    Audio2.play(G.map.music);
    card.after(); // may immediately re-enter dialog/battle via the script
  }
}
