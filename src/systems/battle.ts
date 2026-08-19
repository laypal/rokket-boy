// BATTLE — classic GB layout: enemy top-right, player back bottom-left.
// Phase 1b: the engine runs on the mon model (plan §4.1/§4.3/§4.4) — the
// player side is the party in G, encounters reference SPECIES, and damage/
// XP/catching come from the pure systems modules. The ScriptHooks contract
// is unchanged: startBattle(id, done) hands follow-up ScriptSteps back.
import { G } from '../state';
import type { EncounterDef, MonInstance, MonSpecies, MoveDef, MoveId, ScriptStep } from '../types';
import { ENCOUNTERS } from '../data/encounters';
import { SPECIES } from '../data/mons';
import { MOVES } from '../data/moves';
import { BALL_ITEM } from '../data/items';
import { effectiveness } from '../data/typeChart';
import { Input } from '../engine/input';
import { Audio2 } from '../engine/audio';
import { rollInt, type Rng } from '../engine/rng';
import { damage, drainHeal } from './combat';
import { playFx, tickFx, EVO_END, EVO_RAMP_END, EVO_SKIP_ARM, EVO_SKIP_TO, type ActiveFx } from './battleFx';
import { makeMon, maxHp, gainXp, evolveMon, xpFillSegs, type XpFillSeg } from './mon';
import { catchChance, rollCatch } from './catch';
import { itemDef, applyHeal, usableInBattle, packCounts } from './inventory';
import { quest } from './quest';
import { jobBattleWon } from './jobs';
import { sharedWhiteout } from './recovery';
import { reduceHeat } from './heat';
import { perkPct } from './perks';
import { listInput } from './ui/listScreen';

// Injectable RNG (plan §4.9): seeded-snapshot battle tests swap this out;
// the game keeps Math.random.
let battleRng: Rng = Math.random;
export function setBattleRng(rng: Rng): void {
  battleRng = rng;
}

/** XP for a defeated foe. The plan gives no yield formula — 2·lv² is a
 *  flagged balance assumption (≈3 same-level wins per early level). */
export function xpFromWin(foeLv: number): number {
  return 2 * foeLv * foeLv;
}

/** ONB.1 balance knob: lv<10 recipients get a bigger share so the first
 *  fights ding. Linear taper, +0.25 per level below LOW_LV_BOOST_UNTIL
 *  (×2.25 at the lv5 starter — enough to cross L6 on the Jessika win; see
 *  .paul/PLAN.md 2026-08-19). Exactly 1 from lv 10 up, so those awards are
 *  byte-identical to pre-ONB.1. */
export const LOW_LV_BOOST_UNTIL = 10;
export function lowLevelBoost(lv: number): number {
  return lv >= LOW_LV_BOOST_UNTIL ? 1 : 1 + (LOW_LV_BOOST_UNTIL - lv) / 4;
}

interface BattleMsg {
  lines: string[];
  after?: (() => void) | null;
  auto?: boolean;
}

export interface BattleState {
  enc: EncounterDef;
  done: (followUp: ScriptStep[] | null) => void;
  phase: 'slide' | 'open' | 'menu' | 'moves' | 'item' | 'target' | 'switch' | 'replace' | 'evolve' | 'evolveScene' | 'evoConfirm' | 'anim';
  t: number;
  sel: number; // selection in whichever menu is open
  rootSel: number; // root-menu entry the current turn was taken with
  meIdx: number; // active party slot
  foe: MonInstance;
  msg: BattleMsg | null;
  msgChars: number;
  queue: BattleMsg[];
  shakeFoe: number;
  shakeMe: number;
  fx?: ActiveFx | null; // active battleFx timeline (presentation only, F13)
  hpAnim?: { side: 'me' | 'foe'; from: number; start: number }; // QOL.4 — draw-only hp-bar tween; overwritten by each new heal
  xpAnim?: { segs: XpFillSeg[]; start: number }; // UX2.1 — draw-only post-win xp fill; active mon only, benched shares apply silently
  float?: { side: 'me' | 'foe'; amt: number; mult: number; start: number }; // QOL.11 — draw-only floating damage number; side is whoever TOOK the hit
  caught?: boolean; // BFX.3 — a wild catch landed; keeps the foe hidden after the throwOk fx ends
  stole?: boolean; // trainer-battle SWIPE gag already fired
  forced?: boolean; // switch menu opened by a faint — B can't back out
  participants: number[]; // party slots that took the field this battle (QOL.7)
  pendingItem?: string; // heal item awaiting a target pick (QOL.6)
  replace?: { mon: MonInstance; move: MoveId; next: () => void }; // pending move-learn prompt
  evolve?: { mon: MonInstance; to: string; next: () => void }; // pending evolution prompt (SPR.0)
  /** UX2.4: the running cinematic. `pausedAt` freezes elapsed time while the
   *  refusal confirmation is up, so answering NO resumes exactly where it
   *  stopped instead of jumping. */
  evoScene?: { mon: MonInstance; to: string; start: number; pausedAt?: number; next: () => void };
}

