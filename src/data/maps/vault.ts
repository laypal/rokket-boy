// HIDDEN VAULT
import type { MapDef } from '../../types';
import { vaultScripts } from '../dialog/vault';
import { makeMap } from './make';

export const vaultMap: MapDef = makeMap({
  id: 'vault',
  name: 'HIDDEN VAULT',
  pal: 'vault',
  music: 'hq',
  rows: [
    '############',
    '=====V======',
    '#          #',
    '#X   $   XX#',
    '#X         #',
    '#          #',
    '#####>######',
  ],
  npcs: [],
  signs: {},
  items: {},
  warps: { '5,6': ['corner', 2, 3, 'down'] },
  scripts: vaultScripts,
});
