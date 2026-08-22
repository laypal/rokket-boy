// BATTLE DRAW — HRD.13: the draw-only half of battle.ts's render section,
// split out mechanically (zero behaviour change) the same way battleFx.ts
// already split off the FX/positioning half. This module owns presentation
// only — battle.ts owns all state and calls battleDraw() each frame.
import { G } from '../state';
import { SPECIES } from '../data/mons';
import { MOVES } from '../data/moves';
import { PORTRAITS } from '../data/chars';
import { BG_PAL, type Palette } from '../data/palettes';
import { ctx, decode, fill, rect, text, clamp, drawWindow, W } from '../engine/renderer';
import {
  spritePos,
  drawFxOverlay,
  spriteShown,
  tweenHp,
  floatFrame,
  FLOAT_LEN,
  FLOAT_LEN_SUPER,
  xpFillFrame,
  ME_ANCHOR,
  FOE_ANCHOR,
  evolveFrame,
} from './battleFx';
import { maxHp, xpProgress } from './mon';
import { itemDef, itemLabel } from './inventory';
import {
  active,
  spec,
  monName,
  battleItems,
  ROOT_MENU,
  rootHelp,
  moveInfo,
  encounterFlash,
  partyRow,
  type BattleState,
} from './battle';

// ── render ───────────────────────────────────────────────────────────────
function hpBar(x: number, y: number, w: number, cur: number, max: number, pal: string[]): void {
  text('HP', x, y - 2, pal[0]);
  rect(x + 16, y, w, 5, pal[0]);
  rect(x + 17, y + 1, w - 2, 3, pal[3]);
  const fw = Math.ceil(((w - 2) * cur) / max);
  rect(x + 17, y + 1, fw, 3, cur / max > 0.5 ? pal[1] : pal[0]);
}

/** QOL.11: floating damage number over the side that took the hit. Pure
 *  timing comes from battleFx.floatFrame — this picks the amt/color/anchor
 *  and owns the b.float expiry (draw-side cleanup, same as hpAnim above). */
function drawFloat(b: BattleState, pal: string[]): void {
  if (!b.float) return;
  const { mult } = b.float;
  const boosted = mult >= 2;
  const elapsed = b.t - b.float.start;
  if (elapsed >= (boosted ? FLOAT_LEN_SUPER : FLOAT_LEN)) {
    b.float = undefined;
    return;
  }
  const { dy, show } = floatFrame(elapsed, boosted);
  if (!show) return;
  const { side, amt } = b.float;
  const anchor = side === 'me' ? ME_ANCHOR : FOE_ANCHOR;
  const label = mult === 0 ? '0' : '-' + amt;
  const x = anchor.x - 8;
  const y = anchor.y + dy;
  // Outlined print (Lyall's playtest: bare glyphs vanished into the
  // sprites) — a 1px halo in the contrasting shade behind the number.
  if (boosted) {
    outlinedText(label, anchor.x - 16, y, pal[0], pal[3], 2); // UX2.3: 2x scale replaces the old bold double-print
  } else if (mult >= 1) {
    outlinedText(label, x, y, pal[0], pal[3]);
  } else {
    outlinedText(label, x, y, pal[2], pal[0]); // not-very / immune
  }
}

/** 4-direction 1px halo behind a label — GB-style contrast against busy
 *  sprite pixels (no outline support in the bitmap font itself). `scale`
 *  (UX2.3) enlarges the glyphs themselves; the halo stays a 1px offset in
 *  screen space regardless of scale — a scaled halo would read as a thick
 *  border, not a hairline. */
function outlinedText(label: string, x: number, y: number, color: string, halo: string, scale = 1): void {
  for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    text(label, x + ox, y + oy, halo, scale);
  }
  text(label, x, y, color, scale);
}

function drawList(b: BattleState, labels: string[], colors?: string[], y0 = 100): void {
  const pal = BG_PAL.green;
  drawWindow(62, 96, 98, 48, pal);
  labels.forEach((l, i) => {
    const y = y0 + i * 9; // 9px rows fit 5 entries (FIGHT/SWIPE/SWITCH/ITEM/LEG IT)
    text(l, 78, y, colors?.[i] ?? pal[0]);
    if (i === b.sel) text('>', 70, y, pal[0]);
  });
}

