// Shared interfaces for maps, NPCs, warps and the declarative script format
// (expansion plan §3.2/§3.3). No cross-module globals — game state lives in
// src/state.ts, quest progress in src/systems/quest.ts.
import type { SpriteRows } from './data/sprites';
import type { TypeId } from './data/typeChart';

export type Dir = 'up' | 'down' | 'left' | 'right';
export type MapId = 'hq' | 'corner' | 'vault' | 'moon1' | 'moon2' | 'moonDig' | 'hqDrill' | 'outskirts' | 'bridge' | 'tower';

/** [target map, x, y, facing on arrival] */
export type WarpDef = [MapId, number, number, Dir];

export interface Flags {
  briefed: boolean;
  guardBeaten: boolean;
  switchFound: boolean;
  lootTaken: boolean;
  missionDone: boolean;
  // `gotSmoke` retired by SIDE.6 — the SMOKE BALL is pickup `hq_smoke` now
  // (save.ts migrates the flag into quest.pickups on load).
  // CH2 (Mt. Möön) — flag additions carry no save-shape bump; old saves
  // read missing keys as undefined = false (applySave convention)
  fossilsTaken: boolean; // the dig-site chest set piece (pair of fossils)
  gotEkanzz: boolean;    // Jessika's gift scene
  bradBeaten: boolean;   // rival grunt BRAD defeated at the dig site
  ch2Done: boolean;      // fossils handed in — AGENT rank granted
  jobsIntroSeen: boolean; // SIDE.1-FB: the board explained itself once
  // SIDE.5 HQ training drills — reward paid once, drills stay repeatable
  drillBattleDone: boolean;  // Jessika's sparring match won at least once
  drillStealthDone: boolean; // Myowth's stealth course goal reached once
  /** ONB.5-FB: the pre-spar SODA has been handed over. Its own flag, NOT
   *  drillBattleDone — that one is only set on a WIN, so gating the give on
   *  it let a player take the SODA, flee, and repeat for free ones. */
  sparSodaGiven: boolean;
  // CH3 (Nugget Span) — one flag per mark on the bridge (beaten = paid out
  // + gone) and the chapter end (KIRA beaten = OPERATIVE). No save bump.
  spanCamper: boolean;
  spanPicnicker: boolean;
  spanHiker: boolean;
  spanYoungster: boolean;
  spanLass: boolean;
  ch3Done: boolean;
  // ONB.8: Giovanni's opening line has been delivered. Flag additions carry
  // no save-shape bump — old saves read a missing key as false, so a save
  // made before this card hears the line once on its next HQ entry.
  introSeen: boolean;
  // ONB.3: Giovanni's CH2/CH3 briefings have been heard. Before these the
  // briefings set nothing, so a "briefing waiting" marker had no way to go
  // out. No save bump — a pre-ONB.3 save mid-chapter sees one extra `!`
  // on him until the next talk.
  ch2Briefed: boolean;
  ch3Briefed: boolean;
  // ONB.2: Myowth's HQ tour has run (or been skipped) once. Set BEFORE the
  // tour starts so a skip — or a reload mid-tour — never replays it. No
  // save bump (missing key reads false, the introSeen precedent).
  introToured: boolean;
}
export type FlagName = keyof Flags;

/** Conditions usable in script `if` steps and NPC visibility/markers. */
export type Cond =
  | { flag: FlagName }
  | { notFlag: FlagName }
  | { egg: string }
  | { notEgg: string }
  | { varEq: [string, number] }
  | { varRoll: [string, number] } // SIDE.7: quest.varRoll(vars[name] ?? 0, p) — seeded per-spin jackpot odds
  | { coinsAtLeast: number }      // SIDE.7-FB: quest.coins >= n — the Q machine's stake gate
  | { dexComplete: true } // SIDE.4: GRUNTDEX n/n under SPR.0's line-credit rule (derived — quest.setDexMons)
  | { all: Cond[] }       // ONB.3: every child holds (empty = true)
  | { any: Cond[] };      // ONB.3: at least one child holds (empty = false)

/**
 * Declarative script step (plan §3.3). The plan sketched `ifFlag`; this uses a
 * single generic `if` with a Cond so egg/counter checks don't need new step
 * kinds. `heat` arrives with the HEAT system (§4.8, slice 1f).
 */