// ITEM sits at index 3 (before LEG IT) so SWIPE stays index 1 and SWITCH
// index 2 — the seeded battle tests drive the menu by those positions.
export const ROOT_MENU = ['FIGHT', 'SWIPE', 'SWITCH', 'ITEM', 'LEG IT'];

/** QOL.10: root-menu help-bar blurb for the selected entry. SWIPE is
 *  context-sensitive — wild battles throw the ball (doSwipe's catch path),
 *  trainer battles pickpocket (the v2 heist gag, also doSwipe). Pure so it
 *  unit-tests without the renderer; battleDraw is the only caller. */
export function rootHelp(sel: number, trainer: boolean): string {
  switch (sel) {
    case 0:
      return 'PICK A MOVE.';
    case 1:
      return trainer ? 'PICKPOCKET COINS.' : 'THROWS A BALL.';
    case 2:
      return 'SWAP ACTIVE MON.';
    case 3:
      return 'USE A PACK ITEM.';
    default:
      return 'FLEE THE BATTLE.';
  }
}

/** QOL.10 → UX2.2: MOVES-menu hover lines — the stat line became the
 *  move's TYPE over its flavour desc (power/acc stay in the DATA for
 *  combat; only the hover presentation changed). Two lines because the
 *  help bar grows to 24px for this phase — see drawHelpBar. */
export function moveInfo(mv: MoveDef): [string, string] {
  return [mv.type, mv.desc];
}

/** QOL.3: Gen-1 pre-battle inversion flash — wild battles only. Returns the
 *  BG_PAL shade index to flood the screen with on frame t (4 alternating
 *  3-frame beats over t 0..11), or null once the flash is over / for trainer
 *  battles. Pure + draw-only: battleUpdate timing is untouched, so the slide
 *  simply stays covered for its first 12 frames. */
export function encounterFlash(t: number, wild: boolean): number | null {
  if (!wild || t >= 12) return null;
  return Math.floor(t / 3) & 1 ? 0 : 3;
}

export function spec(mon: MonInstance): MonSpecies {
  return SPECIES[mon.species];
}
export function monName(mon: MonInstance): string {
  return mon.nick ?? spec(mon).name;
}

/** QOL.12: SWITCH/target-list row — name, hp/maxHp, active marker, status
 *  tag. Pure formatter so the 15-char wide-list column width is lint-tested
 *  against every real species (mon-data-lint precedent). */
export function partyRow(mon: MonInstance, sp: MonSpecies, active: boolean): string {
  const name = mon.nick ?? sp.name;
  let row = (active ? '*' : '') + name + ' ' + mon.hp + '/' + maxHp(sp, mon.lv);
  if (mon.status) row += ' ' + mon.status;
  return row;
}
export function active(b: BattleState): MonInstance {
  return G.party[b.meIdx];
}
function foeLabel(b: BattleState): string {
  return (b.enc.trainer ? 'Enemy ' : 'Wild ') + spec(b.foe).name;
}

// CH2.1: accepts a ready EncounterDef too — wild rolls build theirs on the
// fly (encounter.ts wildEncounter) instead of registering ids in ENCOUNTERS.
// ScriptHooks.battle stays string-typed; this takes a superset.
export function startBattle(encounter: string | EncounterDef, done: (followUp: ScriptStep[] | null) => void): void {
  const enc = typeof encounter === 'string' ? ENCOUNTERS[encounter] : encounter;
  Audio2.play('battle');
  G.battle = {
    enc,
    done,
    phase: 'slide',
    t: 0,
    sel: 0,
    rootSel: 0,
    meIdx: Math.max(0, G.party.findIndex((m) => m.hp > 0)),
    participants: [Math.max(0, G.party.findIndex((m) => m.hp > 0))],
    foe: makeMon(SPECIES[enc.foe.species], enc.foe.lv),
    msg: null,
    msgChars: 0,
    queue: [],
    shakeFoe: 0,
    shakeMe: 0,
  };
  G.state = 'battle';
}