/** QOL.1/QOL.10 shared one-line help strip. 16px tall because drawWindow's
 *  double border eats 4px each side — an 8px glyph needs exactly the 8px
 *  interior a 16px window leaves (the 12px first cut drew text ON the
 *  border, Lyall's playtest catch). Still overlaps the my-info box's hp
 *  NUMBER line; the hp BAR above stays visible. */
function drawHelpBar(line: string, line2?: string): void {
  const pal = BG_PAL.green;
  // UX2.2: a second line grows the bar to 24px (interior 84..100 = two
  // 8px rows). The extra 8px only ever covers window-border pixels: the
  // dialog/list tops at y 96..104 (the MOVES list shifts its rows to 105
  // to duck the bar's bottom border). The my-box hp BAR at y 76 stays
  // visible either way — only the hp NUMBER line was ever occluded.
  if (line2 !== undefined) {
    drawWindow(0, 80, W, 24, pal);
    text(line, 6, 84, pal[0]);
    text(line2, 6, 92, pal[0]);
    return;
  }
  drawWindow(0, 80, W, 16, pal);
  text(line, 6, 84, pal[0]);
}

/** QOL.1 (item) / QOL.12 (switch/target) wide list — up to 4 rows, room for
 *  the hp/status readout the narrow root-menu list can't fit. No title row:
 *  the window's 40px interior fits four 8px rows with breathing room OR a
 *  title, not both — the help bar above carries the phase title instead. */
function drawWideList(b: BattleState, rows: { label: string; color?: string }[]): void {
  const pal = BG_PAL.green;
  drawWindow(16, 96, 144, 48, pal);
  // party cap is 4 and today's battle-usable items are ≤4 too; a scrolling
  // window is a future card if either list ever grows past that.
  rows.slice(0, 4).forEach((r, i) => {
    const y = 101 + i * 10;
    text(r.label, 32, y, r.color ?? pal[0]);
    if (i === b.sel) text('>', 24, y, pal[0]);
  });
}

/** UX2.4: the evolution cinematic. Draw-only — evolveFrame decides what is on
 *  screen, this decides where. The scene keeps drawing under the refusal
 *  confirmation, frozen at the paused frame.
 *
 *  Adaptation: the frozen spec assumed `b.evoScene` always exists in this
 *  phase, but resolveEvolve's decline path (STOP pressed straight from the
 *  EVOLVE/STOP prompt, before any evolveScene ever started) reaches
 *  'evoConfirm' with only `b.evolve` set. Fall back to that: mon/to come from
 *  b.evolve, and elapsed is 0 (evolveFrame(0) is the 'hold' phase, full
 *  colour — the pre-scene sprite under the prompt). The hold-phase "WHAT?
 *  SOMETHING / IS HAPPENING..." text and the "NEVER EVOLVE?" confirmation
 *  text share the same y=104/116 rows, so hold text is suppressed whenever
 *  b.phase is 'evoConfirm' — this also covers pressing B early enough in the
 *  real scene that pausedAt itself lands in the hold phase. */
function drawEvolveScene(b: BattleState, pal: Palette): void {
  const scene = b.evoScene;
  const mon = scene ? scene.mon : b.evolve!.mon;
  const to = scene ? scene.to : b.evolve!.to;
  const elapsed = scene ? (scene.pausedAt ?? b.t - scene.start) : 0;
  const f = evolveFrame(elapsed);
  fill(pal[3]);
  if (!f.white) {
    const sp = f.showNew ? SPECIES[to] : spec(mon);
    // shade 3 = the sprite's own palette; 0..2 = a flat fill that keeps the
    // silhouette (decode skips '.', so shape survives a single-colour palette)
    const p: Palette = f.shade === 3 ? sp.pal : [pal[f.shade], pal[f.shade], pal[f.shade], pal[f.shade]];
    ctx.drawImage(decode(sp.front, p), 52, 20, 56, 56);
  }
  if (f.phase === 'hold' && b.phase !== 'evoConfirm') {
    text('WHAT? SOMETHING', 6, 104, pal[0]);
    text('IS HAPPENING...', 6, 116, pal[0]);
  }
  if (f.phase === 'done') {
    // UX2.4-FB: the reveal holds here until A — name the new mon in the
    // standard dialog box (finishEvolve's message tells the full story).
    drawWindow(0, 96, W, 48, pal);
    text(SPECIES[to].name + '!', 8, 104, pal[0]);
  }
  if (b.phase === 'evoConfirm') {
    // ≤7 chars per line: drawList's window starts at x=62, so a line from
    // x=6 must end by glyph 7 (the LET IT / CHANGE? budget). "STOP FOR"
    // was 8 and lost its R under the window — final-review catch.
    text('NEVER', 6, 104, pal[0]);
    text('EVOLVE?', 6, 116, pal[0]);
    drawList(b, ['NO', 'YES']);
    drawHelpBar('NO SECOND CHANCE.');
  }
}

