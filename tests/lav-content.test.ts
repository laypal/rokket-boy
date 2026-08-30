// CH5.2/5.3 interpreter + map-pin tests (ship-content.test.ts idiom): pin
// the three LAVENDAR TOWER grids, every warp landing tile, the 2F stair
// ghost's SCOPE gate, the 3F spirit ambush and altar set piece's event
// order, the reload-consistency repair, the Giovanni hand-in order, the
// once-only MEDIUM fights, and lav_spirit's unwinnable shape.
import { describe, it, expect, beforeEach } from 'vitest';
import { runScript, type ScriptHooks } from '../src/systems/script';
import { quest, resetQuest, checkCond } from '../src/systems/quest';
import { MAPS } from '../src/data/maps';
import { WALKABLE } from '../src/data/tiles';
import { lav2Scripts } from '../src/data/dialog/lav2';
import { lav3Scripts } from '../src/data/dialog/lav3';
import { hqScripts } from '../src/data/dialog/hq';
import { ENCOUNTERS, RIDE_HOME } from '../src/data/encounters';
import type { ScriptStep } from '../src/types';

/** Ordered event log (ch2-content.test.ts / ship-content.test.ts idiom),
 *  extended to also log giveMon (so the altar script's npcRun-BEFORE-giveMon
 *  ordering can be checked directly) and every say's full page set (so a
 *  multi-page briefing can be checked by PAGE count, not event count — one
 *  `say` step is one hook call regardless of how many pages it carries). */
function eventHooks() {
  const events: string[] = [];
  const says: string[][][] = [];
  const hooks: ScriptHooks = {
    say: (pages, done) => { events.push('say'); says.push(pages); done(); },
    battle: (id, done) => { events.push('battle:' + id); done(null); },
    warp: (w, done) => { events.push('warp:' + w.join(',')); done(); },
    sfx: (id) => events.push('sfx:' + id),
    music: (n) => events.push('music:' + n),
    setTile: (x, y, ch) => events.push(`setTile:${x},${y},${ch}`),
    addWarp: () => {},
    locker: (done) => done(),
    shop: (id, done) => { events.push('shop:' + id); done(); },
    endScreen: () => events.push('endScreen'),
    rankUp: (r, done) => { events.push('rankUp:' + r); done(); },
    heat: (n) => events.push('heat:' + n),
    giveMon: (species, lv) => events.push('giveMon:' + species + ',' + lv),
    npcRun: (id, done) => { events.push('npcRun:' + id); done(); },
    healParty: () => events.push('healParty'),
    sysMsg: (lines) => events.push('sysMsg:' + lines[0]),
    jobs: (done) => { events.push('jobs'); done(); },
    cardFlip: (done) => { events.push('cardFlip'); done(); },
    tour: (_stops, done) => { events.push('tour'); done(); },
    choice: (_p, done) => { events.push('choice'); done(true); },
  };
  return { hooks, events, says };
}

beforeEach(() => resetQuest());