function say(b: BattleState, lines: string[], after?: () => void): void {
  b.queue.push({ lines, after });
}

/** Chain fn onto whatever message is last in flight (or run now if none). */
function afterQueue(b: BattleState, fn: () => void): void {
  const last = b.queue[b.queue.length - 1] ?? b.msg;
  if (!last) {
    fn();
    return;
  }
  const prev = last.after;
  last.after = () => {
    prev?.();
    fn();
  };
}

/** Shared vertical-menu input: up/down cycle, A confirms, B cancels (if allowed). */
function menuInput(b: BattleState, n: number, confirm: () => void, cancel?: () => void): void {
  b.sel = listInput(b.sel, n);
  if (Input.hit('a')) {
    confirm();
    return;
  }
  if (Input.hit('b') && cancel) {
    Audio2.sfx('cancel');
    cancel();
  }
}

export function battleUpdate(): void {
  const b = G.battle!;
  b.t++;
  // message pump
  if (b.msg) {
    const total = b.msg.lines.join('').length;
    if (b.msgChars < total) {
      b.msgChars += Input.held('a') || Input.held('b') ? 3 : 1;
      if (G.frame % 4 === 0) Audio2.sfx('blip');
    } else if (Input.hit('a') || (b.msg.auto && b.t % 50 === 0)) {
      const after = b.msg.after;
      b.msg = null;
      b.msgChars = 0;
      if (after) after();
    }
    return;
  }
  if (b.queue.length) {
    b.msg = b.queue.shift()!;
    b.msgChars = 0;
    return;
  }

  switch (b.phase) {
    case 'slide':
      if (b.t > 40) {
        b.phase = 'open';
        if (b.enc.trainer) say(b, [b.enc.trainer + ' sent out', spec(b.foe).name + '!']);
        else say(b, ['Wild ' + spec(b.foe).name, 'appeared!']);
        say(b, ['Go! ' + monName(active(b)) + '!'], () => toMenu(b));
      }
      break;
    case 'menu':
      menuInput(b, ROOT_MENU.length, () => {
        Audio2.sfx('confirm');
        b.rootSel = b.sel;
        if (b.sel === 0) {
          b.phase = 'moves';
          b.sel = 0;
        } else if (b.sel === 1) doSwipe(b);
        else if (b.sel === 2) {
          b.phase = 'switch';
          b.sel = b.meIdx;
        } else if (b.sel === 3) openItemMenu(b);
        else doFlee(b);
      });
      break;
    case 'moves': {
      const moves = active(b).moves;
      menuInput(
        b,
        moves.length,
        () => {
          Audio2.sfx('confirm');
          useMove(b, moves[b.sel]);
        },
        () => {
          b.phase = 'menu';
          b.sel = 0;
        },
      );
      break;
    }
    case 'item': {
      const items = battleItems();
      menuInput(
        b,
        items.length,
        () => useItem(b, items[b.sel].id),
        () => {
          b.phase = 'menu';
          b.sel = 3;
        },
      );
      break;
    }
    case 'target':
      menuInput(
        b,
        G.party.length,
        () => applyItemTarget(b),
        () => {
          b.phase = 'item';
          b.sel = 0;
          b.pendingItem = undefined;
        },
      );
      break;
    case 'switch':
      menuInput(
        b,
        G.party.length,
        () => pickSwitch(b),
        b.forced
          ? undefined
          : () => {
              b.phase = 'menu';
              b.sel = 2;
            },
      );
      break;
    case 'replace':
      menuInput(
        b,
        b.replace!.mon.moves.length, // QOL.7: the leveling mon may be benched
        () => resolveReplace(b, true),
        () => resolveReplace(b, false),
      );
      break;
    case 'evolve':
      menuInput(
        b,
        2, // EVOLVE / STOP
        () => resolveEvolve(b, b.sel === 0),
        () => resolveEvolve(b, false), // B = cancel, GB convention (now confirms)
      );
      break;
    case 'evolveScene': {
      const s = b.evoScene!;
      const et = b.t - s.start;
      // Amendment to the frozen spec: the original `et >= EVO_SKIP_ARM` guard
      // had no upper bound, so A pressed again during the reveal (et already
      // in [EVO_SKIP_TO, EVO_END)) rebased `start` BACKWARDS and replayed the
      // reveal — mash A faster than every 45 frames and the scene never ends.
      // `et < EVO_SKIP_TO` closes the window once the skip has already fired.
      // If A and B land on the very same armed frame, A (skip) wins — checked
      // first, deliberately: skipping is idempotent-safe, cancelling isn't.
      if (Input.hit('a') && et >= EVO_SKIP_ARM && et < EVO_SKIP_TO) {
        s.start = b.t - EVO_SKIP_TO; // jump into the reveal; outcome unchanged
      } else if (Input.hit('a') && et >= EVO_END) {
        // UX2.4-FB: the scene holds on the fully revealed mon (name boxed)
        // and only hands back on A — no auto-continue.
        finishEvolve(b);
      } else if (Input.hit('b') && et < EVO_RAMP_END) {
        s.pausedAt = et;
        b.phase = 'evoConfirm';
        b.sel = 0; // default NO
        Audio2.sfx('cancel');
      }
      break;
    }
    case 'evoConfirm':
      menuInput(
        b,
        2, // NO / YES
        () => resolveEvoConfirm(b, b.sel === 1),
        () => resolveEvoConfirm(b, false), // B backs out of the confirmation
      );
      break;
    case 'anim':
      tickFx(b); // no-op unless an effect timeline is active
      break;
    case 'open':
      break;
  }
}

