// BELOW DECK — dialogue & interaction scripts (CH4.2). The hold watch's
// line is flavour only; contact still starts `ship_hold` via heatGuard.
import type { ScriptStep } from '../../types';

export const deck2Scripts: Record<string, ScriptStep[]> = {
  'npc:hold_watch': [{ say: [['WATCH: Stay', 'off the crates.']] }],
};
