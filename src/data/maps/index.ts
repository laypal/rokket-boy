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
import { dockMap } from './dock';
import { deck1Map } from './deck1';
import { deck2Map } from './deck2';
import { cabinMap } from './cabin';
import { lav1Map } from './lav1';
import { lav2Map } from './lav2';
import { lav3Map } from './lav3';

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
  dock: dockMap,
  deck1: deck1Map,
  deck2: deck2Map,
  cabin: cabinMap,
  lav1: lav1Map,
  lav2: lav2Map,
  lav3: lav3Map,
};