// ── player actions ───────────────────────────────────────────────────────
function useMove(b: BattleState, id: MoveId): void {
  const mon = active(b);
  const foeSp = spec(b.foe);
  const mv = MOVES[id];
  b.phase = 'anim';
  say(b, [monName(mon) + ' used', mv.name + '!'], () => {
    // Accuracy AND damage rolls stay in their pre-FX order; the effect plays
    // between them without touching battleRng (13-battle-fx.md hard rule).
    if (battleRng() > mv.acc) {
      say(b, ['But it missed!'], () => enemyTurn(b));
      return;
    }
    const dmg = damage({ lv: mon.lv, move: mv, atk: spec(mon).atk, def: foeSp.def, defTypes: foeSp.type }, battleRng);
    // QOL.11: one effectiveness() call shared by the message and the float —
    // never re-roll or recompute (13-battle-fx.md hard rule, same as the fx).
    const mult = effectiveness(mv.type, foeSp.type);
    playFx(b, mv.anim, 'me', mv.type, () => {
      Audio2.sfx('hit');
      b.shakeFoe = 14;
      b.foe.hp = Math.max(0, b.foe.hp - dmg);
      b.float = { side: 'foe', amt: dmg, mult, start: b.t };
      sayEffectiveness(b, mult);
      applyDrain(b, mv, mon, spec(mon), monName(mon), dmg);
      if (b.foe.hp <= 0) foeDefeated(b);
      else enemyTurn(b);
    });
  });
}

function sayEffectiveness(b: BattleState, mult: number): void {
  if (mult === 0) say(b, ['It has no', 'effect...']);
  else if (mult >= 2) say(b, ["It's super", 'effective!']);
  else if (mult < 1) say(b, ["It's not very", 'effective...']);
}

/** QOL.5: a 'drain' move returns half its damage to the attacker, clamped
 *  to max hp. Runs for either side after the hit lands; an immune or
 *  missed hit (dmg 0) never reaches here with a heal. The line still
 *  plays when the clamp heals 0 — the drain visibly happened (GB parity). */
function applyDrain(b: BattleState, mv: MoveDef, attacker: MonInstance, sp: MonSpecies, label: string, dmg: number): void {
  if (mv.effect !== 'drain' || dmg <= 0) return;
  const from = attacker.hp; // QOL.4: pre-heal hp for the draw-side tween
  attacker.hp = Math.min(maxHp(sp, attacker.lv), attacker.hp + drainHeal(dmg));
  b.hpAnim = { side: attacker === b.foe ? 'foe' : 'me', from, start: b.t };
  say(b, [label, 'drained health!']);
}