export type ScriptStep =
  | { say: string[][] }                                   // dialogue pages (≤3 lines × 17 chars)
  | { setFlag: FlagName }
  | { if: Cond; then: ScriptStep[]; else?: ScriptStep[] }
  | { giveItem: string }
  | { setTile: [number, number, string] }                 // absolute tile coords on current map
  | { addWarp: [string, WarpDef] }                        // key 'x,y' on current map
  | { battle: string }                                    // encounter id
  | { warp: WarpDef }
  | { sfx: string }
  | { music: string }
  | { addCoins: number }
  | { addEgg: string }
  | { incVar: string }
  | { sayCycle: { counter: string; dialogs: string[][][] } } // dialogs[vars[counter] % len]
  | { locker: true }                                      // open the HQ MON LOCKER terminal (§4.3)
  | { shop: string }                                      // open a vendor's buy/sell screen (§4.5)
  | { endScreen: true }                                   // mission-complete card
  | { rankUp: true }                                      // advance the rank ladder + full-screen card (§4.7)
  | { heat: number }                                      // set the current map's HEAT stage 0..3 (§4.8, synchronous)
  | { giveMon: { species: string; lv: number } }          // grant a mon: party if room, else MON LOCKER (CH2.3, synchronous)
  | { npcRun: { id: string } }                            // cutscene: an NPC runs to the player, input frozen (CH2.7, suspends)
  | { healParty: true }                                   // full-heal + revive the party — the HQ bunk rest (QOL.9, synchronous)
  | { sysMsg: string[] }                                  // timed system toast, 1–3 lines ≤17 chars (CH2.10, synchronous)
  | { jobs: true }                                        // open the HQ job board (SIDE.1, suspends like locker/shop)
  | { choice: { say: string[][]; yes: ScriptStep[]; no?: ScriptStep[] } } // ask YES/NO on the last say page; branch runs nested like `if` (2026-08-15, suspends)
  | { cardFlip: true }                                    // open the DEALER's PICKPOCKET table (SIDE.2, suspends like jobs)
  | { tour: { stops: TourStop[] } };                      // guided camera tour (ONB.2/FLW.5, suspends): pan stop to stop, A advances, B/START exits; camera always returns

/** ONB.2/FLW.5: one stop of a `{ tour }`. `cam` is a camera TARGET in
 *  PIXELS (tile*16 — the INTRO_CARDS convention; `cameraFor` clamps it at
 *  map edges). `lines`: 1–3 band lines, ≤17 chars each, shown while the
 *  camera holds on the stop. */
export interface TourStop {
  cam: [number, number];
  lines: string[];
}

/** SIDE.6: a floor item ball (`b` tile). `id` is unique across ALL maps
 *  (pickup-lint) and lands in quest.pickups when taken; `item` is an ITEMS
 *  id. Taken balls are blanked on load by save.ts's repairItemBalls. */
export interface PickupDef {
  id: string;
  item: string;
}

export interface NpcDef {
  id: string;
  char: string;
  x: number;
  y: number;
  dir: Dir;
  pal?: string;      // OBJ_PAL override
  goneIf?: Cond;     // hidden + non-blocking when condition holds
  todoIf?: Cond;     // ONB.3: wears a `!` while the condition holds — REQUIRED NPCs only
  faceDir?: Dir;     // runtime: set when the player talks to them
  /** Guard that starts a battle when it reaches the player under HEAT (§4.8).
   *  encounterId keys ENCOUNTERS; consumed by world.ts from card 1f.6. */
  heatGuard?: { encounterId: string };
}

/** One weighted row of a wild table (§6 CH2). */
export interface EncounterEntry {
  species: string;      // MonSpecies id — the encounter lint enforces existence
  weight: number;       // relative weight, > 0
  lv: [number, number]; // inclusive level range, 1 ≤ lo ≤ hi
}
/** Wild-encounter table, consumed by systems/encounter.ts when the player
 *  finishes a WALK step onto a `~` tile (warp arrivals never roll). */
export interface EncounterTable {
  rate: number;              // 0..1 chance per qualifying step
  entries: EncounterEntry[]; // non-empty when the table exists
}

export interface MapDef {
  id: MapId;
  name: string;
  pal: string;
  music: string;
  grid: string[][];  // mutable char grid
  w: number;
  h: number;
  npcs: NpcDef[];
  /** keyed `x,y` → dialog PAGES (each ≤3 lines × 17 chars, content-lint).
   *  Was one flat line list; a 4-line sign silently lost its last line at
   *  draw time (Lyall, 2026-08-15) — pages make the overflow a lint error. */
  signs: Record<string, string[][]>;
  /** keyed `x,y` → the item ball on that `b` tile (SIDE.6 pickups) */
  items: Record<string, PickupDef>;
  warps: Record<string, WarpDef>;
  /** keys: `npc:<id>`, `at:<x>,<y>` (A facing the tile), `step:<x>,<y>`
   *  (fires on ARRIVING at the tile, no button — the goal-pad class),
   *  `tile:<char>`, `enter` */
  scripts: Record<string, ScriptStep[]>;
  /** wild table for this map's `~` tiles (CH2.1); absent = no encounters */
  encounters?: EncounterTable;
  /** SIDE.5: training-room map — a stage-3 lockdown resets the player to
   *  this tile (heat back to 1, no coin loss) instead of the whiteout. */
  drill?: { x: number; y: number };
}

// ── Phase 1 mon/move data model (plan §4.1) ────────────────────────────────

export type MoveId = string;
export type StatusId = 'PSN' | 'PAR' | 'SLP';

/** Battle effect timelines (13-battle-fx.md). Reused by category — many moves
 *  share one id; new FxIds need a main-loop review, new mappings are data. */
export type FxId = 'lunge' | 'rings' | 'gas' | 'lob' | 'bolt' | 'blast';

