// World: movement, camera, warps, interaction dispatcher, overworld render.
// interact() looks up map scripts (npc:/at:/tile: keys) and feeds them to the
// script interpreter — the old giant switches live in src/data as ScriptStep[].
import { G, DIRV } from '../state';
import type { Dir, MapDef, NpcDef, ScriptStep, WarpDef } from '../types';
import { MAPS } from '../data/maps';
import { TILES, WALKABLE } from '../data/tiles';
import { BG_PAL, OBJ_PAL } from '../data/palettes';
import { CHARSETS } from '../data/chars';
import { mirrorRows, stack, type SpriteRows } from '../data/sprites';
import { ctx, decode, fill, clamp, drawWindow, text, W, H, TILE } from '../engine/renderer';
import { startFade } from '../engine/renderer';
import { Input } from '../engine/input';
import { Audio2 } from '../engine/audio';
import { CHAR_FRAMES, ensurePlayerFrames } from '../engine/charFrames';
import { quest, checkCond } from './quest';
import { openDialog, openChoice } from './dialog';
import { runScript, type ScriptHooks } from './script';
import { openMenu } from './menu';
import { startBattle } from './battle';
import { openLocker } from './locker';
import { openShop } from './shop';
import { openJobs } from './jobsScreen';
import { writeSave, sessionOnlyWarning } from './save';
import { setHeat, calmHeat, tickHeat, visibleTiles, stepToward } from './heat';
import { sharedWhiteout } from './recovery';
import { stepEncounter, wildEncounter, ENCOUNTER_TILE } from './encounter';
import { makeMon, maxHp } from './mon';
import { SPECIES } from '../data/mons';

// ── Map helpers (pure over an explicit map — unit-testable) ──────────────
export function tileAt(map: MapDef, x: number, y: number): string {
  if (x < 0 || y < 0 || x >= map.w || y >= map.h) return '#';
  return map.grid[y][x];
}
export function setTile(map: MapDef, x: number, y: number, ch: string): void {
  map.grid[y][x] = ch;
}
export function npcGone(n: NpcDef): boolean {
  return n.goneIf ? checkCond(n.goneIf) : false;
}
export function npcAt(map: MapDef, x: number, y: number): NpcDef | null {
  for (const n of map.npcs) {
    if (npcGone(n)) continue;
    if (n.x === x && n.y === y) return n;
  }
  return null;
}
export function isBlocked(map: MapDef, x: number, y: number): boolean {
  const t = tileAt(map, x, y);
  if (!WALKABLE.has(t)) return true;
  if (npcAt(map, x, y)) return true;
  return false;
}
export function warpAt(map: MapDef, x: number, y: number): WarpDef | undefined {
  return map.warps[x + ',' + y];
}

// ── Script hooks: how declarative steps touch the engine ─────────────────
let pendingEnter: ScriptStep[] | null = null;

