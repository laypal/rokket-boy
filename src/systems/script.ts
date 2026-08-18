// Script interpreter (plan §3.3). Replaces the npcDialog()/interact() switches:
// map content is data (ScriptStep[]), engine effects go through an injected
// hooks interface so the interpreter is unit-testable with fakes.
import type { ScriptStep, WarpDef } from '../types';
import { quest, checkCond, rankUp } from './quest';

export interface ScriptHooks {
  /** Open dialogue; call done() when the last page is dismissed. */
  say(pages: string[][], done: () => void): void;
  /** Run encounter; call done() with the result's follow-up steps (or null). */
  battle(encounterId: string, done: (followUp: ScriptStep[] | null) => void): void;
  /** Fade-warp the player; call done() once the new map is active. */
  warp(w: WarpDef, done: () => void): void;
  sfx(name: string): void;
  music(name: string): void;
  setTile(x: number, y: number, ch: string): void;
  addWarp(key: string, w: WarpDef): void;
  /** Open the MON LOCKER terminal; call done() when the player backs out. */
  locker(done: () => void): void;
  /** Open a vendor shop; call done() when the player leaves. */
  shop(shopId: string, done: () => void): void;
  /** Show the mission-complete card. */
  endScreen(): void;
  /** Show the full-screen rank card for the freshly awarded rank (§4.7);
   *  call done() when the player dismisses it. */
  rankUp(newRank: string, done: () => void): void;
  /** Set the current map's HEAT stage 0..3 (§4.8). Synchronous, no done
   *  callback — same class as sfx; the interpreter falls straight through. */
  heat(n: number): void;
  /** Grant a mon (CH2.3 gift scenes): party if there's room, else the MON
   *  LOCKER box. Synchronous like sfx — the granting script says its own
   *  fanfare lines. */
  giveMon(species: string, lv: number): void;
  /** Cutscene (CH2.7 ambushes): the named NPC on the current map runs to
   *  the player while input is frozen; call done() once it stands
   *  cardinally adjacent (or the runtime gives up and snaps it there).
   *  A missing/gone NPC resolves immediately. */
  npcRun(id: string, done: () => void): void;
  /** Full-heal + revive the whole party (QOL.9, the HQ bunk rest — the
   *  whiteout's heal body without the coin penalty or warp). Synchronous
   *  like sfx/heat; the bunk script says its own lines. */
  healParty(): void;
  /** Timed system toast over the world view (CH2.10) — game-voice
   *  confirmation, distinct from NPC say. Synchronous like sfx: the toast
   *  runs on its own timer, the script never waits for it. */
  sysMsg(lines: string[]): void;
  /** Open the HQ job board (SIDE.1); call done() when the player leaves —
   *  the locker/shop suspension class. */
  jobs(done: () => void): void;
  /** Ask a YES/NO question (2026-08-15): show the pages, a picker on the
   *  last one; call done(true|false) with the answer. Exists because
   *  "talking IS consent" bit players who mash A through a heal — repeat
   *  visits should be a choice, not an accident. */
  choice(pages: string[][], done: (yes: boolean) => void): void;
  /** Open the DEALER's PICKPOCKET table (SIDE.2); call done() when the
   *  player leaves — the locker/shop/jobs suspension class. */
  cardFlip(done: () => void): void;
}

interface Frame {
  steps: ScriptStep[];
  i: number;
}

/**
 * Run steps sequentially. Async steps (say/battle/warp) suspend until their
 * hook completes; everything else mutates quest/map state synchronously.
 */
export function runScript(steps: ScriptStep[], hooks: ScriptHooks, onDone?: () => void): void {
  const stack: Frame[] = [{ steps, i: 0 }];

  const next = (): void => {
    for (;;) {
      const f = stack[stack.length - 1];
      if (!f) {
        onDone?.();
        return;
      }
      if (f.i >= f.steps.length) {
        stack.pop();
        continue;
      }
      const step = f.steps[f.i++];

      if ('say' in step) {
        hooks.say(step.say, next);
        return;
      }
      if ('sayCycle' in step) {
        const { counter, dialogs } = step.sayCycle;
        const idx = (quest.vars[counter] ?? 0) % dialogs.length;
        hooks.say(dialogs[idx], next);
        return;
      }
      if ('battle' in step) {
        hooks.battle(step.battle, (followUp) => {
          if (followUp) stack.push({ steps: followUp, i: 0 });
          next();
        });
        return;
      }
      if ('warp' in step) {
        hooks.warp(step.warp, next);
        return;
      }
      if ('if' in step) {
        const branch = checkCond(step.if) ? step.then : step.else;
        if (branch) stack.push({ steps: branch, i: 0 });
        continue;
      }
      if ('setFlag' in step) { quest.flags[step.setFlag] = true; continue; }
      if ('giveItem' in step) { quest.items.push(step.giveItem); continue; }
      if ('addCoins' in step) { quest.coins += step.addCoins; continue; }
      if ('addEgg' in step) { quest.eggs.add(step.addEgg); continue; }
      if ('incVar' in step) { quest.vars[step.incVar] = (quest.vars[step.incVar] ?? 0) + 1; continue; }
      if ('setTile' in step) { hooks.setTile(...step.setTile); continue; }
      if ('addWarp' in step) { hooks.addWarp(step.addWarp[0], step.addWarp[1]); continue; }
      if ('sfx' in step) { hooks.sfx(step.sfx); continue; }
      if ('music' in step) { hooks.music(step.music); continue; }
      // absolute HEAT set (§4.8) — synchronous like setFlag/sfx, never suspends
      if ('heat' in step) { hooks.heat(step.heat); continue; }
      // mon grant (CH2.3) — synchronous; party-or-box routing is the hook's
      if ('giveMon' in step) { hooks.giveMon(step.giveMon.species, step.giveMon.lv); continue; }
      // bunk rest (QOL.9) — synchronous like setFlag/sfx, never suspends
      if ('healParty' in step) { hooks.healParty(); continue; }
      // system toast (CH2.10) — synchronous; the toast times out on its own
      if ('sysMsg' in step) { hooks.sysMsg(step.sysMsg); continue; }
      // ambush cutscene (CH2.7) — suspends like locker/shop until the NPC arrives
      if ('npcRun' in step) { hooks.npcRun(step.npcRun.id, next); return; }
      // yes/no prompt (2026-08-15): the hook shows the pages and a picker on
      // the last one; the answer's branch pushes as a nested frame, like `if`
      if ('choice' in step) {
        const { yes, no } = step.choice;
        hooks.choice(step.choice.say, (answer) => {
          const branch = answer ? yes : no;
          if (branch) stack.push({ steps: branch, i: 0 });
          next();
        });
        return;
      }
      if ('locker' in step) { hooks.locker(next); return; }
      if ('jobs' in step) { hooks.jobs(next); return; }
      if ('cardFlip' in step) { hooks.cardFlip(next); return; }
      if ('shop' in step) { hooks.shop(step.shop, next); return; }
      if ('endScreen' in step) { hooks.endScreen(); continue; }
      // ladder advance is state (interpreter, like setFlag); the card is
      // presentation (hook) and suspends the script until dismissed
      if ('rankUp' in step) { hooks.rankUp(rankUp(), next); return; }
    }
  };

  next();
}