function doSwipe(b: BattleState): void {
  b.phase = 'anim';
  if (b.enc.trainer) {
    // the v2 heist gag: trainer battles let you pickpocket, once
    if (!b.stole) {
      b.stole = true;
      // RNK.0: steal perk applies here, at the moment coins land (base 15)
      const got = Math.floor(15 * (1 + perkPct('steal')));
      quest.coins += got;
      say(b, ['Swiped ' + got + ' coins', 'mid-battle!'], () => enemyTurn(b));
    } else {
      say(b, ['Nothing left', 'to swipe!'], () => (b.phase = 'menu'));
    }
    return;
  }
  if (b.enc.uncatchable) {
    say(b, ["It can't be", 'caught!'], () => (b.phase = 'menu'));
    return;
  }
  const ball = quest.items.indexOf(BALL_ITEM);
  if (ball < 0) {
    say(b, ['No ROKKET', 'BALLS left!'], () => (b.phase = 'menu'));
    return;
  }
  quest.items.splice(ball, 1);
  const sp = spec(b.foe);
  const p = catchChance(sp.catchRate, b.foe.hp, maxHp(sp, b.foe.lv));
  // Roll BEFORE the animation — the wobble count reads the outcome, it never
  // decides it (13-battle-fx.md hard rule; same rng-order guarantee as the
  // move rolls above).
  const caught = rollCatch(p, battleRng);
  say(b, ['You hurled a', 'ROKKET BALL!'], () => {
    playFx(b, caught ? 'throwOk' : 'throwFail', 'me', 'NORMAL', () => {
      if (caught) {
        b.caught = true; // the throwOk fx has ended (hideDefender reset); this keeps the foe hidden
        Audio2.sfx('item');
        say(b, ['Gotcha!', sp.name + ' was', 'caught!']);
        if (G.party.length < 4) G.party.push(b.foe);
        else {
          G.box.push(b.foe);
          say(b, ['Party full --', 'sent to the', 'MON LOCKER.']);
        }
        afterQueue(b, () => winBattle(b));
      } else {
        Audio2.sfx('hurt');
        say(b, ['Darn! It', 'broke free!'], () => enemyTurn(b));
      }
    });
  });
}

// ── ITEM: use a heal or the SMOKE BALL mid-battle (plan §4.5) ─────────────
/** Distinct pack items usable in battle (heals + SMOKE BALL), with counts. */
export function battleItems(): { id: string; count: number }[] {
  return packCounts(quest.items).filter((e) => usableInBattle(e.id));
}
function consume(id: string): void {
  const i = quest.items.indexOf(id);
  if (i >= 0) quest.items.splice(i, 1);
}
function openItemMenu(b: BattleState): void {
  if (battleItems().length === 0) {
    b.phase = 'anim';
    say(b, ['No usable', 'items!'], () => (b.phase = 'menu'));
    return;
  }
  b.phase = 'item';
  b.sel = 0;
}
function useItem(b: BattleState, id: string): void {
  const def = itemDef(id);
  if (def.kind === 'heal') {
    // QOL.6: heal items pick a target from the party first (SWITCH-style
    // list). SMOKE BALL below stays targetless — instant by design.
    Audio2.sfx('confirm');
    b.phase = 'target';
    b.pendingItem = id;
    b.sel = b.meIdx;
    return;
  }
  // key item — SMOKE BALL: guaranteed getaway; §4.8 also blows one stage off
  // the map's HEAT (3→2 cancels the lockdown) before the flee lands
  consume(id);
  reduceHeat(G.heatState, G.map.id, G.playSeconds);
  Audio2.sfx('item');
  b.phase = 'anim';
  say(b, ['Popped a', id + '!'], () => {
    playFx(b, 'smoke', 'me', 'NORMAL', () => {
      say(b, ['Slipped away in', 'the smoke!'], () => endBattleFlee(b));
    });
  });
}

/** QOL.6: resolve the pending heal item on the picked party slot. Fainted
 *  and full-hp targets refuse WITHOUT consuming (SODA does not revive —
 *  that's a later REVIVE item); a valid heal costs the turn even on a
 *  benched mon. */
