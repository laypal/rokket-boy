// SYLPHCO 4F — dialogue & interaction scripts (CH6). LABS, the second STEALTH
// floor: the only interaction is the card-key door 'd' (12,7) into the lift
// room. Signs and guards are map data.
import type { ScriptStep } from '../../types';
import { cardDoor, openDoors } from './sylph';

export const syl4Scripts: Record<string, ScriptStep[]> = {
  'at:12,7': cardDoor(12, 7),
  enter: [openDoors([[12, 7]])],
};