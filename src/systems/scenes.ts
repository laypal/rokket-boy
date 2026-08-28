// Boot / Title / Intro / End screens.
import { G } from '../state';
import type { MapId } from '../types';
import { T } from '../data/tiles';
import { BG_PAL } from '../data/palettes';
import { EGG_TOTAL } from '../data/eggs';
import { ctx, decode, fill, rect, text, textC, glyph, startFade, drawWindow, W, H } from '../engine/renderer';
import { Input } from '../engine/input';
import { Audio2 } from '../engine/audio';
import { canInstall, promptInstall } from '../engine/install';
import { CHAR_FRAMES } from '../engine/charFrames';
import { quest } from './quest';
import { hasSave, readSave, applySave } from './save';
import { performWarp, landAt, worldDraw } from './world';
import { MAPS } from '../data/maps';

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
  G.introT = 0;
  G.cutscene = null;
  Audio2.play('intro');
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
  // PKG.4: the game invites its own install — only while Chrome is offering
  // one, never under the CONTINUE/NEW GAME window (drawn below, y 92–128)
  if (titleSel === null && canInstall()) textC('SELECT: INSTALL APP', 126, pal[1]);
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
  if (Input.hit('select') && canInstall()) {
    Audio2.sfx('confirm');
    promptInstall();
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

// ── ONB.8 cold open ──────────────────────────────────────────────────────
// Eight cards over real map backdrops. `cam` is the camera TARGET in pixels
// (cameraFor clamps it): two numbers hold still, four pan from the first
// pair to the second across the card's dwell. Frame counts are frozen in
// docs/superpowers/specs/2026-08-18-cold-open-intro-design.md — 990 frames
// is the 16.5s the design signed off.
//
// `hold` opens a beat: the card shows its backdrop for HOLD_FRAMES before
// the words appear, so you see where you are before you are asked to read.
// The design budgeted 54 frames for beat transitions; this is where they go,
// and the three holds are already inside the frame counts below.
//
// `showPlayer`: the player sprite stands at (9,7) on every map, which is a
// stray figure in a cave and the actual recruit in HQ. Only HQ shows it.
export const HOLD_FRAMES = 18;

export interface IntroCard {
  map: MapId;
  cam: [number, number] | [number, number, number, number];
  lines: string[];
  frames: number;
  /** first card of a beat: hold the backdrop before the words land */
  hold?: boolean;
  /** draw the player sprite (HQ only — see above) */
  showPlayer?: boolean;
}

export const INTRO_CARDS: IntroCard[] = [
  // beat 1 — the world
  { map: 'moon1',  cam: [144, 80],          frames: 114, hold: true,
    lines: ['THIS IS KANTOO.', 'IT RUNS ON MONS.'] },
  { map: 'corner', cam: [144, 80],          frames: 132,
    lines: ['EVERYONE CATCHES', 'THEM, TRAINS THEM', 'AND FIGHTS THEM.'] },
  { map: 'bridge', cam: [96, 160],          frames: 144,
    lines: ['WIN ENOUGH FIGHTS', 'AND YOU GET A', 'BADGE.', '', 'YOU WANTED PAY.'] },
  // beat 2 — the tower. 2a holds at street level (any target y ≥ 400 pins
  // the camera to the map bottom: door on screen y 112, sign above it);
  // 2b and 2c are one climb at a constant 168px per card, ending with the
  // camera at the top so the roof and the lit window sit under the band.
  { map: 'tower',  cam: [80, 400],          frames: 114, hold: true,
    lines: ['SO YOU SIGNED ON', 'WITH ROKKET CORP.'] },
  { map: 'tower',  cam: [80, 400, 80, 232], frames: 132,
    lines: ['STEADY WORK.', 'GOOD DENTAL.', 'AWFUL PEOPLE.'] },
  { map: 'tower',  cam: [80, 232, 80, 64],  frames: 132,
    lines: ['TWELVE FLOORS.', 'THE BOSS TAKES', 'THE TOP ONE.'] },
  // beat 3 — HQ. Target y 96 (camY 32) puts Giovanni (7,3) at screen y
  // 12..28, right above the band, and the player (9,7) at 76..92, right
  // below a three-line one.
  { map: 'hq',     cam: [144, 96],          frames: 102, hold: true, showPlayer: true,
    lines: ['YOU GET THE', 'GROUND FLOOR.'] },
  { map: 'hq',     cam: [144, 96],          frames: 120, showPlayer: true,
    lines: ['DO NOT MESS', 'THIS UP.', '     -- G.'] },
];

export function introUpdate(): void {
  const card = INTRO_CARDS[G.introPage];
  // Point the world renderer at the backdrop without warping to it: no fade,
  // no music change, no enter scripts. Scenery, not a destination.
  G.map = MAPS[card.map];

  // camera: hold, or pan from the first pair to the second across the dwell
  const t = card.frames > 1 ? G.introT / (card.frames - 1) : 1;
  const [x0, y0] = card.cam;
  const x1 = card.cam.length === 4 ? card.cam[2] : x0;
  const y1 = card.cam.length === 4 ? card.cam[3] : y0;
  G.cutscene = {
    camX: x0 + (x1 - x0) * t,
    camY: y0 + (y1 - y0) * t,
    hidePlayer: !card.showPlayer,
  };
  worldDraw();

  // The words need a floor to sit on: over a lit cave or a magenta casino,
  // pale text alone is unreadable. A solid night-palette band is the GB
  // answer, and it is the same band on every card so the eye stops moving.
  // A beat's opening card holds its backdrop bare for HOLD_FRAMES first.
  const night = BG_PAL.night;
  const holding = card.hold === true && G.introT < HOLD_FRAMES;
  if (!holding) {
    const bandH = card.lines.length * 14 + 6; // 6px above the first line and below the last
    rect(0, 28, W, bandH, night[0]);
    card.lines.forEach((l, i) => textC(l, 34 + i * 14, night[3]));
  }
  // ONB.8-FB: the prompts drew night[2] straight onto the backdrop, which
  // the bridge card's light teal (BG_PAL.span) nearly swallowed. Same idiom
  // as the words band above: a night[0] floor under them, every card, every
  // frame — 116 = 122 (the "- A -" row) minus the words band's 6px margin.
  rect(0, 116, W, H - 116, night[0]);
  if ((G.frame >> 4) & 1) textC('- A -', 122, night[2]);
  textC('START TO SKIP', 134, night[2]);

  // ONB.8: START leaves the whole cinematic, A advances one card. Both are
  // live from the first frame — Input.hit() is edge-triggered and
  // Input.endFrame() clears the pressed set every frame, so a START still
  // held from the title screen cannot leak in here.
  if (Input.hit('start')) {
    Audio2.sfx('beep');
    endIntro();
    return;
  }
  if (Input.hit('a')) {
    Audio2.sfx('beep');
    nextCard();
    return;
  }
  G.introT++;
  if (G.introT >= card.frames) nextCard();
}

function nextCard(): void {
  G.introPage++;
  G.introT = 0;
  if (G.introPage >= INTRO_CARDS.length) endIntro();
}

/** Hand over to the game: the same fade the old intro used, then landAt does
 *  map, player, music and queues HQ's enter script — which is how Giovanni
 *  gets his opening line (src/data/dialog/hq.ts, behind `introSeen`). Not
 *  performWarp: that autosaves and fires
 *  the SESSION-ONLY toast, and neither belongs at the end of a cinematic. */
// Exported for QA.8's `__debug.skipIntro()` — it needs this exact hand-off
// (fade + landAt), not a copy of it.
export function endIntro(): void {
  G.introT = 0;
  // ONB.9: stop the intro track here, not inside the fade callback below —
  // the callback fires ~9 frames (~150ms) after startFade() is called
  // (renderer.ts), and Audio2 has no fades/cross-fade (play() is a hard
  // cut), so `intro` would otherwise keep playing across the fade to black.
  Audio2.stop();
  // Keep the cutscene camera up through the fade-out: `worldwait` still
  // draws the world, and dropping it here would snap the view to the
  // player for nine frames on whatever backdrop the skip landed on.
  startFade(() => {
    G.cutscene = null;
    landAt(['hq', 9, 7, 'down']);
  });
  G.state = 'worldwait';
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
