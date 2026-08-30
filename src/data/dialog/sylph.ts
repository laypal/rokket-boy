// SYLPHCO TOWER — shared interaction helpers (CH6.0 §2). `cardDoor` is the
// card-key door at (x,y): holding the CARD KEY opens it (the tile becomes
// 'o'), otherwise the locked page names where the key is — every locked door
// is its own hint (the no-softlock rule, plan §5.6). `openDoors` is the
// reload-repair step (dos-and-donts reload-consistency convention): with the
// key held, every door on the floor is already open when you arrive.
import type { ScriptStep } from '../../types';

export function cardDoor(x: number, y: number): ScriptStep[] {
  return [{
    if: { hasItem: 'CARD KEY' },
    then: [{ sfx: 'switch' }, { setTile: [x, y, 'o'] }, { say: [['The CARD KEY', 'blinks green.', 'The door slides.']] }],
    else: [{ say: [['LOCKED. A card', 'reader blinks', 'red at you.'], ['The CARD KEY is', 'filed in RECORDS', 'on 3F.']] }],
  }];
}

export function openDoors(doors: [number, number][]): ScriptStep {
  return { if: { hasItem: 'CARD KEY' }, then: doors.map(([x, y]) => ({ setTile: [x, y, 'o'] as [number, number, string] })) };
}