// LEVEL-UP pipeline, shared by the battle and the out-of-battle LEVEL CANDY
// scene (SIDE.7). Everything here was lifted verbatim out of battle.ts on
// 2026-08-22: the message pump, the move-replace prompt, the evolution
// offer, the UX2.4 cinematic and its refusal confirmation. A battle IS a
// LevelUpHost (BattleState satisfies the interface structurally); the
// candy scene builds a bare one over the world. Seeded battle snapshots
// are the gate — a byte of behaviour change here shows up there.
import type { MonInstance, MonSpecies, MoveId } from '../types';
import { SPECIES } from '../data/mons';
import { MOVES } from '../data/moves';
import { Input } from '../engine/input';
import { Audio2 } from '../engine/audio';
import { EVO_END, EVO_RAMP_END, EVO_SKIP_ARM, EVO_SKIP_TO } from './battleFx';
import { evolveMon, type LevelUpEvent } from './mon';
import { listInput } from './ui/listScreen';

export interface BattleMsg {
  lines: string[];
  after?: (() => void) | null;
  auto?: boolean;
}

export type LevelUpPhase = 'replace' | 'evolve' | 'evolveScene' | 'evoConfirm' | 'anim';

/** The slice of BattleState the level-up pipeline reads and writes. */
export interface LevelUpHost {
  phase: LevelUpPhase | string;
  t: number;
  sel: number; // selection in whichever menu is open
  msg: BattleMsg | null;
  msgChars: number;
  queue: BattleMsg[];
  replace?: { mon: MonInstance; move: MoveId; next: () => void }; // pending move-learn prompt
  evolve?: { mon: MonInstance; to: string; next: () => void }; // pending evolution prompt (SPR.0)
  /** UX2.4: the running cinematic. `pausedAt` freezes elapsed time while the
   *  refusal confirmation is up, so answering NO resumes exactly where it
   *  stopped instead of jumping. */
  evoScene?: { mon: MonInstance; to: string; start: number; pausedAt?: number; next: () => void };
}

export function spec(mon: MonInstance): MonSpecies {
  return SPECIES[mon.species];
}
export function monName(mon: MonInstance): string {
  return mon.nick ?? spec(mon).name;
}

export function say(h: LevelUpHost, lines: string[], after?: () => void): void {
  h.queue.push({ lines, after });
}

