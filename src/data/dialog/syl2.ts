// SYLPHCO 2F — dialogue & interaction scripts (CH6). The first STEALTH floor:
// the only interaction is the card-key door 'd' (18,9) into the east wing.
// Signs and guards are map data.
import type { ScriptStep } from '../../types';
import { cardDoor, openDoors } from './sylph';

export const syl2Scripts: Record<string, ScriptStep[]> = {
  'at:18,9': cardDoor(18, 9),
  enter: [openDoors([[18, 9]])],
};