export const worldHooks: ScriptHooks = {
  say: (pages, done) => openDialog(pages, done),
  choice: (pages, done) => openChoice(pages, done),
  battle: (id, done) => startBattle(id, done),
  warp: (w, done) => performWarp(w, done),
  sfx: (name) => Audio2.sfx(name),
  music: (name) => Audio2.play(name),
  setTile: (x, y, ch) => setTile(G.map, x, y, ch),
  addWarp: (key, w) => {
    G.map.warps[key] = w;
  },
  locker: (done) => openLocker(done),
  shop: (id, done) => openShop(id, done),
  jobs: (done) => openJobs(done),
  endScreen: () => {
    G.state = 'end';
    G.endT = 0;
  },
  // set state directly (like endScreen) — importing scenes.ts here would
  // cycle world ↔ scenes; scenes.rankCardUpdate reads G.rankCard
  rankUp: (newRank, done) => {
    G.rankCard = { rank: newRank, after: done };
    G.state = 'rankcard';
    G.endT = 0;
    Audio2.play('victory'); // §4.7 fanfare; map music resumes on dismiss
  },
  // §4.8: absolute HEAT set on the current map. setHeat clamps 0..3, resets the
  // decay timer and starts/cancels lockdown. The tick / face-scan / pathing /
  // draw that consume G.heatState arrive in 1f.6; this is just the setter.
  heat: (n) => {
    const id = G.map.id;
    const prev = G.heatState[id]?.stage ?? 0;
    G.heatState[id] = setHeat(G.heatState[id] ?? calmHeat(), n, G.playSeconds);
    // 1f.10 alert cue: a stage RAISE briefly boosts the vignette (draw-only)
    if ((G.heatState[id]?.stage ?? 0) > prev) alertT = ALERT_FRAMES;
  },
  // CH2.3 gift scenes: party if there's room (cap 4, §4.2), else the LOCKER
  // box — same overflow rule the SWIPE catch uses. Silent by design; the
  // granting script says its own lines.
  giveMon: (species, lv) => {
    const m = makeMon(SPECIES[species], lv);
    if (G.party.length < 4) G.party.push(m);
    else G.box.push(m);
  },
  // CH2.7 ambush cutscene: hand the run to the worldUpdate tick below.
  // Missing or goneIf'd NPCs resolve immediately — a beaten BRAD can't be
  // summoned back by a stale script.
  npcRun: (id, done) => {
    const npc = G.map.npcs.find((n) => n.id === id && !npcGone(n));
    if (!npc) {
      done();
      return;
    }
    npcRunState = { npc, done, steps: 0 };
  },
  // QOL.9 bunk rest: the whiteout's heal body (recovery.ts) minus the coin
  // penalty and warp — full hp, revives, clears status. The 8-minute nap
  // moves playSeconds so map HEAT gets its decay windows (§4.8 synergy);
  // TIME on STATUS moves with it, accepted flavor.
  healParty: () => {
    for (const m of G.party) {
      m.hp = maxHp(SPECIES[m.species], m.lv);
      m.status = undefined;
    }
    G.playSeconds += 480;
  },
  // CH2.10 system toast — game-voice confirmation after a script's dialogue
  // closes (Lyall: the bunk heal read as NPC chatter). Module-local timer,
  // mapNameT idiom: draw-only, never saved, never gates logic.
  sysMsg: (lines) => {
    sysMsgLines = lines;
    sysMsgT = SYS_MSG_FRAMES;
  },
};

// CH2.10 toast state — draw-only (juice rule: never gates logic)
const SYS_MSG_FRAMES = 150;
let sysMsgLines: string[] = [];
let sysMsgT = 0;

// ── NPC-run cutscene (CH2.7) ─────────────────────────────────────────────
const NPC_RUN_EVERY = 12; // frames per tile — 2× guard chase cadence: a RUN
const NPC_RUN_MAX_STEPS = 40; // bounded — then snap adjacent, never hang
let npcRunState: { npc: NpcDef; done: () => void; steps: number } | null = null;

function npcRunAdjacent(npc: NpcDef): boolean {
  const p = G.player;
  return Math.abs(npc.x - p.x) + Math.abs(npc.y - p.y) === 1; // cardinal
}

/** Tick the running NPC. Returns true while the cutscene owns the frame —
 *  player input, movement and heatTick all wait for it. */
function npcRunTick(): boolean {
  const rs = npcRunState;
  if (!rs) return false;
  const p = G.player;
  if (npcRunAdjacent(rs.npc)) {
    rs.npc.faceDir = stepFaceDir(p.x - rs.npc.x, p.y - rs.npc.y);
    npcRunState = null;
    rs.done();
    return true;
  }
  if (G.frame % NPC_RUN_EVERY !== 0) return true;
  rs.steps++;
  if (rs.steps > NPC_RUN_MAX_STEPS) {
    // pathing gave up (walled off, bystander jam): snap to a free cardinal
    // neighbour so the scene ALWAYS completes — a hung cutscene is a softlock
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]] as const) {
      const nx = p.x + dx;
      const ny = p.y + dy;
      if (!WALKABLE.has(tileAt(G.map, nx, ny)) || npcAt(G.map, nx, ny)) continue;
      rs.npc.x = nx;
      rs.npc.y = ny;
      break;
    }
    return true; // adjacency resolves on the next tick
  }
  const step = stepToward(rs.npc, p, G.map);
  const nx = rs.npc.x + step.dx;
  const ny = rs.npc.y + step.dy;
  if ((step.dx === 0 && step.dy === 0) || npcAt(G.map, nx, ny)) return true; // blocked: retry next beat
  rs.npc.x = nx;
  rs.npc.y = ny;
  rs.npc.faceDir = stepFaceDir(step.dx, step.dy);
  return true;
}

