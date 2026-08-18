import type { MapDef, MapId } from '../../types';
import { hqMap } from './hq';
import { cornerMap } from './corner';
import { vaultMap } from './vault';
import { moon1Map } from './moon1';
import { moon2Map } from './moon2';
import { moonDigMap } from './moonDig';
import { hqDrillMap } from './hqDrill';
import { outskirtsMap } from './outskirts';
import { bridgeMap } from './bridge';
import { towerMap } from './tower';

export const MAPS: Record<MapId, MapDef> = {
  hq: hqMap,
  corner: cornerMap,
  vault: vaultMap,
  moon1: moon1Map,
  moon2: moon2Map,
  moonDig: moonDigMap,
  hqDrill: hqDrillMap,
  outskirts: outskirtsMap,
  bridge: bridgeMap,
  tower: towerMap,
};
