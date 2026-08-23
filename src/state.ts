// Typed game-state store (was the untyped global `G`). Quest progress lives
// separately in systems/quest.ts.
import type { Dir, MapDef, MapId, MonInstance } from './types';
import type { BattleState } from './systems/battle';
import type { HeatState } from './systems/heat';
import { MAPS } from './data/maps';
import { SPECIES } from './data/mons';
import { makeMon } from './systems/mon';

export type StateName =
  | 'boot'
  | 'title'
  | 'intro'
  | 'world'
  | 'worldwait'
  | 'dialog'
  | 'menu'
  | 'battle'
  | 'locker'
  | 'shop'
  | 'jobs'
  | 'cardflip'  // SIDE.2: the DEALER's PICKPOCKET table (jobs-class modal)
  | 'levelup'   // SIDE.7: LEVEL CANDY's out-of-battle level-up (move-learn / evolution) scene
  | 'end'
  | 'rankcard';

export interface Player {
  x: number;
  y: number;
  dir: Dir;
  moving: boolean;
  prog: number;   // pixels progressed into current tile move
  step: number;   // alternating step frame bit
  turnLock: number;
}

export interface DialogState {
  pages: string[][];
  page: number;
  chars: number;
  after: (() => void) | null;
  openFrame: number; // G.frame at open — drives the cosmetic slide-in only
  /** YES/NO picker on the LAST page ({ choice } step, 2026-08-15). `sel`
   *  0 = YES, 1 = NO; the answer routes through onAnswer instead of after.
   *  Absent = plain dialogue. */
  choice?: { sel: number; onAnswer: (yes: boolean) => void };
}

export interface MenuState {
  items: string[];
  sel: number;
  sub: string | null;
  openFrame: number; // G.frame at open — drives the cosmetic slide-in only
}

export interface GameState {
  state: StateName;
  frame: number;
  map: MapDef;
  player: Player;
  fade: number; // 0..9 shutter fade
  fadeDir: number;
  afterFade: (() => void) | null;
  dialog: DialogState | null;
  menu: MenuState | null;
  battle: BattleState | null;
  party: MonInstance[];  // §4.3: up to 4; index order is the SWITCH list
  box: MonInstance[];    // MON LOCKER overflow (terminal UI lands in 1c)
  lastHq: { map: MapId; x: number; y: number }; // whiteout return point
  playSeconds: number;   // §4.6: gameplay time (not boot/title/intro)
  /** §4.8 HEAT: per-map alarm runtime. Absent key = calm. Set by the heat
   *  script hook (worldHooks.heat), ticked in worldUpdate (1f.6), serialized
   *  into SaveV2.heat. Timestamps are playSeconds-relative. */
  heatState: Partial<Record<MapId, HeatState>>;
  /** §4.7 rank card: set by the rankUp script hook, drawn by scenes.ts;
   *  after() resumes the suspended script on dismiss. */
  rankCard: { rank: string; after: () => void } | null;
  /** ONB.8: set while a cinematic is driving the view. `camX`/`camY` are the
   *  camera TARGET in pixels (cameraFor clamps them); `hidePlayer` drops the
   *  player sprite out of the draw. Transient — never saved. */
  cutscene: { camX: number; camY: number; hidePlayer: boolean } | null;
  bootT: number;
  titleT: number;
  introPage: number;
  /** ONB.8: frames spent on the current intro card. */
  introT: number;
  konami: string[];
  endT: number;
  mapNameT: number;
}

export const G: GameState = {
  state: 'boot',
  frame: 0,
  map: MAPS.hq,
  player: { x: 9, y: 7, dir: 'down', moving: false, prog: 0, step: 0, turnLock: 0 },
  fade: 0,
  fadeDir: 0,
  afterFade: null,
  dialog: null,
  menu: null,
  battle: null,
  party: [makeMon(SPECIES.koffink, 5)], // the starter (plan §4.2)
  box: [],
  lastHq: { map: 'hq', x: 9, y: 7 },
  playSeconds: 0,
  heatState: {},
  rankCard: null,
  cutscene: null,
  bootT: 0,
  titleT: 0,
  introPage: 0,
  introT: 0,
  konami: [],
  endT: 0,
  mapNameT: 0,
};

export const DIRV: Record<Dir, [number, number]> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};