// 1f.10 vignette state — draw-only (juice rule: never gates logic)
const ALERT_FRAMES = 30;
let alertT = 0;
// CH2.9 grass rustle — draw-only: a `~` tile jitters briefly when the player
// steps onto it or starts walking off it. Module-local, never saved, and it
// never touches the encounter roll (which stays keyed to step completion).
const RUSTLE_FRAMES = 12;
let rustles: { x: number; y: number; t: number }[] = [];
function addRustle(x: number, y: number): void {
  if (tileAt(G.map, x, y) !== ENCOUNTER_TILE) return;
  rustles = rustles.filter((r) => r.x !== x || r.y !== y);
  rustles.push({ x, y, t: RUSTLE_FRAMES });
}
// 1f.14 caught explainer — queued at the lockdown bust, opened as a real
// dialog once the whiteout fade resolves at HQ (the pendingEnter idiom)
let pendingCaught: string[][] | null = null;

// ── Warps ────────────────────────────────────────────────────────────────
export function performWarp(w: WarpDef, after?: () => void): void {
  const [mapId, x, y, dir] = w;
  // §4.8 warp escape: leaving a map clears its HEAT + guard runtime, BEFORE
  // the fade so the autosave inside it never carries departed heat.
  delete G.heatState[G.map.id];
  clearMapGuardRuntime(G.map.id);
  Audio2.sfx(mapId === 'vault' || G.map.id === 'vault' ? 'stairs' : 'door');
  G.state = 'worldwait';
  rustles = []; // CH2.9: tile coords are per-map — never carry across a warp
  startFade(() => {
    G.map = MAPS[mapId];
    const p = G.player;
    p.x = x;
    p.y = y;
    p.dir = dir;
    p.moving = false;
    p.prog = 0;
    G.state = 'world';
    G.mapNameT = 90;
    Audio2.play(G.map.music);
    if (G.map.scripts.enter) pendingEnter = G.map.scripts.enter;
    writeSave(); // §4.6 autosave on warp (position/map are final here)
    after?.();
    // once-only §0.4 fallback warning; if a script dialog is already up we
    // skip (un-latched) and warn on the next warp instead
    if (!G.dialog && sessionOnlyWarning()) openDialog([['SAVE: SESSION', 'ONLY.']]);
  });
}
function tryWarp(): boolean {
  const p = G.player;
  const w = warpAt(G.map, p.x, p.y);
  if (!w) return false;
  performWarp(w);
  return true;
}

// ── HEAT (§4.8, card 1f.6): tick, gaze, pursuit, lockdown ────────────────
const STEP_EVERY = 24; // frames between stage-2+ greedy steps (1f.10: 2/3 of
// player walk speed, was 16 = exactly walk speed and felt inescapable)
const REENGAGE_FRAMES = 180; // world-frames a guard stays inert after contact
const STARTLE_FRAMES = 48; // 1f.10 wind-up: the `!` blinks AND pursuit holds
const CHASE_LEASH = 3; // 1f.11: give up beyond this Chebyshev distance (= cone range)
const BLOCKED_GIVE_UP_FRAMES = 120; // 1f.11: 2 s body-blocked -> go home
// 1f.15 gaze vision: sighting requires EYE CONTACT — the player inside the
// cone of the guard's CURRENT facing. Posted guards sweep their gaze so the
// danger is readable (and sneakable-behind).
const GAZE_CYCLE: Dir[] = ['down', 'right', 'up', 'left'];
const GAZE_TURN_EVERY = 90; // frames per idle gaze direction
const GAZE_CHECK_EVERY = 15; // frames between eye-contact checks at stage 1+

