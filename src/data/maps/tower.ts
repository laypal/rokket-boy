// ROKKET CORP — the exterior, ONB.8's beat 2. A backdrop and nothing else:
// no warps in or out, no NPCs, no encounters. The cold open sets G.map to it
// directly (never through performWarp) and scrolls the camera from the door
// at the bottom to the one lit window at the top. tests/map-lint.test.ts
// asserts nothing ever warps here.
//
// 10 tiles wide = 160px = exactly one screen, so the camera is pinned
// horizontally and only ever climbs. The building occupies columns 2-7.
// Five rows of sky above the roof: the intro's text band covers the top
// 80px of the screen, so the roof (row 5) and the lit top floor (row 6)
// have to sit below it when the camera reaches the top.
import type { MapDef } from '../../types';
import { makeMap } from './make';

export const towerMap: MapDef = makeMap({
  id: 'tower',
  name: 'ROKKET CORP',
  pal: 'tower',
  music: 'title', // inert: the intro owns audio and never asks the map
  rows: [
    '..........',
    '..........',
    '..........',
    '..........',
    '..........',
    '..AAAAAA..',
    '..FFlFFF..', // the lit top floor — beat 2c holds here
    '..FFFFFF..',
    '..kFkFkF..',
    '..FFFFFF..',
    '..kFFFkF..',
    '..FFFFFF..',
    '..kFkFFF..',
    '..FFFFFF..',
    '..FkFFkF..',
    '..FFFFFF..',
    '..kFkFkF..',
    '..FFFFFF..',
    '..FkFFFk..',
    '..FFFFFF..',
    '..kFkFkF..',
    '..FFFFFF..',
    '..FkFFkF..',
    '..FFFFFF..',
    '..kFkFkF..',
    '..FFFFFF..',
    '..FkFFkF..',
    '..FFppFF..', // the R sign, directly over the door
    '..FFooFF..', // the door — beat 2a opens on this
    '..FFFFFF..',
  ],
  npcs: [],
  signs: {},
  items: {},
  warps: {},
  scripts: {},
});