export function battleDraw(): void {
  const b = G.battle!;
  const pal = BG_PAL.green;
  // QOL.3: wild encounters open on 4 inversion beats before anything else is
  // drawn — draw-only, so update timing and every seeded test are untouched.
  const flash = encounterFlash(b.t, !b.enc.trainer);
  if (flash !== null) {
    fill(pal[flash]);
    return;
  }
  // UX2.4: the cinematic owns the whole screen — no boxes, no help bar.
  if (b.phase === 'evolveScene' || b.phase === 'evoConfirm') {
    drawEvolveScene(b, pal);
    return;
  }
  const me = active(b);
  const meSp = spec(me);
  const foeSp = spec(b.foe);
  const meMax = maxHp(meSp, me.lv);
  const foeMax = maxHp(foeSp, b.foe.lv);
  fill(pal[3]);
  // Entrance slide, hit shake and the active effect's offsets all come from
  // battleFx.spritePos (the F13 split); raw linear `slide` still gates the
  // info boxes so phase/timing is unchanged.
  const pos = spritePos(b);
  // CH2.4: a trainer with a registered portrait rides the slide-in at the
  // foe anchor; the mon takes over at 'open' with the "sent out" line.
  // Trainers without one (GUARD) keep the label-only intro.
  const portrait = b.enc.trainer ? PORTRAITS[b.enc.trainer] : undefined;
  if (b.phase === 'slide' && portrait) {
    ctx.drawImage(decode(portrait.rows, portrait.pal), pos.foe.x + 4, pos.foe.y + 4, 48, 48);
  } else if (spriteShown(b, 'foe', b.foe.hp)) ctx.drawImage(decode(foeSp.front, foeSp.pal), pos.foe.x, pos.foe.y, 56, 56);
  if (spriteShown(b, 'me', me.hp)) ctx.drawImage(decode(meSp.back, meSp.pal), pos.me.x, pos.me.y, 48, 40);
  drawFxOverlay(b);
  drawFloat(b, pal);
  // QOL.4: hp-bar tween — draw-only, the real hp already snapped instantly
  // (applyDrain/applyItemTarget); dropping b.hpAnim here is presentation-side
  // cleanup, not logic (1f.10 precedent).
  if (b.hpAnim && b.t - b.hpAnim.start >= 20) b.hpAnim = undefined;
  const foeHpShown = b.hpAnim?.side === 'foe' ? tweenHp(b.hpAnim.from, b.foe.hp, b.t - b.hpAnim.start) : b.foe.hp;
  const meHpShown = b.hpAnim?.side === 'me' ? tweenHp(b.hpAnim.from, me.hp, b.t - b.hpAnim.start) : me.hp;
  // info boxes
  if (pos.slide >= 1) {
    // foe box (top-left)
    rect(2, 6, 92, 26, pal[3]);
    text(foeSp.name, 4, 8, pal[0]);
    text('L' + b.foe.lv, 72, 8, pal[0]);
    hpBar(4, 20, 62, foeHpShown, foeMax, pal);
    rect(2, 32, 92, 2, pal[0]);
    // my box (bottom-right)
    rect(74, 62, 84, 32, pal[3]);
    text(monName(me), 78, 64, pal[0]);
    text('L' + me.lv, 138, 64, pal[0]);
    hpBar(78, 76, 58, meHpShown, meMax, pal);
    text(meHpShown + '/' + meMax, 104, 84, pal[0]);
    // UX2.1: 2px xp strip under the hp number. The post-win fill (b.xpAnim)
    // plays under the award messages and expires draw-side (hpAnim idiom);
    // blink-off flash frames draw the empty track — that's the level flash.
    let xpP = xpProgress(me);
    if (b.xpAnim) {
      const f = xpFillFrame(b.xpAnim.segs, b.t - b.xpAnim.start);
      if (f.done) b.xpAnim = undefined;
      else xpP = f.show ? f.fill : 0;
    }
    rect(78, 92, 74, 2, pal[2]);
    rect(78, 92, Math.round(74 * xpP), 2, pal[0]);
    rect(74, 94, 86, 2, pal[0]);
  }
  // dialog area
  drawWindow(0, 96, W, 48, pal);
  if (b.msg && b.msg.lines) {
    let rem = b.msgChars;
    b.msg.lines.slice(0, 3).forEach((l, i) => {
      const n = clamp(rem, 0, l.length);
      text(l.substring(0, n), 8, 104 + i * 12, pal[0]);
      rem -= l.length;
    });
  } else if (b.phase === 'menu') {
    text('WHAT WILL', 6, 104, pal[0]);
    text(monName(me) + ' DO?', 6, 116, pal[0]);
    // ONB.5-FB: SWIPE is once per trainer battle, and the entry used to look
    // live right up until the press that refused it.
    //
    // Dimmed with pal[1], NOT the pal[2] the SWITCH/target lists use for
    // fainted rows. First cut used pal[2] for consistency and the playtest
    // killed it: pal[2] on the window's pal[3] interior is 1.2:1 contrast, so
    // at 160x144 the row read as BLANK with the cursor pointing at nothing —
    // a rendering fault, not a disabled entry. pal[1] is 3.3:1, about half
    // the 6:1 of normal text, which reads as dimmed. Every BG_PAL runs
    // dark->light, so pal[1] is the second-darkest in all of them.
    const spent = !!b.enc.trainer && !!b.stole;
    drawList(b, ROOT_MENU, spent ? ROOT_MENU.map((_, i) => (i === 1 ? pal[1] : pal[0])) : undefined);
    drawHelpBar(rootHelp(b.sel, !!b.enc.trainer, spent));
  } else if (b.phase === 'moves') {
    text('WHICH', 6, 108, pal[0]);
    text('MOVE?', 6, 120, pal[0]);
    // UX2.2: rows start at 105 so the 24px hover bar's bottom border
    // (y ≤ 104) never clips the first move's glyphs; 105 + 3·9 + 8 = 140
    // = the list window's interior bottom, exact fit for 4 moves.
    drawList(b, me.moves.map((id) => MOVES[id].name), undefined, 105);
    drawHelpBar(...moveInfo(MOVES[me.moves[b.sel]]));
  } else if (b.phase === 'item') {
    const items = battleItems();
    drawWideList(
      b,
      items.map((e) => ({ label: itemLabel(e) })),
    );
    drawHelpBar(itemDef(items[b.sel].id).desc);
  } else if (b.phase === 'switch' || b.phase === 'target') {
    // Greying is a REFUSAL cue: switch greys fainted + active (both refuse);
    // target greys only fainted — the active mon is a perfectly good heal
    // target (Lyall's playtest catch). The '*' still marks who's on field.
    //
    // pal[1], not pal[2]: shade 2 on the window's shade 3 is 1.20:1 contrast
    // in the GREEN palette — a fainted row rendered as an empty line rather
    // than a dim one, which reads as a missing row, not a refused one. Green
    // is uniquely bad this way (hq 2.62, casino 3.40, vault 2.70 are all dim
    // but readable) and green is the battle palette, so battle is exactly
    // where it bit. pal[1] is 3.29:1 against normal text's 6.02:1. Caught on
    // the ONB.5 SWIPE cue, same one-shade fix, same reason.
    drawWideList(
      b,
      G.party.map((m, i) => ({
        label: partyRow(m, SPECIES[m.species], i === b.meIdx),
        color: m.hp <= 0 || (b.phase === 'switch' && i === b.meIdx) ? pal[1] : pal[0],
      })),
    );
    drawHelpBar(b.phase === 'switch' ? 'SWITCH TO?' : 'USE ON WHO?');
  } else if (b.phase === 'replace') {
    text('FORGET', 6, 104, pal[0]);
    text('WHICH?', 6, 116, pal[0]);
    drawList(
      b,
      b.replace!.mon.moves.map((id) => MOVES[id].name), // QOL.7: may be benched
    );
  } else if (b.phase === 'evolve') {
    text('LET IT', 6, 104, pal[0]);
    text('CHANGE?', 6, 116, pal[0]);
    drawList(b, ['EVOLVE', 'STOP']);
  }
}