/** Per-guard session runtime — never saved (1f.2's guardPositions call). */
interface GuardRt {
  cooldown: number; // world-frames of post-contact inertness left
  spotFlash: number; // world-frames of startle: `!` blinks, pursuit holds
  tracking: boolean; // 1f.10: player currently in sight — escalate only on a
  // NEW acquisition, so standing in a cone can't pump the stage every scan
  mode: 'post' | 'chase' | 'return'; // 1f.11 guard state machine
  blockedT: number; // world-frames spent body-blocked mid-chase
  homeX: number; // the post — captured at FIRST runtime creation and kept
  homeY: number; // in guardHomes across clears, so displaced guards always
  homeDir: Dir; //  know their way back
}
const guardRt = new Map<string, GuardRt>();
// Posts outlive runtime clears (warp-out wipes alert state, not the home) —
// a guard found off-post on a later visit self-heals by walking back.
const guardHomes = new Map<string, { x: number; y: number; dir: Dir }>();
export function guardRuntime(
  mapId: string,
  npc: { id: string; x: number; y: number; dir: Dir },
): GuardRt {
  const k = mapId + ':' + npc.id;
  let rt = guardRt.get(k);
  if (!rt) {
    let home = guardHomes.get(k);
    if (!home) {
      home = { x: npc.x, y: npc.y, dir: npc.dir };
      guardHomes.set(k, home);
    }
    rt = {
      cooldown: 0,
      spotFlash: 0,
      tracking: false,
      mode: 'post',
      blockedT: 0,
      homeX: home.x,
      homeY: home.y,
      homeDir: home.dir,
    };
    guardRt.set(k, rt);
  }
  return rt;
}
export function clearMapGuardRuntime(mapId: string): void {
  for (const k of guardRt.keys()) if (k.startsWith(mapId + ':')) guardRt.delete(k);
}

function giveUpChase(rt: GuardRt): void {
  rt.mode = 'return';
  rt.tracking = false;
  rt.blockedT = 0;
}

function stepFaceDir(dx: number, dy: number): Dir {
  if (dx > 0) return 'right';
  if (dx < 0) return 'left';
  return dy > 0 ? 'down' : 'up';
}

/** HEAT tick — top of worldUpdate (after enter scripts, before input).
 *  Returns true when it consumed the frame (whiteout or contact battle).
 *  Menus/battles never pause this clock: playSeconds keeps running there, so
 *  an expiry mid-battle fires here on the first tick back in 'world'.
 *  Runs even on a calm map (1f.11): returning guards keep walking home. */