describe('CH5.2 map pins (frozen grids, .paul/PLAN.md §11)', () => {
  const LAV1 = [
    '####################',
    '#  t   t    t   t  #',
    '#                  #',
    '#  t  ~~~~~~~   t  #',
    '#     ~~~~~~~      #',
    '#  t  ~~~~~~~   t  #',
    '#                  #',
    '#  t   t    t   t >#',
    '#                  #',
    '#  P     s      P  #',
    '#                  #',
    '#########o##########',
  ];
  const LAV2 = [
    '####################',
    '#>  t     t      t #',
    '#   ##########     #',
    '#   #~~~~~~~~#  t  #',
    '# t #~~~~~~~~#     #',
    '#   #~~~~b~~~#  t  #',
    '#   #~~~~~~~~#     #',
    '#   #~~~~~~~~#  t  #',
    '#   ####  ####     #',
    '#                  #',
    '#  t        t     >#',
    '####################',
  ];
  const LAV3 = [
    '####################',
    '#K$K               #',
    '#                  #',
    '#tttttttttttt      #',
    '#~~~~~~~~~~~~      #',
    '#~~~~~~~~~~~~t     #',
    '#tttttttttttt      #',
    '#                  #',
    '#  t     t   t     #',
    '#              b   #',
    '#  t     t   t    >#',
    '####################',
  ];

  it('lav1/lav2/lav3 grids match the frozen spec, 20x12', () => {
    for (const [id, rows] of [['lav1', LAV1], ['lav2', LAV2], ['lav3', LAV3]] as const) {
      const map = MAPS[id];
      expect(map.w, `${id} width`).toBe(20);
      expect(map.h, `${id} height`).toBe(12);
      expect(map.grid.map((r) => r.join('')), `${id} grid`).toEqual(rows);
    }
  });

  it('every pinned warp lands on a walkable tile', () => {
    const pairs: [string, [number, number], string, [number, number]][] = [
      ['lav1', [9, 11], 'outskirts', [10, 7]],
      ['lav1', [18, 7], 'lav2', [1, 2]],
      ['outskirts', [10, 8], 'lav1', [9, 10]],
      ['lav2', [1, 1], 'lav1', [18, 8]],
      ['lav2', [18, 10], 'lav3', [18, 9]],
      ['lav3', [18, 10], 'lav2', [18, 9]],
    ];
    for (const [fromId, [fx, fy], toId, [tx, ty]] of pairs) {
      const from = MAPS[fromId as keyof typeof MAPS];
      const warp = from.warps[`${fx},${fy}`];
      expect(warp, `${fromId} (${fx},${fy}) warp`).toBeDefined();
      expect(warp[0], `${fromId} (${fx},${fy}) target`).toBe(toId);
      expect(warp[1], `${fromId} (${fx},${fy}) target x`).toBe(tx);
      expect(warp[2], `${fromId} (${fx},${fy}) target y`).toBe(ty);
      const dest = MAPS[toId as keyof typeof MAPS];
      const tile = dest.grid[ty][tx];
      expect(WALKABLE.has(tile), `${toId} (${tx},${ty}) landing tile "${tile}"`).toBe(true);
    }
  });

  it('all three maps carry fog, the dirge track and the lavendar palette, no heat fields', () => {
    for (const id of ['lav1', 'lav2', 'lav3'] as const) {
      const map = MAPS[id];
      expect(map.fog, id).toBe(true);
      expect(map.music, id).toBe('dirge');
      expect(map.pal, id).toBe('lavendar');
      expect(map.heatZone, id).toBeUndefined();
      expect(map.watch, id).toBeUndefined();
      expect(map.lockdown, id).toBeUndefined();
      expect(map.disguise, id).toBeUndefined();
    }
  });
});

describe('the 2F stair ghost (CH5.0 §6 gate)', () => {
  it('sits ON the stairs tile (18,10) and is gone once the SCOPE is held', () => {
    const ghost = MAPS.lav2.npcs.find((n) => n.id === 'stair_ghost');
    expect(ghost, 'stair_ghost npc').toBeDefined();
    expect(ghost!.x).toBe(18);
    expect(ghost!.y).toBe(10);
    expect(ghost!.goneIf).toBeDefined();

    expect(checkCond(ghost!.goneIf!)).toBe(false); // fresh: blocks the stairs
    quest.items.push('SILF SCOPE');
    expect(checkCond(ghost!.goneIf!)).toBe(true); // SCOPE in hand: steps aside
  });
});

describe('the 3F spirit ambush (step:6,1 / step:6,2, belt and braces)', () => {
  for (const key of ['step:6,1', 'step:6,2'] as const) {
    it(`${key}: fresh — say then battle:lav_spirit`, () => {
      const { hooks, events } = eventHooks();
      runScript(lav3Scripts[key], hooks);
      expect(events).toEqual(['say', 'battle:lav_spirit']);
    });

    it(`${key}: ch5Spirit already set — a no-op`, () => {
      quest.flags.ch5Spirit = true;
      const { hooks, events } = eventHooks();
      runScript(lav3Scripts[key], hooks);
      expect(events).toEqual([]);
    });
  }
});