function applyItemTarget(b: BattleState): void {
  const id = b.pendingItem!;
  const def = itemDef(id);
  const t = G.party[b.sel];
  const sp = SPECIES[t.species];
  if (t.hp <= 0) {
    Audio2.sfx('cancel');
    b.phase = 'anim';
    say(b, ["It's out cold!", "A SODA won't", 'wake it.'], () => (b.phase = 'target'));
    return;
  }
  if (t.hp >= maxHp(sp, t.lv)) {
    Audio2.sfx('cancel');
    b.phase = 'anim';
    say(b, [monName(t) + "'s HP", 'is already full!'], () => (b.phase = 'target'));
    return;
  }
  const wasActive = b.sel === b.meIdx;
  b.pendingItem = undefined;
  consume(id);
  const from = t.hp; // QOL.4: pre-heal hp for the draw-side tween
  const healed = applyHeal(t, sp, def);
  if (wasActive) b.hpAnim = { side: 'me', from, start: b.t };
  Audio2.sfx('item');
  b.phase = 'anim';
  say(b, ['Used ' + id + '!'], () => {
    if (wasActive) {
      // only the active mon is on screen — the heal fx has somewhere to play
      playFx(b, 'heal', 'me', 'NORMAL', () => {
        say(b, [monName(t) + ' got', 'back ' + healed + ' HP!'], () => enemyTurn(b));
      });
    } else {
      say(b, [monName(t) + ' got', 'back ' + healed + ' HP!'], () => enemyTurn(b));
    }
  });
}

function pickSwitch(b: BattleState): void {
  const target = G.party[b.sel];
  if (b.sel === b.meIdx || target.hp <= 0) {
    Audio2.sfx('cancel');
    return;
  }
  Audio2.sfx('confirm');
  const wasForced = b.forced;
  b.forced = false;
  if (!wasForced) say(b, ['Come back,', monName(active(b)) + '!']);
  b.meIdx = b.sel;
  if (!b.participants.includes(b.sel)) b.participants.push(b.sel); // QOL.7
  b.phase = 'anim';
  say(b, ['Go! ' + monName(active(b)) + '!'], () => (wasForced ? toMenu(b) : enemyTurn(b)));
}

function resolveReplace(b: BattleState, learn: boolean): void {
  const r = b.replace!;
  const mon = r.mon; // QOL.7: the leveling mon may be benched
  b.replace = undefined;
  b.phase = 'anim';
  if (learn) {
    Audio2.sfx('confirm');
    const old = mon.moves[b.sel];
    mon.moves[b.sel] = r.move;
    say(b, [monName(mon) + ' forgot', MOVES[old].name + '!']);
    say(b, ['It learned', MOVES[r.move].name + '!'], r.next);
  } else {
    Audio2.sfx('cancel');
    say(b, [monName(mon), 'kept its', 'old moves.'], r.next);
  }
}

function doFlee(b: BattleState): void {
  b.phase = 'anim';
  const lines = b.enc.trainer
    ? ['Got away safely!', '...' + b.enc.trainer + ' is', 'still there.']
    : ['Got away safely!'];
  say(b, lines, () => endBattleFlee(b));
}

// ── turn resolution ──────────────────────────────────────────────────────
/** Turn resolved — back to the root menu with the cursor on the entry the
 *  turn was taken with. b.sel is shared across menus, so without this the
 *  last submenu index would leak into the root menu (move 2 landing the
 *  cursor on SWIPE). Refusal paths ("No ROKKET BALLS left!") bypass it on
 *  purpose: no turn passed, and b.sel still holds the refused root entry. */
function toMenu(b: BattleState): void {
  b.phase = 'menu';
  b.sel = b.rootSel;
}