export function heatTick(): boolean {
  const mapId = G.map.id;
  const hs = G.heatState[mapId];
  if (hs && hs.stage > 0) {
    const ticked = tickHeat(hs, G.playSeconds);
    if (ticked.locked && G.map.drill) {
      // SIDE.5: training-room bust — reset, don't punish. Heat back to
      // alerted (stage 1, lockdown disarmed), guards forget, player back on
      // the drill start tile; the caught dialog reuses the 1f.14 pending
      // idiom and opens on the next world tick (no fade to wait for).
      G.heatState[mapId] = setHeat(calmHeat(), 1, G.playSeconds);
      clearMapGuardRuntime(mapId);
      G.player.x = G.map.drill.x;
      G.player.y = G.map.drill.y;
      Object.assign(G.player, { moving: false, prog: 0, dir: 'down' });
      pendingCaught = [['CAUGHT! NO', 'PENALTY HERE.'], ['BACK TO THE', 'START LINE.', 'GO AGAIN!']];
      Audio2.sfx('hurt');
      return true;
    }
    if (ticked.locked) {
      // Lockdown failure: the player is pulled off the map — same clear
      // semantics as a warp-out, then the shared §4.3 penalty. The caught
      // dialog (1f.14) waits for the fade like an enter script, so the
      // bust explains itself once the player is standing at HQ.
      delete G.heatState[mapId];
      clearMapGuardRuntime(mapId);
      const lost = Math.floor(quest.coins * 0.1);
      pendingCaught = [['THE GUARDS', 'CAUGHT YOU!']];
      if (lost > 0) pendingCaught.push(['DROPPED ' + lost, 'COINS ON THE', 'WAY OUT.']);
      pendingCaught.push(['THEY THREW YOU', 'BACK AT BASE.']);
      Audio2.sfx('hurt');
      sharedWhiteout(lost, () => {});
      return true;
    }
    if (ticked.state.stage === 0) delete G.heatState[mapId]; // absent = calm
    else G.heatState[mapId] = ticked.state;
  }
  const p = G.player;
  for (const n of G.map.npcs) {
    if (!n.heatGuard || npcGone(n)) continue;
    const rt = guardRuntime(mapId, n);
    if (rt.spotFlash > 0) rt.spotFlash--;
    if (rt.cooldown > 0) {
      rt.cooldown--; // recovering: no scan, no step, no re-engage
      continue;
    }
    const stage = G.heatState[mapId]?.stage ?? 0;
    // self-heal: a "posted" guard found off his tile (warp wiped the alert
    // state mid-chase) walks back
    if (rt.mode === 'post' && (n.x !== rt.homeX || n.y !== rt.homeY)) rt.mode = 'return';
    // the map cooled below pursuit level mid-chase — go home
    if (rt.mode === 'chase' && stage < 2) giveUpChase(rt);
    if (rt.mode === 'post') {
      // 1f.15 idle look-around — ambient at ANY stage (the sweep IS the
      // tell for where it's safe to walk), frozen while he's staring
      if (!rt.tracking) {
        n.faceDir = GAZE_CYCLE[Math.floor(G.frame / GAZE_TURN_EVERY) % 4];
      }
      if (stage >= 1 && G.frame % GAZE_CHECK_EVERY === 0) {
        const facing = n.faceDir ?? n.dir;
        const seen = visibleTiles(facing, n.x, n.y, G.map).some(
          (t) => t.x === p.x && t.y === p.y,
        );
        if (seen) {
          if (!rt.tracking) {
            // NEW acquisition (1f.10): startle wind-up + one stage, once. The
            // guard must lose the player and re-acquire to raise again; at 3
            // a re-acquisition re-arms the 20 s lockdown (frozen contract).
            rt.tracking = true;
            rt.spotFlash = STARTLE_FRAMES;
            worldHooks.heat(Math.min(3, stage + 1));
          }
          if ((G.heatState[mapId]?.stage ?? 0) >= 2) rt.mode = 'chase';
        } else {
          rt.tracking = false; // lost eye contact — next spot is a new acquisition
        }
      }
      continue; // posted guards never move
    }
    if (G.frame % STEP_EVERY !== 0) continue;
    if (rt.mode === 'chase') {
      if (rt.spotFlash > 0) continue; // startled: the `!` IS the wind-up
      const dist = Math.max(Math.abs(p.x - n.x), Math.abs(p.y - n.y));
      if (dist > CHASE_LEASH) {
        giveUpChase(rt); // broke away — he loses interest (1f.11)
        continue;
      }
      const step = stepToward(n, p, G.map);
      const nx = n.x + step.dx;
      const ny = n.y + step.dy;
      if (nx === p.x && ny === p.y && (step.dx !== 0 || step.dy !== 0)) {
        // contact: the guard holds its tile and the fight starts
        n.faceDir = stepFaceDir(step.dx, step.dy);
        rt.cooldown = REENGAGE_FRAMES;
        rt.blockedT = 0;
        runScript([{ battle: n.heatGuard.encounterId }], worldHooks);
        return true;
      }
      if ((step.dx === 0 && step.dy === 0) || npcAt(G.map, nx, ny)) {
        // walled off or a bystander in the way: 2 s of this and he gives up
        rt.blockedT += STEP_EVERY;
        if (rt.blockedT >= BLOCKED_GIVE_UP_FRAMES) giveUpChase(rt);
        continue;
      }
      n.x = nx;
      n.y = ny;
      n.faceDir = stepFaceDir(step.dx, step.dy);
      rt.blockedT = 0;
      continue;
    }
    // mode 'return' — walking back, but still half-alert (1f.11): a hot map
    // and a close player flip him straight back to chase, no wind-up.
    const dist = Math.max(Math.abs(p.x - n.x), Math.abs(p.y - n.y));
    if (stage >= 2 && dist <= CHASE_LEASH) {
      if (!rt.tracking) {
        rt.tracking = true; // fresh acquisition = +1 stage (sighting contract)
        worldHooks.heat(Math.min(3, stage + 1));
      }
      rt.mode = 'chase';
      rt.blockedT = 0;
      continue; // first pursuit step lands next beat
    }
    if (n.x === rt.homeX && n.y === rt.homeY) {
      rt.mode = 'post';
      n.faceDir = rt.homeDir; // back on duty, facing the old way
      continue;
    }
    const step = stepToward(n, { x: rt.homeX, y: rt.homeY }, G.map);
    const nx = n.x + step.dx;
    const ny = n.y + step.dy;
    // a blocked return step just waits — next beat retries
    if ((step.dx === 0 && step.dy === 0) || (nx === p.x && ny === p.y) || npcAt(G.map, nx, ny)) continue;
    n.x = nx;
    n.y = ny;
    n.faceDir = stepFaceDir(step.dx, step.dy);
  }
  return false;
}

