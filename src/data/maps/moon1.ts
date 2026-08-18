// MT. MÖÖN — upper cavern (CH2.2). Entrance from Gamez Corner's east wall
// (the 'o' cave mouth at corner (19,7)) lands just inside at (1,5); the same
// door tile (0,5) is the trigger back out. Stairs '>' at (18,9) descend to
// MOON DEPTHS. `~` rubble is the CH2.1 wild-encounter tile; `R` boulders are
// blocking cover, not walkable. Music is the 'cave' track (CH2.5).
import type { MapDef } from '../../types';
import { moon1Scripts } from '../dialog/moon1';
import { makeMap } from './make';

export const moon1Map: MapDef = makeMap({
  id: 'moon1',
  name: 'MT. MOON',
  pal: 'moon',
  music: 'cave',
  rows: [
    '####################',
    '# ~      R     ~~  #',
    '# ~~~     R  ~     #',
    '#~ ~    #  R  b~ R #',
    '# ~     #   R ~~ R o',
    'o                 R#',
    '#    ~   R  ## ~~  #',
    '#  ~   R   ~  ~~R  #',
    '# R  ~   ~~   ~ R  #',
    '# ~~   R    ~  R  >#',
    '#   ~~   R   ~ RR  #',
    '####################',
  ],
  // Myowth (5,1) sits off the entrance-to-stairs line so the SWIPE tutorial
  // is optional flavor, not a chokepoint. The cart vendor (2,6) likewise —
  // adjacent to the entrance route, never on it (CH2.4).
  npcs: [
    { id: 'myowth', char: 'myowth', x: 5, y: 1, dir: 'down' },
    { id: 'vendor', char: 'grunt', pal: 'gold', x: 2, y: 6, dir: 'down' },
    // ONB.8: something alive in beat 1a. Off the chapter2 e2e walked set and
    // off the entrance-to-stairs line, so it is scenery in play too.
    { id: 'introzubatt', char: 'zubatt', x: 12, y: 2, dir: 'down' },
  ],
  signs: {},
  // SIDE.6: a SODA on the plain-floor cell (14,3) — clear of chapter2.spec.ts's
  // walked set (row y=5 full width, column x=17 y=5-9, the (18,9) stairs).
  items: { '14,3': { id: 'moon1_soda', item: 'SODA' } },
  warps: {
    '0,5': ['corner', 18, 7, 'left'],
    '18,9': ['moon2', 2, 2, 'down'],
    // CH3.2 — east door to CERULEUN EDGE; off the ch2.6 e2e route (which
    // only ever touches x=18/19 in transit on other rows), so untouched
    '19,4': ['outskirts', 1, 6, 'right'],
  },
  scripts: moon1Scripts,
  // CH2.3 frozen table (task card 20-ch2-mt-moon.md) — do not retune here.
  encounters: {
    rate: 0.12,
    entries: [
      { species: 'ratikatt', weight: 3, lv: [3, 5] },
      { species: 'zubatt', weight: 2, lv: [3, 5] },
    ],
  },
});