function enemyTurn(b: BattleState): void {
  const foeSp = spec(b.foe);
  const mon = active(b);
  const mv = MOVES[b.foe.moves[rollInt(0, b.foe.moves.length - 1, battleRng)]];
  say(b, [foeLabel(b), 'used ' + mv.name + '!'], () => {
    // Same rng-order guarantee as useMove: rolls first, effect after.
    if (battleRng() > mv.acc) {
      say(b, ['But it missed!'], () => toMenu(b));
      return;
    }
    const dmg = damage({ lv: b.foe.lv, move: mv, atk: foeSp.atk, def: spec(mon).def, defTypes: spec(mon).type }, battleRng);
    const mult = effectiveness(mv.type, spec(mon).type); // QOL.11: shared by the message and the float
    playFx(b, mv.anim, 'foe', mv.type, () => {
      Audio2.sfx('hurt');
      b.shakeMe = 14;
      mon.hp = Math.max(0, mon.hp - dmg);
      b.float = { side: 'me', amt: dmg, mult, start: b.t };
      sayEffectiveness(b, mult);
      applyDrain(b, mv, b.foe, foeSp, foeLabel(b), dmg);
      if (mon.hp <= 0) myMonFainted(b);
      else afterQueue(b, () => toMenu(b));
    });
  });
}

// QOL.7: the pool splits evenly — base = max(1, floor(pool / n)) — awarded
// in party order (offer order = party order). A single-participant battle
// has base === pool. ONB.1 then scales each recipient's base by
// lowLevelBoost(its pre-gain level) — split first, so same-level recipients
// still get identical shares.
function foeDefeated(b: BattleState): void {
  jobBattleWon(); // SIDE.1 hunt counter — quest-only, no rng, snapshots unaffected
  Audio2.sfx('faint'); // the sound of the fall, plays as the sprite starts sliding
  playFx(b, 'faint', 'foe', 'NORMAL', () => {
    say(b, [foeLabel(b), 'fainted!']);
    const recipients = [...b.participants].sort((x, y) => x - y).filter((i) => G.party[i] && G.party[i].hp > 0);
    const base = Math.max(1, Math.floor(xpFromWin(b.foe.lv) / Math.max(1, recipients.length)));
    const finish = (): void => {
      if (b.enc.winText.length) say(b, b.enc.winText, () => winBattle(b));
      else afterQueue(b, () => winBattle(b));
    };
    const award = (k: number): void => {
      if (k >= recipients.length) {
        finish();
        return;
      }
      const mon = G.party[recipients[k]];
      const fromLv = mon.lv; // UX2.1: capture the pre-gain bar position
      const fromXp = mon.xp;
      const share = Math.max(1, Math.floor(base * lowLevelBoost(fromLv)));
      say(b, [monName(mon) + ' gained', share + ' XP!']);
      const offers: MoveId[] = [];
      let pendingEvo: string | undefined;
      for (const ev of gainXp(mon, spec(mon), share)) {
        say(b, [monName(mon) + ' grew', 'to L' + ev.lv + '!']);
        for (const id of ev.learned) say(b, [monName(mon), 'learned', MOVES[id].name + '!']);
        offers.push(...ev.offered);
        pendingEvo = ev.evolvesTo ?? pendingEvo;
      }
      // UX2.1: arm the draw-only fill for the ACTIVE mon; it plays under the
      // award messages (no close gating — the juice rule outranks pacing).
      if (recipients[k] === b.meIdx) b.xpAnim = { segs: xpFillSegs(fromLv, fromXp, mon.lv, mon.xp), start: b.t };
      processOffers(b, mon, offers, () => {
        maybeEvolve(b, mon, pendingEvo, () => award(k + 1));
      });
    };
    award(0);
  });
}

// Evolution scene (SPR.0): offered after move-learn prompts, before winText.
// Cancellable per GB convention, but UX2.4 makes a CONFIRMED decline
// permanent (mon.noEvolve) — declining routes through resolveEvoConfirm's
// "NEVER EVOLVE?" prompt, not a free no-questions-asked cancel.
function maybeEvolve(b: BattleState, mon: MonInstance, to: string | undefined, then: () => void): void {
  if (!to || !SPECIES[to]) {
    then();
    return;
  }
  say(b, ['WHAT?'], () => {
    say(b, [monName(mon) + ' is', 'evolving!'], () => {
      b.phase = 'evolve';
      b.sel = 0;
      b.evolve = { mon, to, next: then };
    });
  });
}

function resolveEvolve(b: BattleState, accept: boolean): void {
  const e = b.evolve!;
  if (!accept) {
    // UX2.4: STOP no longer cancels on its own — refusing is permanent, so it
    // shares the mid-scene confirmation. b.evolve stays set so NO can go back.
    b.phase = 'evoConfirm';
    b.sel = 0; // default NO
    // no sfx here: menuInput already beeped this press ('cancel' on B,
    // 'confirm' on A) — a second note the same frame just doubles it
    return;
  }
  b.evolve = undefined;
  b.phase = 'evolveScene';
  b.evoScene = { mon: e.mon, to: e.to, start: b.t, next: e.next };
  Audio2.sfx('evolve');
}