// ── Interaction dispatcher ───────────────────────────────────────────────
const FACE_OPP: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' };

export function interact(): void {
  const p = G.player;
  const [dx, dy] = DIRV[p.dir];
  const tx = p.x + dx;
  const ty = p.y + dy;
  const npc = npcAt(G.map, tx, ty);
  if (npc) {
    npc.faceDir = FACE_OPP[p.dir];
    const s = G.map.scripts['npc:' + npc.id];
    if (s) runScript(s, worldHooks);
    return;
  }
  const key = tx + ',' + ty;
  const t = tileAt(G.map, tx, ty);
  // signs
  if (G.map.signs[key]) {
    Audio2.sfx('beep');
    openDialog(G.map.signs[key]);
    return;
  }
  // item balls
  if (t === 'b' && G.map.items[key]) {
    const it = G.map.items[key];
    setTile(G.map, tx, ty, ' ');
    quest.flags[it.flag] = true;
    quest.items.push(it.name);
    Audio2.sfx('item');
    openDialog([['Found a', it.name + '!']]);
    return;
  }
  // positional then tile-type scripts
  const at = G.map.scripts['at:' + key];
  if (at) {
    runScript(at, worldHooks);
    return;
  }
  const ts = G.map.scripts['tile:' + t];
  if (ts) {
    runScript(ts, worldHooks);
    return;
  }
}

// ── Movement ─────────────────────────────────────────────────────────────
export function worldUpdate(): void {
  if (pendingEnter && G.fade === 0 && G.fadeDir === 0) {
    const steps = pendingEnter;
    pendingEnter = null;
    runScript(steps, worldHooks);
    return;
  }
  // 1f.14: the lockdown bust explains itself once the fade lands at HQ
  if (pendingCaught && G.fade === 0 && G.fadeDir === 0) {
    const pages = pendingCaught;
    pendingCaught = null;
    openDialog(pages);
    return;
  }
  if (npcRunTick()) return; // CH2.7 cutscene owns the frame — input + guards wait
  if (heatTick()) return; // §4.8 — may fire the lockdown whiteout or a contact battle
  const p = G.player;
  if (p.turnLock > 0) p.turnLock--;
  if (p.moving) {
    p.prog += Input.held('b') ? 2 : 1; // walk 16f/tile (Gen-1), B = run
    if (p.prog >= TILE) {
      p.prog = 0;
      p.moving = false;
      p.step ^= 1;
      const [dx, dy] = DIRV[p.dir];
      p.x += dx;
      p.y += dy;
      if (tryWarp()) return;
      // SIDE.5 (2026-08-15): step-on scripts — `step:x,y` fires on ARRIVAL,
      // no A press, same slot as a warp. Born from the stealth drill's goal
      // pad: interact() only ever checks the tile IN FRONT, so a walkable
      // goal tile could never be "pressed" while standing on it (Lyall got
      // it once by luck, facing up from below). A finish line is a place
      // you reach, not a button.
      const stepScript = G.map.scripts['step:' + p.x + ',' + p.y];
      if (stepScript) {
        runScript(stepScript, worldHooks);
        return;
      }
      // CH2.9: arriving on grass rustles it — recorded BEFORE the roll so a
      // battle exit (which resumes on this exact tile) still shows the tail
      addRustle(p.x, p.y);
      // CH2.1 wild roll — fires ONLY here, on a completed WALK step: warp
      // arrivals returned above, scripts can't move the player, and standing
      // still never re-rolls. Position is untouched by the battle, so every
      // exit (win/catch/flee) resumes on this exact tile.
      if (tileAt(G.map, p.x, p.y) === ENCOUNTER_TILE) {
        const roll = stepEncounter(G.map);
        if (roll) {
          startBattle(wildEncounter(roll), () => {});
          return;
        }
      }
      // continue moving if still held
      const d = Input.dirHeld();
      if (d) tryMove(d);
    }
  } else {
    const d = Input.dirHeld();
    if (d) tryMove(d);
  }
  if (Input.hit('a') && !p.moving) {
    interact();
    return;
  }
  if (Input.hit('start')) {
    openMenu();
    return;
  }
}
function tryMove(d: Dir): void {
  const p = G.player;
  if (d !== p.dir) {
    p.dir = d;
    p.turnLock = 6;
    return;
  }
  if (p.turnLock > 0) return;
  const [dx, dy] = DIRV[d];
  if (isBlocked(G.map, p.x + dx, p.y + dy)) {
    if (G.frame % 24 === 0) Audio2.sfx('bump');
    return;
  }
  p.moving = true;
  p.prog = 0;
  addRustle(p.x, p.y); // CH2.9: the tile being walked OFF stirs as you leave
}