describe('the altar (lav3 at:2,1)', () => {
  it('fresh: say, say, setTile, giveItem is a real item, setFlag, sfx, sysMsg, npcRun BEFORE giveMon, then the ride-home choice last', () => {
    quest.flags.ch5Spirit = true; // CH5-FB: the altar refuses until she's calmed (pinned in ch5-contracts.test.ts)
    const { hooks, events } = eventHooks();
    runScript(lav3Scripts['at:2,1'], hooks);

    expect(quest.flags.ch5Mask).toBe(true);
    expect(quest.flags.ch5Myowth).toBe(true);
    expect(quest.items).toContain('BONE MASK');

    // setTile/sfx/sysMsg/npcRun/giveMon/choice all logged; giveItem is not a
    // hook (script.ts pushes straight into quest.items) so it isn't in the
    // event log — checked above via quest.items instead. Each `say` step
    // here carries 1-4 PAGES but is still ONE hook call, so 3 events is
    // right: the mask description (1 say step, 2 pages), the conscience
    // scene (1 say step, 4 pages) and "MYOWTH joined!" (1 say step, 1 page).
    const sayCount = events.filter((e) => e === 'say').length;
    expect(sayCount).toBe(3);
    expect(events[0]).toBe('say');
    expect(events[1]).toBe('setTile:2,1,%');
    const npcRunAt = events.indexOf('npcRun:myowth');
    const giveMonAt = events.findIndex((e) => e.startsWith('giveMon:'));
    expect(npcRunAt).toBeGreaterThan(0);
    expect(giveMonAt).toBeGreaterThan(npcRunAt); // npcRun runs BEFORE giveMon (his goneIf reads ch5Mask, not ch5Myowth)
    expect(events[giveMonAt]).toBe('giveMon:myowth,18');
    expect(events.filter((e) => e.startsWith('sysMsg:'))).toEqual(['sysMsg:BONE MASK!']);

    // "choice last" is a structural claim (the mocked choice hook above
    // auto-answers YES and recurses into RIDE_HOME's own warp, so it is not
    // the last EVENT) — read the else branch's data directly instead.
    const altar = lav3Scripts['at:2,1'][0] as Extract<ScriptStep, { if: unknown }>;
    const gate = altar.else![0] as Extract<ScriptStep, { if: unknown }>; // CH5-FB: the ch5Spirit gate wraps the sequence
    const seq = gate.else!;
    expect(seq[seq.length - 1]).toBe(RIDE_HOME);
  });

  it('already taken: the empty-altar line only, no re-trigger', () => {
    quest.flags.ch5Mask = true;
    const { hooks, events } = eventHooks();
    runScript(lav3Scripts['at:2,1'], hooks);
    expect(events).toEqual(['say']);
  });

  it('enter repair: setTile fires only once ch5Mask is set (reload-consistency convention)', () => {
    const fresh = eventHooks();
    runScript(lav3Scripts.enter, fresh.hooks);
    expect(fresh.events).toEqual([]);

    quest.flags.ch5Mask = true;
    const repaired = eventHooks();
    runScript(lav3Scripts.enter, repaired.hooks);
    expect(repaired.events).toEqual(['setTile:2,1,%']);
  });
});

