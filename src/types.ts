// Shared interfaces for maps, NPCs, warps and the declarative script format
// (expansion plan §3.2/§3.3). No cross-module globals — game state lives in
// src/state.ts, quest progress in src/systems/quest.ts.
import type { SpriteRows } from './data/sprites';
import type { TypeId } from './data/typeChart';

export type Dir = 'up' | 'down' | 'left' | 'right';
export type MapId = 'hq' | 'corner' | 'vault' | 'moon1' | 'moon2' | 'moonDig' | 'hqDrill' | 'outskirts' | 'bridge';

/** [target map, x, y, facing on arrival] */
export type WarpDef = [MapId, number, number, Dir];

export interface Flags {
  briefed: boolean;
  guardBeaten: boolean;
  switchFound: boolean;
  lootTaken: boolean;
  missionDone: boolean;
  gotSmoke: boolean;
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
  // CH3 (Nugget Span) — one flag per mark on the bridge (beaten = paid out
  // + gone) and the chapter end (KIRA beaten = OPERATIVE). No save bump.
  spanCamper: boolean;
  spanPicnicker: boolean;
  spanHiker: boolean;
  spanYoungster: boolean;
  spanLass: boolean;
  ch3Done: boolean;
}
export type FlagName = keyof Flags;

/** Conditions usable in script `if` steps and NPC visibility. */
export type Cond =
  | { flag: FlagName }
  | { notFlag: FlagName }
  | { egg: string }
  | { notEgg: string }
  | { varEq: [string, number] };

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
  | { choice: { say: string[][]; yes: ScriptStep[]; no?: ScriptStep[] } }; // ask YES/NO on the last say page; branch runs nested like `if` (2026-08-15, suspends)

export interface NpcDef {
  id: string;
  char: string;
  x: number;
  y: number;
  dir: Dir;
  pal?: string;      // OBJ_PAL override
  goneIf?: Cond;     // hidden + non-blocking when condition holds
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
  items: Record<string, { name: string; flag: FlagName }>;
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

/** Battle encounter (plan §4.3/§4.4). The foe references SPECIES; the player
 *  side is the party in game state, so encounters no longer carry stat blocks. */
export interface EncounterDef {
  trainer?: string;      // present = trainer battle (SWIPE steals); absent = wild (SWIPE throws a ball)
  foe: { species: string; lv: number };
  uncatchable?: boolean; // §4.4: boss/set-piece wilds that refuse the ball
  /** SIDE.5: sparring match — losing skips the whiteout entirely (no coin
   *  loss, no HQ warp, party healed in place) and onLose runs as a true
   *  epilogue. The win path is untouched. */
  spar?: boolean;
  winText: string[];     // trainer's concession lines (one battle message)
  onWin: ScriptStep[];
  onLose: ScriptStep[];
  onFlee: ScriptStep[];
}
