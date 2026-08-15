// Shared whiteout (plan §4.3). Extracted from battle.ts in 1f.5 so the HEAT
// stage-3 lockdown (1f.6) triggers the identical penalty without a
// world<->battle import cycle. recovery imports state/quest, engine leaves
// (renderer/audio) and pure data/systems (maps/mons/mon) — NEVER world/battle.
import { G } from '../state';
import { quest } from './quest';
import { MAPS } from '../data/maps';
import { SPECIES } from '../data/mons';
import { maxHp } from './mon';
import { startFade } from '../engine/renderer';
import { Audio2 } from '../engine/audio';

/** Plan §4.3 whiteout: back to the last HQ, minus 10% coins. The full heal is
 *  a PLAN.md assumption — no heal items exist until 1c, so not healing would
 *  softlock the game. `onDone` runs the caller's tail synchronously after the
 *  state is set to 'worldwait' (battle passes its ScriptHooks `done`; the 1f.6
 *  world caller passes a no-op). */
export function sharedWhiteout(lostCoins: number, onDone: () => void): void {
  quest.coins -= lostCoins;
  for (const m of G.party) m.hp = maxHp(SPECIES[m.species], m.lv);
  G.battle = null;
  startFade(() => {
    G.map = MAPS[G.lastHq.map];
    Object.assign(G.player, { x: G.lastHq.x, y: G.lastHq.y, dir: 'down', moving: false, prog: 0 });
    G.state = 'world';
    Audio2.play(G.map.music);
  });
  G.state = 'worldwait';
  onDone();
}