export interface MoveDef {
  id: MoveId;
  name: string;      // battle-menu label, ≤10 chars
  type: TypeId;
  power: number;
  acc: number;       // 0..1 hit chance
  desc: string;      // UX2.2 hover flavour, one help-bar line ≤18 (linted)
  anim: FxId;        // required — the battleFx data lint fails a missing one
  /** 'drain': attacker heals max(1, floor(dmg/2)) after a damaging hit
   *  (QOL.5). One literal on purpose — no effect framework until a second
   *  kind exists. */
  effect?: 'drain';
}

export interface MonSpecies {
  id: string;
  name: string;      // display name, ≤10 chars
  type: TypeId[];    // 1 or 2 entries
  baseHp: number;
  atk: number;
  def: number;
  spd: number;
  moves: { lv: number; move: MoveId }[];  // sorted ascending by lv
  evolvesTo?: { id: string; lv: number };
  front: SpriteRows; // 28×28 battle sprite
  back: SpriteRows;  // 24×20 battle sprite
  pal: string[];
  catchRate: number; // 0..1 base SWIPE chance (plan §4.4)
  /** MNU.3 dex page flavour. heightM/weightKg print as `HT 0.6M` /
   *  `WT 12.5KG` (toFixed(1)); dex is 1–2 lines, each ≤ DEX_LINE_CAP,
   *  drawn in the detail screen's two-line help bar. All linted. */
  heightM: number;   // 0.1 ≤ h ≤ 99.9
  weightKg: number;  // 0.1 ≤ w ≤ 999.9
  dex: string[];     // 1..2 lines, ≤ 18 glyphs each (uppercase, ASCII)
}

export interface MonInstance {
  species: string;   // MonSpecies id
  lv: number;
  hp: number;
  xp: number;
  moves: MoveId[];   // up to 4
  status?: StatusId;
  nick?: string;
  /** UX2.4: the player confirmed a refusal to evolve this mon. Permanent —
   *  gainXp never offers again, at any level. Optional so old saves read it
   *  as undefined; save.ts spreads the whole mon, so no version bump. */
  noEvolve?: boolean;
}

/** ONB.5: one of the trainer's mid-battle coaching interjections. A beat
 *  fires at most once per battle, and not at all when `unless` names
 *  something the player has already done — a nudge that arrives after the
 *  fact teaches nothing, it just nags.
 *
 *  Beats: `firstTurn` as the battle opens · `playerHurt` on the first damage
 *  the player's mon takes · `itemUsed` when a heal actually lands (a refused
 *  heal is not a lesson) · `lowHp` under a third of max hp, the fallback for
 *  a player who never took the ITEM hint. `playerHurt` wins if both it and
 *  `lowHp` come due on the same hit.
 *
 *  Read ONLY for encounters with `spar: true` (battle.ts `coach`), so a real
 *  fight can never coach even if a table is attached to it by mistake —
 *  Giovanni's grunts do not offer tips. */
export interface CoachBeat {
  on: 'firstTurn' | 'playerHurt' | 'itemUsed' | 'lowHp';
  unless?: 'swiped' | 'itemUsed';
  say: string[]; // ONE battle-box page: ≤3 lines × 17 chars (content-lint)
}

/** Battle encounter (plan §4.3/§4.4). The foe references SPECIES; the player
 *  side is the party in game state, so encounters no longer carry stat blocks. */
export interface EncounterDef {
  trainer?: string;      // present = trainer battle (SWIPE steals); absent = wild (SWIPE throws a ball)
  /** ONB.5-FB: `moves` overrides the species learnset for THIS encounter —
   *  a trainer's mon drilled on something it wouldn't learn by itself. Added
   *  because the tutorial spar needed a foe that could actually threaten a
   *  def-95 POISON starter without raising its level, which would have
   *  inflated the win's xp and broken ONB.1's "the first fight dings" tuning.
   *  Absent = the learnset, as before. */
  foe: { species: string; lv: number; moves?: MoveId[] };
  uncatchable?: boolean; // §4.4: boss/set-piece wilds that refuse the ball
  /** SIDE.5: sparring match — losing skips the whiteout entirely (no coin
   *  loss, no HQ warp, party healed in place) and onLose runs as a true
   *  epilogue. The win path is untouched. */
  spar?: boolean;
  /** ONB.5: mid-battle coaching, spar-only by construction — battle.ts reads
   *  this table only when `spar` is set. At most one entry per beat. */
  coach?: CoachBeat[];
  /** ONB.5-FB: gate for the whole `coach` table, checked once at battle
   *  start. Coaching is ONBOARDING, not a permanent feature of the fight —
   *  without this Jessika lectures a veteran on every rematch, and worse,
   *  names a SODA the rematch never handed over (Lyall, 2026-08-22).
   *  Absent = coach whenever `spar` is set. */
  coachIf?: Cond;
  winText: string[];     // trainer's concession lines (one battle message)
  onWin: ScriptStep[];
  onLose: ScriptStep[];
  onFlee: ScriptStep[];
}