describe('the mediums (once-only, CH5.0 §12)', () => {
  it('lav2 medium_a: fresh fights, beaten stays dazed', () => {
    const fresh = eventHooks();
    runScript(lav2Scripts['npc:medium_a'], fresh.hooks);
    expect(fresh.events).toEqual(['say', 'battle:lav_medium1']);

    quest.flags.lavMedium1 = true;
    const beaten = eventHooks();
    runScript(lav2Scripts['npc:medium_a'], beaten.hooks);
    expect(beaten.events).toEqual(['say']);
  });

  it('lav3 medium_b: fresh fights, beaten stays dazed', () => {
    const fresh = eventHooks();
    runScript(lav3Scripts['npc:medium_b'], fresh.hooks);
    expect(fresh.events).toEqual(['say', 'battle:lav_medium2']);

    quest.flags.lavMedium2 = true;
    const beaten = eventHooks();
    runScript(lav3Scripts['npc:medium_b'], beaten.hooks);
    expect(beaten.events).toEqual(['say']);
  });
});

describe('lav_spirit (CH5.0 §2 unwinnable contract)', () => {
  it('is uncatchable, unwinnable on the BONE CHARM, and plays the ghost track', () => {
    expect(ENCOUNTERS.lav_spirit.uncatchable).toBe(true);
    expect(ENCOUNTERS.lav_spirit.unwinnable).toEqual({ item: 'BONE CHARM', hint: ['She cannot be', 'hurt. Try using', 'ITEM: BONE CHARM'] }); // CH5-FB: the hint page (Lyall's wording)
    expect(ENCOUNTERS.lav_spirit.music).toBe('ghost');
    expect(ENCOUNTERS.lav_spirit.trainer).toBeUndefined();
    expect(ENCOUNTERS.lav_spirit.winText).toEqual([]);
  });

  it('onWin sets ch5Spirit; onLose carries the CHARM hint, no coins/warp either way', () => {
    const win = eventHooks();
    runScript(ENCOUNTERS.lav_spirit.onWin, win.hooks);
    expect(quest.flags.ch5Spirit).toBe(true);
    expect(win.events).toEqual(['say']); // one say STEP, two pages

    const lose = eventHooks();
    runScript(ENCOUNTERS.lav_spirit.onLose, lose.hooks);
    expect(lose.events).toEqual(['say']);
  });
});

describe('the Giovanni hand-in (hq.ts, CH5.0 §9/§12 — no rankUp this chapter)', () => {
  it('fresh ch5Mask: setFlag ch5Done -> addCoins -> sfx coin -> music victory -> endScreen, no rankUp', () => {
    quest.flags.ch5Mask = true;
    const { hooks, events } = eventHooks();
    runScript(hqScripts['npc:giovanni'], hooks);

    expect(quest.flags.ch5Done).toBe(true);
    expect(quest.coins).toBe(800);
    expect(events.some((e) => e.startsWith('rankUp:'))).toBe(false);

    const trimmed = events.filter((e) => e === 'say' || e.startsWith('sfx:') || e.startsWith('music:') || e === 'endScreen');
    expect(trimmed).toEqual(['say', 'sfx:coin', 'music:victory', 'endScreen']);
  });

  it('ch4Done only: the CH5 briefing fires, sets ch5Briefed', () => {
    quest.flags.ch4Done = true;
    const { hooks, events, says } = eventHooks();
    runScript(hqScripts['npc:giovanni'], hooks);

    expect(quest.flags.ch5Briefed).toBe(true);
    expect(quest.flags.ch5Done).toBe(false);
    expect(events.filter((e) => e === 'say').length).toBe(1); // one say STEP...
    expect(says[0].length).toBe(4); // ...carrying 4 pages
    expect(events).toContain('sysMsg:NEW JOB!');
  });

  it('ch5Done already: the CH6 briefing replaces the CH5 afterglow, no re-payout', () => {
    quest.flags.ch5Mask = true;
    quest.flags.ch5Done = true;
    quest.coins = 0;
    const { hooks, events, says } = eventHooks();
    runScript(hqScripts['npc:giovanni'], hooks);

    expect(quest.flags.ch6Briefed).toBe(true);
    expect(quest.coins).toBe(0);
    expect(events.filter((e) => e === 'say').length).toBe(1); // one say STEP...
    expect(says[0].length).toBe(5); // ...carrying 5 pages
    expect(events).toContain('sysMsg:NEW JOB!');
  });
});