/** Chain fn onto whatever message is last in flight (or run now if none). */
export function afterQueue(h: LevelUpHost, fn: () => void): void {
  const last = h.queue[h.queue.length - 1] ?? h.msg;
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

/** Message pump: typewriter the current message, A (or `auto`) dismisses it,
 *  then pull the next from the queue. Returns true while a message holds the
 *  screen — the caller's phase logic waits. Call once per frame AFTER `h.t++`. */
export function pumpMessages(h: LevelUpHost, frame: number): boolean {
  if (h.msg) {
    const total = h.msg.lines.join('').length;
    if (h.msgChars < total) {
      h.msgChars += Input.held('a') || Input.held('b') ? 3 : 1;
      if (frame % 4 === 0) Audio2.sfx('blip');
    } else if (Input.hit('a') || (h.msg.auto && h.t % 50 === 0)) {
      const after = h.msg.after;
      h.msg = null;
      h.msgChars = 0;
      if (after) after();
    }
    return true;
  }
  if (h.queue.length) {
    h.msg = h.queue.shift()!;
    h.msgChars = 0;
    return true;
  }
  return false;
}

/** Shared vertical-menu input: up/down cycle, A confirms, B cancels (if allowed). */
export function menuInput(h: LevelUpHost, n: number, confirm: () => void, cancel?: () => void): void {
  h.sel = listInput(h.sel, n);
  if (Input.hit('a')) {
    confirm();
    return;
  }
  if (Input.hit('b') && cancel) {
    Audio2.sfx('cancel');
    cancel();
  }
}

/** Per-frame input for the four level-up phases. Returns false when `h.phase`
 *  is none of them, so the caller handles it. */
export function levelUpInput(h: LevelUpHost): boolean {
  switch (h.phase) {
    case 'replace':
      menuInput(
        h,
        h.replace!.mon.moves.length, // QOL.7: the leveling mon may be benched
        () => resolveReplace(h, true),
        () => resolveReplace(h, false),
      );
      return true;
    case 'evolve':
      menuInput(
        h,
        2, // EVOLVE / STOP
        () => resolveEvolve(h, h.sel === 0),
        () => resolveEvolve(h, false), // B = cancel, GB convention (now confirms)
      );
      return true;
    case 'evolveScene': {
      const s = h.evoScene!;
      const et = h.t - s.start;
      // Amendment to the frozen spec: the original `et >= EVO_SKIP_ARM` guard
      // had no upper bound, so A pressed again during the reveal (et already
      // in [EVO_SKIP_TO, EVO_END)) rebased `start` BACKWARDS and replayed the
      // reveal — mash A faster than every 45 frames and the scene never ends.
      // `et < EVO_SKIP_TO` closes the window once the skip has already fired.
      // If A and B land on the very same armed frame, A (skip) wins — checked
      // first, deliberately: skipping is idempotent-safe, cancelling isn't.
      if (Input.hit('a') && et >= EVO_SKIP_ARM && et < EVO_SKIP_TO) {
        s.start = h.t - EVO_SKIP_TO; // jump into the reveal; outcome unchanged
      } else if (Input.hit('a') && et >= EVO_END) {
        // UX2.4-FB: the scene holds on the fully revealed mon (name boxed)
        // and only hands back on A — no auto-continue.
        finishEvolve(h);
      } else if (Input.hit('b') && et < EVO_RAMP_END) {
        s.pausedAt = et;
        h.phase = 'evoConfirm';
        h.sel = 0; // default NO
        Audio2.sfx('cancel');
      }
      return true;
    }
    case 'evoConfirm':
      menuInput(
        h,
        2, // NO / YES
        () => resolveEvoConfirm(h, h.sel === 1),
        () => resolveEvoConfirm(h, false), // B backs out of the confirmation
      );
      return true;
  }
  return false;
}

/** Announce the level-ups `gainXp` returned — grew / learned lines, then the
 *  move-replace prompts, then the evolution offer — and call `then` when the
 *  whole chain has played out. */
export function announceLevelUps(h: LevelUpHost, mon: MonInstance, events: LevelUpEvent[], then: () => void): void {
  const offers: MoveId[] = [];
  let pendingEvo: string | undefined;
  for (const ev of events) {
    say(h, [monName(mon) + ' grew', 'to L' + ev.lv + '!']);
    for (const id of ev.learned) say(h, [monName(mon), 'learned', MOVES[id].name + '!']);
    offers.push(...ev.offered);
    pendingEvo = ev.evolvesTo ?? pendingEvo;
  }
  processOffers(h, mon, offers, () => {
    maybeEvolve(h, mon, pendingEvo, then);
  });
}

function resolveReplace(h: LevelUpHost, learn: boolean): void {
  const r = h.replace!;
  const mon = r.mon; // QOL.7: the leveling mon may be benched
  h.replace = undefined;
  h.phase = 'anim';
  if (learn) {
    Audio2.sfx('confirm');
    const old = mon.moves[h.sel];
    mon.moves[h.sel] = r.move;
    say(h, [monName(mon) + ' forgot', MOVES[old].name + '!']);
    say(h, ['It learned', MOVES[r.move].name + '!'], r.next);
  } else {
    Audio2.sfx('cancel');
    say(h, [monName(mon), 'kept its', 'old moves.'], r.next);
  }
}

// Evolution scene (SPR.0): offered after move-learn prompts, before winText.
// Cancellable per GB convention, but UX2.4 makes a CONFIRMED decline
// permanent (mon.noEvolve) — declining routes through resolveEvoConfirm's
// "NEVER EVOLVE?" prompt, not a free no-questions-asked cancel.
function maybeEvolve(h: LevelUpHost, mon: MonInstance, to: string | undefined, then: () => void): void {
  if (!to || !SPECIES[to]) {
    then();
    return;
  }
  say(h, ['WHAT?'], () => {
    say(h, [monName(mon) + ' is', 'evolving!'], () => {
      h.phase = 'evolve';
      h.sel = 0;
      h.evolve = { mon, to, next: then };
    });
  });
}

function resolveEvolve(h: LevelUpHost, accept: boolean): void {
  const e = h.evolve!;
  if (!accept) {
    // UX2.4: STOP no longer cancels on its own — refusing is permanent, so it
    // shares the mid-scene confirmation. h.evolve stays set so NO can go back.
    h.phase = 'evoConfirm';
    h.sel = 0; // default NO
    // no sfx here: menuInput already beeped this press ('cancel' on B,
    // 'confirm' on A) — a second note the same frame just doubles it
    return;
  }
  h.evolve = undefined;
  h.phase = 'evolveScene';
  h.evoScene = { mon: e.mon, to: e.to, start: h.t, next: e.next };
  Audio2.sfx('evolve');
}

/** The cinematic ran to its end (or was skipped into the reveal): commit the
 *  evolution. SPR.0's hp/move rules live in evolveMon and are untouched. */
function finishEvolve(h: LevelUpHost): void {
  const s = h.evoScene!;
  const mon = s.mon; // QOL.7: a benched participant can evolve — never assume active
  h.evoScene = undefined;
  h.phase = 'anim';
  const from = spec(mon);
  const to = SPECIES[s.to];
  const oldName = monName(mon); // nick survives the swap; the label shouldn't
  evolveMon(mon, from, to);
  say(h, [oldName + ' evolved', 'into ' + to.name + '!'], s.next);
}

/** YES/NO on "NEVER EVOLVE?". YES is irreversible by design. */
function resolveEvoConfirm(h: LevelUpHost, stopIt: boolean): void {
  if (!stopIt) {
    if (h.evoScene) {
      // resume from the frozen elapsed count, not from wherever h.t drifted to
      h.evoScene.start = h.t - h.evoScene.pausedAt!;
      h.evoScene.pausedAt = undefined;
      h.phase = 'evolveScene';
    } else {
      h.phase = 'evolve';
      h.sel = 0;
    }
    return;
  }
  const src = h.evoScene ?? h.evolve!;
  src.mon.noEvolve = true; // permanent — gainXp never offers this mon again
  h.evoScene = undefined;
  h.evolve = undefined;
  h.phase = 'anim';
  say(h, ['...it stopped.'], src.next);
}

function processOffers(h: LevelUpHost, mon: MonInstance, offers: MoveId[], then: () => void): void {
  const next = offers.shift();
  if (!next) {
    then();
    return;
  }
  say(h, [monName(mon) + ' wants', 'to learn', MOVES[next].name + '!'], () => {
    h.phase = 'replace';
    h.sel = 0;
    h.replace = { mon, move: next, next: () => processOffers(h, mon, offers, then) };
  });
}