/** The cinematic ran to its end (or was skipped into the reveal): commit the
 *  evolution. SPR.0's hp/move rules live in evolveMon and are untouched. */
function finishEvolve(b: BattleState): void {
  const s = b.evoScene!;
  const mon = s.mon; // QOL.7: a benched participant can evolve — never assume active
  b.evoScene = undefined;
  b.phase = 'anim';
  const from = spec(mon);
  const to = SPECIES[s.to];
  const oldName = monName(mon); // nick survives the swap; the label shouldn't
  evolveMon(mon, from, to);
  say(b, [oldName + ' evolved', 'into ' + to.name + '!'], s.next);
}

/** YES/NO on "NEVER EVOLVE?". YES is irreversible by design. */
function resolveEvoConfirm(b: BattleState, stopIt: boolean): void {
  if (!stopIt) {
    if (b.evoScene) {
      // resume from the frozen elapsed count, not from wherever b.t drifted to
      b.evoScene.start = b.t - b.evoScene.pausedAt!;
      b.evoScene.pausedAt = undefined;
      b.phase = 'evolveScene';
    } else {
      b.phase = 'evolve';
      b.sel = 0;
    }
    return;
  }
  const src = b.evoScene ?? b.evolve!;
  src.mon.noEvolve = true; // permanent — gainXp never offers this mon again
  b.evoScene = undefined;
  b.evolve = undefined;
  b.phase = 'anim';
  say(b, ['...it stopped.'], src.next);
}

function processOffers(b: BattleState, mon: MonInstance, offers: MoveId[], then: () => void): void {
  const next = offers.shift();
  if (!next) {
    then();
    return;
  }
  say(b, [monName(mon) + ' wants', 'to learn', MOVES[next].name + '!'], () => {
    b.phase = 'replace';
    b.sel = 0;
    b.replace = { mon, move: next, next: () => processOffers(b, mon, offers, then) };
  });
}

function myMonFainted(b: BattleState): void {
  Audio2.sfx('faint'); // the sound of the fall, plays as the sprite starts sliding
  playFx(b, 'faint', 'me', 'NORMAL', () => {
    say(b, [monName(active(b)), 'fainted!']);
    if (G.party.some((m) => m.hp > 0)) {
      say(b, ['Choose your', 'next mon!'], () => {
        b.phase = 'switch';
        b.forced = true;
        b.sel = G.party.findIndex((m) => m.hp > 0);
      });
      return;
    }
    if (b.enc.spar) {
      // SIDE.5: training loss — no disgrace tax, no HQ warp. The full-heal
      // mirrors the whiteout's (a wiped party walking the world is a state
      // the game has never allowed); the exit mirrors winBattle, so onLose
      // runs as a true epilogue instead of a post-whiteout one.
      say(b, ['No shame in a', 'practice loss!']);
      afterQueue(b, () => {
        for (const m of G.party) m.hp = maxHp(SPECIES[m.species], m.lv);
        G.battle = null;
        G.state = 'world';
        Audio2.play(G.map.music);
        b.done(b.enc.onLose.length ? b.enc.onLose : null);
      });
      return;
    }
    const lost = Math.floor(quest.coins * 0.1);
    say(b, ['You scurried', 'back to HQ in', 'disgrace...']);
    if (lost > 0) say(b, ['Dropped ' + lost, 'coins on the', 'way out!']);
    afterQueue(b, () => sharedWhiteout(lost, () => b.done(b.enc.onLose.length ? b.enc.onLose : null)));
  });
}

// ── battle exits (ScriptHooks contract: done(followUp | null)) ───────────
function endBattleFlee(b: BattleState): void {
  G.battle = null;
  G.state = 'world';
  Audio2.play(G.map.music);
  b.done(b.enc.onFlee.length ? b.enc.onFlee : null);
}
function winBattle(b: BattleState): void {
  G.battle = null;
  G.state = 'world';
  Audio2.play(G.map.music);
  b.done(b.enc.onWin.length ? b.enc.onWin : null);
}