// ── Render ───────────────────────────────────────────────────────────────
// helper: recolored static NPC frame (for palette-overridden chars)
const stackMemo = new Map<string, SpriteRows>();
function stackCache(head: SpriteRows, body: SpriteRows, mirror: boolean): SpriteRows {
  const k = head._id + body._id + (mirror ? 'm' : '');
  let r = stackMemo.get(k);
  if (!r) {
    r = stack(head, body);
    if (mirror) r = mirrorRows(r);
    stackMemo.set(k, r);
  }
  return r;
}

export function worldDraw(): void {
  const map = G.map;
  const pal = BG_PAL[map.pal];
  const p = G.player;
  fill(pal[0]);
  // camera (pixel space), centered on player, clamped; centered if map small
  const [dx, dy] = p.moving ? DIRV[p.dir] : [0, 0];
  const ppx = p.x * TILE + dx * p.prog;
  const ppy = p.y * TILE + dy * p.prog;
  let camX = ppx - (W - TILE) / 2;
  let camY = ppy - (H - TILE) / 2;
  const maxX = map.w * TILE - W;
  const maxY = map.h * TILE - H;
  camX = maxX <= 0 ? maxX / 2 : clamp(camX, 0, maxX);
  camY = maxY <= 0 ? maxY / 2 : clamp(camY, 0, maxY);
  camX = Math.round(camX);
  camY = Math.round(camY);
  // tiles
  const x0 = Math.max(0, Math.floor(camX / TILE));
  const y0 = Math.max(0, Math.floor(camY / TILE));
  const x1 = Math.min(map.w - 1, Math.ceil((camX + W) / TILE));
  const y1 = Math.min(map.h - 1, Math.ceil((camY + H) / TILE));
  const animF = (G.frame >> 5) & 1;
  // CH2.9: tick rustle timers here — draw-only state ages with the draw
  if (rustles.length) {
    for (const r of rustles) r.t--;
    rustles = rustles.filter((r) => r.t > 0);
  }
  const rustleJx = ((G.frame >> 2) & 1) === 1 ? 1 : -1;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const frames = TILES[map.grid[y][x]] || TILES[' '];
      const spr = frames[animF % frames.length];
      const jx = rustles.some((r) => r.x === x && r.y === y) ? rustleJx : 0;
      ctx.drawImage(decode(spr, pal), x * TILE - camX + jx, y * TILE - camY);
    }
  }
  // sprites (NPCs + player), y-sorted
  const ents: { y: number; draw: () => void }[] = [];
  for (const n of map.npcs) {
    if (npcGone(n)) continue;
    ents.push({
      y: n.y * TILE,
      draw: () => {
        const dir = n.faceDir || n.dir;
        let img: HTMLCanvasElement;
        if (n.char === 'myowth') img = CHAR_FRAMES.myowth.down[(G.frame >> 5) & 1];
        else if (n.pal) {
          const cs = CHARSETS[n.char];
          img = decode(
            stackCache(
              cs.head[dir === 'up' ? 'u' : dir === 'down' ? 'd' : 's'],
              cs.body[dir === 'up' ? 'u0' : dir === 'down' ? 'd0' : 's0'],
              dir === 'right',
            ),
            OBJ_PAL[n.pal],
          );
        } else img = CHAR_FRAMES[n.char][dir][0];
        // 1f.11 chase juice (draw-only): a chasing guard bobs 1px on an
        // 8-frame beat so the pursuit reads even in peripheral vision
        const grt = n.heatGuard ? guardRt.get(map.id + ':' + n.id) : undefined;
        const bob = grt?.mode === 'chase' && grt.cooldown === 0 ? ((G.frame >> 3) & 1) : 0;
        ctx.drawImage(img, n.x * TILE - camX, n.y * TILE - camY - 4 - bob);
      },
    });
  }
  ents.push({
    y: ppy,
    draw: () => {
      let f = 0;
      if (p.moving) f = p.prog < 8 ? (p.step ? 1 : 2) : 0;
      // RNK.5a: the player wears owned gear — no-op rebuild guard inside
      ensurePlayerFrames(quest.items);
      ctx.drawImage(CHAR_FRAMES.player[p.dir][f], Math.round(ppx) - camX, Math.round(ppy) - camY - 4);
    },
  });
  ents.sort((a, b) => a.y - b.y).forEach((e) => e.draw());
  // CH2.7 ambush `!` — same blink idiom as the guard flag below
  if (npcRunState && ((G.frame >> 3) & 1) === 1) {
    const rn = npcRunState.npc;
    text('!', rn.x * TILE - camX + 5, rn.y * TILE - camY - 14, pal[3]);
  }
  // §4.8 sighting `!` — 8-frame blink through the startle AND the whole
  // chase (1f.11), so a hunting guard stays flagged
  for (const n of map.npcs) {
    if (!n.heatGuard || npcGone(n)) continue;
    const rt = guardRt.get(map.id + ':' + n.id);
    if (!rt) continue;
    const flagged = rt.spotFlash > 0 || (rt.mode === 'chase' && rt.cooldown === 0);
    if (flagged && ((G.frame >> 3) & 1) === 1) {
      text('!', n.x * TILE - camX + 5, n.y * TILE - camY - 14, pal[3]);
    }
  }
  // 1f.10 pulsing screen-edge vignette while the map is hot — draw-only.
  // Slow breathe at stage 1-2, fast heartbeat at 3; a stage raise adds a
  // brief decaying boost so "you've been made" reads instantly.
  const hotNow = G.heatState[map.id];
  if (hotNow && hotNow.stage > 0) {
    if (alertT > 0) alertT--;
    const speed = hotNow.stage === 3 ? 0.25 : 0.08;
    const pulse = 0.5 + 0.5 * Math.sin(G.frame * speed);
    const alpha = (0.08 + 0.07 * hotNow.stage) * pulse + (alertT > 0 ? 0.3 * (alertT / ALERT_FRAMES) : 0);
    const t = 4;
    ctx.fillStyle = 'rgba(255,40,40,' + alpha.toFixed(3) + ')';
    ctx.fillRect(0, 0, W, t);
    ctx.fillRect(0, H - t, W, t);
    ctx.fillRect(0, t, t, H - 2 * t);
    ctx.fillRect(W - t, t, t, H - 2 * t);
  } else if (alertT > 0) alertT = 0;
  // §4.8 stage-3 lockdown countdown, compact top-right (player-facing label
  // is ALARM per 1f.13; the system keeps its HEAT name internally)
  const heat = G.heatState[map.id];
  if (heat && heat.stage === 3 && heat.lockdownAt !== null) {
    const remain = Math.max(0, Math.ceil(heat.lockdownAt - G.playSeconds));
    const label = 'ALARM ' + remain + 's';
    const lw = label.length * 8 + 16;
    drawWindow(W - lw, 0, lw, 20, pal);
    text(label, W - lw + 8, 6, pal[0]);
  }
  // map name plate briefly after entering
  if (G.mapNameT > 0) {
    G.mapNameT--;
    drawWindow(0, 0, map.name.length * 8 + 16, 20, pal);
    text(map.name, 8, 6, pal[0]);
  }
  // CH2.10 system toast — bottom-anchored, timed like the name plate. 10px
  // row pitch + drawWindow's 6px chrome (the F14 playtest formula: interior
  // = h-8 for an 8px glyph line).
  if (sysMsgT > 0) {
    sysMsgT--;
    const th = sysMsgLines.length * 10 + 12;
    drawWindow(0, H - th, W, th, pal);
    sysMsgLines.forEach((l, i) => text(l, 6, H - th + 5 + i * 10, pal[0]));
  }
}
