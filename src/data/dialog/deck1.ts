// S.S. ANN DECK — dialogue & interaction scripts (CH4.2). The captain is
// pompous flavour (points the player at his own cabin without meaning to);
// the three gala guests are one dry line each; the watch guards get a curt
// line — they are ALSO heatGuards, so the talk is flavour, not the gate.
import type { ScriptStep } from '../../types';

export const deck1Scripts: Record<string, ScriptStep[]> = {
  'npc:captain': [
    { say: [['CAPTAIN: Welcome', 'aboard the S.S.', 'ANN. Fine ship.']] },
    { say: [['My cabin, aft,', 'is off limits.', "Security's on it."]] },
  ],
  'npc:guest_a': [{ say: [['GUEST: Fine', 'party. Terrible', 'band, though.']] }],
  'npc:guest_b': [{ say: [['GUEST: Open bar', 'is the only', 'reason I came.']] }],
  'npc:guest_c': [{ say: [['GUEST: Rumor is', 'the captain owes', 'someone money.']] }],
  'npc:watch_a': [{ say: [['WATCH: Move it.']] }],
  'npc:watch_b': [{ say: [['WATCH: Stay back.']] }],
};
