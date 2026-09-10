// BATTLE — classic GB layout: enemy top-right, player back bottom-left.
// Phase 1b: the engine runs on the mon model (plan §4.1/§4.3/§4.4) — the
// player side is the party in G, encounters reference SPECIES, and damage/
// XP/catching come from the pure systems modules. The ScriptHooks contract
// is unchanged: startBattle(id, done) hands follow-up ScriptSteps back.
import { G } from '../state';
import type { CoachBeat, EncounterDef, MonInstance, MonSpecies, MoveDef, MoveId, ScriptStep } from '../types';
import { ENCOUNTERS } from '../data/encounters';
import { SPECIES } from '../data/mons';
import { MOVES } from '../data/moves';
import { effectiveness } from '../data/typeChart';
import { Audio2 } from '../engine/audio';
import { rollInt, type Rng } from '../engine/rng';
import { damage, drainHeal } from './combat';
import { playFx, tickFx, type ActiveFx } from './battleFx';
import { makeMon, maxHp, gainXp, xpFillSegs, type XpFillSeg } from './mon';
// SIDE.7: the level-up pipeline (message pump, move-replace, evolution
// offer + cinematic) lives in levelUp.ts so the LEVEL CANDY scene can run
// it outside a battle. BattleState is a LevelUpHost structurally.
import { say, afterQueue, pumpMessages, menuInput, levelUpInput, announceLevelUps, spec, monName, type BattleMsg } from './levelUp';
export { spec, monName } from './levelUp';
import { catchChance, rollCatch } from './catch';
import { itemDef, applyHeal, usableInBattle, packCounts } from './inventory';
import { quest, checkCond } from './quest';
import { jobBattleWon } from './jobs';
import { sharedWhiteout } from './recovery';
import { reduceHeat, heatKey } from './heat';
import { perkPct } from './perks';
import { tryInflict, poisonDamage, beforeAction, statusCatchMod, STATUS_LINES } from './status';

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
  /** F43 BALL.1-FB (Lyall, 2026-09-09): the ITEM list is showing BALLS ONLY —
   *  SWIPE opened it because more than one kind of ball is held. B returns
   *  the cursor to SWIPE, not ITEM. */
  ballPick?: boolean;
  stole?: boolean; // trainer-battle SWIPE gag already fired — ONB.5 reads it as "the player has swiped"
  /** ONB.5 — is this battle a coaching one at all? Resolved ONCE in
   *  startBattle, because `coachIf` reads world flags that the encounter's
   *  own onWin may set the moment the fight ends. */
  coachOn: boolean;
  coached?: CoachBeat['on'][]; // ONB.5 — beats already spoken this battle
  healed?: boolean; // ONB.5 — a heal item was actually consumed (a refused heal doesn't count)
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
export function rootHelp(sel: number, trainer: boolean, spent = false): string {
  switch (sel) {
    case 0:
      return 'PICK A MOVE.';
    case 1:
      // ONB.5-FB: a trainer can only be picked once, and nothing used to say
      // so — the entry sat there reading "PICKPOCKET COINS." after it was
      // spent, so the only way to learn was to waste a press on the refusal.
      if (spent) return 'ALREADY SWIPED.';
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

/** QOL.12: SWITCH/target-list row — name, active marker, and either hp/maxHp
 *  or (FB review) the status tag REPLACING it — the same HUD stand-in
 *  pattern as battleDraw's level/status swap (13-battle-fx.md): a status
 *  tag appended after hp/maxHp overflowed the 15-char wide-list column on a
 *  long name. hp is still one tap away on the detail screen. Pure formatter
 *  so the column width is lint-tested against every real species
 *  (mon-data-lint precedent). */
export function partyRow(mon: MonInstance, sp: MonSpecies, active: boolean): string {
  const name = mon.nick ?? sp.name;
  const stat = mon.status ?? mon.hp + '/' + maxHp(sp, mon.lv);
  return (active ? '*' : '') + name + ' ' + stat;
}
export function active(b: BattleState): MonInstance {
  return G.party[b.meIdx];
}
function foeLabel(b: BattleState): string {
  return (b.enc.trainer ? 'Enemy ' : 'Wild ') + spec(b.foe).name;
}

/** ONB.5-FB: the foe as this encounter wants it — species + level as always,
 *  with an optional per-encounter moveset overriding the learnset. Stats are
 *  untouched, so xp yield and the level curve stay exactly where they were. */
function makeFoe(enc: EncounterDef): MonInstance {
  const foe = makeMon(SPECIES[enc.foe.species], enc.foe.lv);
  if (enc.foe.moves) foe.moves = [...enc.foe.moves];
  return foe;
}

// CH2.1: accepts a ready EncounterDef too — wild rolls build theirs on the
// fly (encounter.ts wildEncounter) instead of registering ids in ENCOUNTERS.
// ScriptHooks.battle stays string-typed; this takes a superset.
export function startBattle(encounter: string | EncounterDef, done: (followUp: ScriptStep[] | null) => void): void {
  const enc = typeof encounter === 'string' ? ENCOUNTERS[encounter] : encounter;
  Audio2.play(enc.music ?? 'battle'); // CH5.0 §2: a set piece brings its own track
  G.battle = {
    enc,
    done,
    phase: 'slide',
    t: 0,
    sel: 0,
    rootSel: 0,
    meIdx: Math.max(0, G.party.findIndex((m) => m.hp > 0)),
    participants: [Math.max(0, G.party.findIndex((m) => m.hp > 0))],
    foe: makeFoe(enc),
    coachOn: !!enc.spar && !!enc.coach && (!enc.coachIf || checkCond(enc.coachIf)),
    msg: null,
    msgChars: 0,
    queue: [],
    shakeFoe: 0,
    shakeMe: 0,
  };
  G.state = 'battle';
  trace(`--- battle ${typeof encounter === 'string' ? encounter : enc.foe.species} (coachOn=${G.battle.coachOn}) ---`);
}

/** ONB.5-FB: dev-only trace of the SWIPE/coaching interplay. Lyall hit
 *  "Nothing left to swipe!" straight after the SWIPE nudge — a pairing the
 *  code says is impossible (both read `b.stole`) and that a browser hunt
 *  could not reproduce. Rather than keep guessing, record what actually
 *  happens so a recurrence is captured instead of reconstructed afterwards.
 *  Read it from `__debug.battleTrace`. Stripped from production builds. */
export const battleTrace: string[] = [];
function trace(line: string): void {
  if (!import.meta.env.DEV) return;
  battleTrace.push(line);
  if (battleTrace.length > 100) battleTrace.shift();
}

/** ONB.5: queue the trainer's coaching line for `on`, if this battle has one
 *  that hasn't fired and isn't already old news. Returns whether it spoke, so
 *  a caller can let one beat pre-empt another on the same event.
 *
 *  The `spar` check is the whole scope gate: a real fight never reads the
 *  table, so no amount of bad data can make Giovanni's grunts offer tips. */
function coach(b: BattleState, on: CoachBeat['on']): boolean {
  if (!b.coachOn) return false;
  const beat = b.enc.coach!.find((c) => c.on === on);
  if (!beat) return false;
  const fired = (b.coached ??= []);
  if (fired.includes(on)) return false;
  if (beat.unless === 'swiped' && b.stole) {
    trace(`coach ${on}: SUPPRESSED (already swiped)`);
    return false;
  }
  if (beat.unless === 'itemUsed' && b.healed) {
    trace(`coach ${on}: SUPPRESSED (already healed)`);
    return false;
  }
  fired.push(on);
  trace(`coach ${on}: FIRED (stole=${!!b.stole} healed=${!!b.healed})`);
  say(b, beat.say);
  return true;
}

/** CH5.0 §4: a party mon with `talk` pages speaks as it takes the field —
 *  battle open and every switch-in. The page rotates through a saved
 *  counter (the sayCycle idiom), so Myowth's four lines come round in order
 *  across battles instead of repeating the first one. */
function monTalk(b: BattleState): void {
  const mon = active(b);
  const pages = spec(mon).talk;
  if (!pages?.length) return;
  const key = 'talk_' + mon.species;
  const n = quest.vars[key] ?? 0;
  quest.vars[key] = n + 1;
  say(b, pages[n % pages.length]);
}

export function battleUpdate(): void {
  const b = G.battle!;
  b.t++;
  if (pumpMessages(b, G.frame)) return;
  if (levelUpInput(b)) return; // replace / evolve / evolveScene / evoConfirm

  switch (b.phase) {
    case 'slide':
      if (b.t > 40) {
        b.phase = 'open';
        if (b.enc.trainer) say(b, wrapWords(b.enc.trainer + ' sent out ' + spec(b.foe).name + '!'));
        else say(b, ['Wild ' + spec(b.foe).name, 'appeared!']);
        say(b, ['Go! ' + monName(active(b)) + '!']);
        monTalk(b); // CH5.0 §4 — a talker's line rides right behind "Go!"
        if (b.enc.unwinnable) say(b, b.enc.unwinnable.hint); // CH5-FB — the way out, said up front
        coach(b, 'firstTurn'); // ONB.5 — lands after "Go! …", before the menu
        afterQueue(b, () => toMenu(b));
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
          b.sel = b.ballPick ? 1 : 3; // back to SWIPE when SWIPE opened the list
          b.ballPick = false;
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
  // F43 STA.1: the status gate runs BEFORE the "used" line — a healthy mon
  // never touches battleRng here (beforeAction only rolls for PAR), so a
  // status-free fight's rng order is untouched. Read the status before the
  // gate call: 'wake' clears it, so the skip/wake line still needs to know
  // what it was.
  const priorStatus = mon.status;
  const gate = beforeAction(mon, battleRng);
  if (gate !== 'act') {
    say(b, gate === 'wake' ? STATUS_LINES.wake(monName(mon)) : STATUS_LINES.skip[priorStatus as 'PAR' | 'SLP'](monName(mon)), () => endPlayerAction(b));
    return;
  }
  say(b, [monName(mon) + ' used', mv.name + '!'], () => {
    // Accuracy AND damage rolls stay in their pre-FX order; the effect plays
    // between them without touching battleRng (13-battle-fx.md hard rule).
    if (battleRng() > mv.acc) {
      say(b, ['But it missed!'], () => endPlayerAction(b));
      return;
    }
    const dmg = damage({ lv: mon.lv, move: mv, atk: spec(mon).atk, def: foeSp.def, defTypes: foeSp.type }, battleRng);
    // QOL.11: one effectiveness() call shared by the message and the float —
    // never re-roll or recompute (13-battle-fx.md hard rule, same as the fx).
    const mult = effectiveness(mv.type, foeSp.type);
    playFx(b, mv.anim, 'me', mv.type, () => {
      if (b.enc.unwinnable) {
        // CH5.0 §2: nothing lands on a spirit — no hp, no float, no drain,
        // no status (the rolls above already happened; rng order untouched).
        say(b, ['But it passed', 'right through!']);
        say(b, b.enc.unwinnable.hint, () => endPlayerAction(b)); // CH5-FB — and again every time a hit fails
        return;
      }
      if (mv.power === 0) {
        // F43 STA.1: a status-only move (hypno) — no damage, shake, float,
        // effectiveness or drain, just the inflict roll.
        inflictLine(b, b.foe, mv, foeLabel(b));
        endPlayerAction(b);
        return;
      }
      Audio2.sfx('hit');
      b.shakeFoe = 14;
      b.foe.hp = Math.max(0, b.foe.hp - dmg);
      b.float = { side: 'foe', amt: dmg, mult, start: b.t };
      sayEffectiveness(b, mult);
      applyDrain(b, mv, mon, spec(mon), monName(mon), dmg);
      inflictLine(b, b.foe, mv, foeLabel(b));
      // A KO ends the turn without the attacker's own poison tick — the tick
      // is the tail of an action, and a faint (either side) is the exit (GB).
      if (b.foe.hp <= 0) foeDefeated(b);
      else endPlayerAction(b);
    });
  });
}

/** F43 STA.1: roll `mv.status` on a target that just took a landed hit (or,
 *  for a power-0 move, the move's only effect). No-op on a fainted target
 *  or a move with no status — tryInflict's own guards handle "already
 *  statused" and the chance roll.
 *  F43-FB A6: a target immune to the move's TYPE (effectiveness 0, e.g.
 *  GROUND vs ELECTRIC) can never be inflicted by it either — skipped before
 *  the roll so no extra rng is consumed on an immune hit. */
function inflictLine(b: BattleState, target: MonInstance, mv: MoveDef, label: string): void {
  if (target.hp <= 0 || effectiveness(mv.type, spec(target).type) === 0) return;
  if (tryInflict(target, mv, battleRng)) say(b, STATUS_LINES.inflict[target.status!](label));
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
      trace(`swipe: OK (+${got} coins)`);
      say(b, ['Swiped ' + got + ' coins', 'mid-battle!'], () => endPlayerAction(b));
    } else {
      trace('swipe: REFUSED (stole already true)');
      say(b, ['Nothing left', 'to swipe!'], () => (b.phase = 'menu'));
    }
    return;
  }
  if (b.enc.uncatchable) {
    say(b, ["It can't be", 'caught!'], () => (b.phase = 'menu'));
    return;
  }
  // F43 BALL.1-FB (Lyall, 2026-09-09): SWIPE throws whatever ball is held —
  // one kind throws it straight away; more than one opens a balls-only pick
  // (the ITEM list filtered), so a PRO BALL never needs the ITEM menu.
  const kinds = packCounts(quest.items).filter((e) => itemDef(e.id).kind === 'ball');
  if (kinds.length === 0) {
    say(b, ['No balls', 'left!'], () => (b.phase = 'menu'));
    return;
  }
  if (kinds.length === 1) {
    throwBall(b, kinds[0].id);
    return;
  }
  b.phase = 'item';
  b.ballPick = true;
  b.sel = 0;
}

/** Throw one `item` (already known to be held) at a wild foe. SWIPE throws
 *  the ROKKET BALL (mod 1); the ITEM menu throws any ball with a ballMod
 *  above 1 — F43 BALL.1, the PRO BALL. One path, one rng call, the wobble
 *  fx untouched; the mod is the only difference. */
function throwBall(b: BattleState, item: string): void {
  consume(item);
  const sp = spec(b.foe);
  const p = catchChance(sp.catchRate, b.foe.hp, maxHp(sp, b.foe.lv), itemDef(item).ballMod ?? 1, statusCatchMod(b.foe.status));
  // Roll BEFORE the animation — the wobble count reads the outcome, it never
  // decides it (13-battle-fx.md hard rule; same rng-order guarantee as the
  // move rolls above).
  const caught = rollCatch(p, battleRng);
  say(b, ['You hurled a', item + '!'], () => {
    playFx(b, caught ? 'throwOk' : 'throwFail', 'me', 'NORMAL', () => {
      if (caught) {
        b.caught = true; // the throwOk fx has ended (hideDefender reset); this keeps the foe hidden
        Audio2.sfx('catch'); // JCE.1
        if (b.foe.status === 'PAR') b.foe.status = undefined; // F43-FB A6 — foe joins outside G.party, clear it here
        say(b, ['Gotcha!', sp.name + ' was', 'caught!']);
        if (G.party.length < 4) G.party.push(b.foe);
        else {
          G.box.push(b.foe);
          say(b, ['Party full --', 'sent to the', 'MON LOCKER.']);
        }
        afterQueue(b, () => winBattle(b));
      } else {
        Audio2.sfx('hurt');
        say(b, ['Darn! It', 'broke free!'], () => endPlayerAction(b));
      }
    });
  });
}

// ── ITEM: use a heal or the SMOKE BALL mid-battle (plan §4.5) ─────────────
/** Distinct pack items usable in battle, with counts: heals and cure items
 *  (TONIC) plus SMOKE BALL — or, in an unwinnable fight, heals/cures plus
 *  the one item it answers to (CH5.0 §2; SMOKE BALL is simply not on the
 *  list there). */
export function battleItems(enc: Pick<EncounterDef, 'unwinnable'> | null = G.battle?.enc ?? null): { id: string; count: number }[] {
  if (G.battle?.ballPick) return packCounts(quest.items).filter((e) => itemDef(e.id).kind === 'ball');
  const keys = enc?.unwinnable ? [enc.unwinnable.item] : ['SMOKE BALL'];
  return packCounts(quest.items).filter((e) => usableInBattle(e.id, keys));
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
  if (def.kind === 'heal' || def.kind === 'cure') {
    // QOL.6: heal items pick a target from the party first (SWITCH-style
    // list). SMOKE BALL below stays targetless — instant by design.
    // F43-FB A4: TONIC ('cure') shares the same target pick as a heal.
    Audio2.sfx('confirm');
    b.phase = 'target';
    b.pendingItem = id;
    b.sel = b.meIdx;
    return;
  }
  if (def.kind === 'ball') {
    // F43 BALL.1: a ball from the pack (or SWIPE's pick) — the SWIPE
    // refusals apply (a trainer's mon, an uncatchable), then the shared throw
    b.ballPick = false;
    if (b.enc.trainer || b.enc.uncatchable) {
      b.phase = 'anim';
      say(b, b.enc.trainer ? ["Can't catch a", "trainer's mon!"] : ["It can't be", 'caught!'], () => (b.phase = 'menu'));
      return;
    }
    b.phase = 'anim';
    throwBall(b, id);
    return;
  }
  if (b.enc.unwinnable && id === b.enc.unwinnable.item) {
    // CH5.0 §2: the one item this fight answers to. Consumed; the encounter's
    // onWin tells the story. No xp — nothing was defeated.
    consume(id);
    Audio2.sfx('item');
    b.phase = 'anim';
    say(b, ['The ' + id, 'glows softly...'], () => winBattle(b));
    return;
  }
  // key item — SMOKE BALL: guaranteed getaway; §4.8 also blows one stage off
  // the map's HEAT (3→2 cancels the lockdown) before the flee lands
  consume(id);
  reduceHeat(G.heatState, heatKey(G.map), G.playSeconds);
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
    // FB review: a fainted mon refuses EVERY pack item the same way — a
    // status cure included. TONIC doesn't revive; that's still only the
    // bunk/whiteout path (QOL.6 rule), so this check runs before the cure
    // branch, not after it.
    Audio2.sfx('cancel');
    b.phase = 'anim';
    say(b, ["It's out cold!", "A SODA won't", 'wake it.'], () => (b.phase = 'target'));
    return;
  }
  if (def.kind === 'cure') {
    // F43-FB A4: TONIC — clears status on any living target, benched
    // included; a healthy target refuses without consuming, like the heal
    // misses below.
    if (!t.status) {
      Audio2.sfx('cancel');
      b.phase = 'anim';
      say(b, [monName(t) + ' is', 'not sick!'], () => (b.phase = 'target'));
      return;
    }
    b.pendingItem = undefined;
    consume(id);
    t.status = undefined;
    t.sleepT = undefined;
    Audio2.sfx('item');
    b.phase = 'anim';
    say(b, [monName(t), 'shook it off!'], () => afterQueue(b, () => endPlayerAction(b)));
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
  b.healed = true; // ONB.5 — only a heal that actually lands counts as learnt
  const from = t.hp; // QOL.4: pre-heal hp for the draw-side tween
  const healed = applyHeal(t, sp, def);
  if (wasActive) b.hpAnim = { side: 'me', from, start: b.t };
  Audio2.sfx('item');
  b.phase = 'anim';
  say(b, ['Used ' + id + '!'], () => {
    if (wasActive) {
      // only the active mon is on screen — the heal fx has somewhere to play
      playFx(b, 'heal', 'me', 'NORMAL', () => {
        say(b, [monName(t) + ' got', 'back ' + healed + ' HP!']);
        coach(b, 'itemUsed'); // ONB.5 — praise the lesson, point at the next one
        afterQueue(b, () => endPlayerAction(b));
      });
    } else {
      say(b, [monName(t) + ' got', 'back ' + healed + ' HP!']);
      coach(b, 'itemUsed');
      afterQueue(b, () => endPlayerAction(b));
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
  say(b, ['Go! ' + monName(active(b)) + '!']);
  monTalk(b); // CH5.0 §4 — switch-ins talk too
  // F43 STA.1: stays on enemyTurn, not endPlayerAction — a voluntary switch
  // is not the switched-in mon's action, so no poison tick fires on it here
  // (GB parity: a poisoned mon you bench doesn't tick until it next acts).
  afterQueue(b, () => (wasForced ? toMenu(b) : enemyTurn(b)));
}

/** CH4 playtest: word-wrap a GENERATED battle line to the box's 17-glyph
 *  cap. Trainer names are data — SECURITY CHIEF is 14 glyphs — so the old
 *  hand-split templates ('...NAME is' / 'NAME sent out') clipped mid-word
 *  the first time a name outgrew the GUARD/BRAD/KIRA it was split around.
 *  Authored text (winText, say pages) is linted at 17 and never comes here. */
export function wrapWords(text: string, w = 17): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    if (line && line.length + 1 + word.length > w) {
      out.push(line);
      line = word;
    } else line = line ? line + ' ' + word : word;
  }
  if (line) out.push(line);
  return out;
}

function doFlee(b: BattleState): void {
  b.phase = 'anim';
  if (b.enc.unwinnable) {
    // CH5.0 §2: no way out but the item (or the clean loss). No turn passes.
    say(b, ["Can't escape!"], () => toMenu(b));
    return;
  }
  const lines = b.enc.trainer
    ? ['Got away safely!', ...wrapWords('...' + b.enc.trainer + ' is still there.')]
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

/** F43 STA.1: poison ticks at the end of whichever side just acted, before
 *  the turn hands over — `side` is who just acted, which is also who just
 *  took the hit in poisonTick's callers (the attacker never poisons
 *  itself). poisonDamage doesn't roll, so a fight with nobody poisoned
 *  never touches battleRng here — the hand-over is byte-identical to the
 *  pre-status code. A faint from the tick exits exactly like a faint from
 *  a hit would. */
function poisonTick(b: BattleState, side: 'me' | 'foe', then: () => void): void {
  const mon = side === 'me' ? active(b) : b.foe;
  const label = side === 'me' ? monName(mon) : foeLabel(b);
  const dmg = poisonDamage(mon, maxHp(spec(mon), mon.lv));
  if (dmg === 0) {
    then();
    return;
  }
  // The hp drop, float and sfx land the frame the poison line SHOWS (the
  // say `show` hook) — never while the hit's own float is still on screen,
  // and never in the same frame as the hit on a neutral tackle that queued
  // nothing (afterQueue would have run it immediately there).
  say(
    b,
    STATUS_LINES.poison(label),
    () => {
      if (mon.hp > 0) then();
      else if (side === 'me') myMonFainted(b);
      else foeDefeated(b);
    },
    () => {
      const from = mon.hp; // QOL.4: pre-tick hp for the draw-side tween
      mon.hp = Math.max(0, mon.hp - dmg);
      b.hpAnim = { side, from, start: b.t };
      b.float = { side, amt: dmg, mult: 1, start: b.t };
      Audio2.sfx('hurt');
    },
  );
}
function endPlayerAction(b: BattleState): void {
  poisonTick(b, 'me', () => enemyTurn(b));
}
function endFoeAction(b: BattleState): void {
  poisonTick(b, 'foe', () => afterQueue(b, () => toMenu(b)));
}

function enemyTurn(b: BattleState): void {
  const mon = active(b);
  // F43 STA.1: same gate as useMove, on the foe. A healthy foe never touches
  // battleRng here, so a status-free fight rolls exactly as before.
  const priorStatus = b.foe.status;
  const gate = beforeAction(b.foe, battleRng);
  if (gate !== 'act') {
    say(b, gate === 'wake' ? STATUS_LINES.wake(foeLabel(b)) : STATUS_LINES.skip[priorStatus as 'PAR' | 'SLP'](foeLabel(b)), () => endFoeAction(b));
    return;
  }
  const foeSp = spec(b.foe);
  const mv = MOVES[b.foe.moves[rollInt(0, b.foe.moves.length - 1, battleRng)]];
  say(b, [foeLabel(b), 'used ' + mv.name + '!'], () => {
    // Same rng-order guarantee as useMove: rolls first, effect after.
    if (battleRng() > mv.acc) {
      say(b, ['But it missed!'], () => endFoeAction(b));
      return;
    }
    const dmg = damage({ lv: b.foe.lv, move: mv, atk: foeSp.atk, def: spec(mon).def, defTypes: spec(mon).type }, battleRng);
    const mult = effectiveness(mv.type, spec(mon).type); // QOL.11: shared by the message and the float
    playFx(b, mv.anim, 'foe', mv.type, () => {
      if (mv.power === 0) {
        // F43 STA.1: a status-only foe move — no damage, shake, float,
        // effectiveness or drain, just the inflict roll.
        inflictLine(b, mon, mv, monName(mon));
        endFoeAction(b);
        return;
      }
      Audio2.sfx('hurt');
      b.shakeMe = 14;
      mon.hp = Math.max(0, mon.hp - dmg);
      b.float = { side: 'me', amt: dmg, mult, start: b.t };
      sayEffectiveness(b, mult);
      applyDrain(b, mv, b.foe, foeSp, foeLabel(b), dmg);
      inflictLine(b, mon, mv, monName(mon));
      if (mon.hp <= 0) myMonFainted(b);
      else {
        // ONB.5: the hit the player just took is the teachable moment. The
        // first-blood nudge pre-empts the low-hp one — two lessons on a
        // single hit is nagging, not coaching.
        if (!coach(b, 'playerHurt') && mon.hp * 3 < maxHp(spec(mon), mon.lv)) coach(b, 'lowHp');
        endFoeAction(b);
      }
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
      const events = gainXp(mon, spec(mon), share);
      // UX2.1: arm the draw-only fill for the ACTIVE mon; it plays under the
      // award messages (no close gating — the juice rule outranks pacing).
      if (recipients[k] === b.meIdx) b.xpAnim = { segs: xpFillSegs(fromLv, fromXp, mon.lv, mon.xp), start: b.t };
      announceLevelUps(b, mon, events, () => award(k + 1));
    };
    award(0);
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
    if (b.enc.spar || b.enc.unwinnable) {
      // SIDE.5: training loss — no disgrace tax, no HQ warp. The full-heal
      // mirrors the whiteout's (a wiped party walking the world is a state
      // the game has never allowed); the exit mirrors winBattle, so onLose
      // runs as a true epilogue instead of a post-whiteout one.
      // CH5.0 §2: an unwinnable fight loses the same clean way — the hint
      // for next time lives in its onLose.
      say(b, b.enc.unwinnable ? ['Overwhelmed...', 'You stumble', 'back.'] : ['No shame in a', 'practice loss!']);
      afterQueue(b, () => {
        for (const m of G.party) m.hp = maxHp(SPECIES[m.species], m.lv);
        shakeOffParalysis(); // F43-FB A6 — the full-heal above only clears hp; this clears PAR too
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
  shakeOffParalysis(); // F43-FB A6
  G.battle = null;
  G.state = 'world';
  Audio2.play(G.map.music);
  b.done(b.enc.onFlee.length ? b.enc.onFlee : null);
}
function winBattle(b: BattleState): void {
  shakeOffParalysis(); // F43-FB A6
  G.battle = null;
  G.state = 'world';
  Audio2.play(G.map.music);
  // CH7.0 §5: a catch prefers onCatch when the encounter has one — the
  // VOLTRAWK set piece is the first fight whose ending depends on HOW
  const steps = b.caught && b.enc.onCatch ? b.enc.onCatch : b.enc.onWin;
  b.done(steps.length ? steps : null);
}

/** F43-FB A6: PAR wears off the moment a battle ends (won, fled, or a
 *  spar/unwinnable loss) — PSN and SLP persist. The whiteout path
 *  (recovery.ts's sharedWhiteout) now clears status too, so it needs no
 *  separate call here. */
function shakeOffParalysis(): void {
  for (const m of G.party) if (m.status === 'PAR') m.status = undefined;
}

