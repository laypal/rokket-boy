// CH6.0 interpreter + map-pin tests (ship-content/lav-content idiom): pin the
// five frozen SYLPHCO grids and sizes, every pad warp and the lobby/dock
// doors' landing tiles, the card-key door behaviour and reload repair, the
// DJames onboarding gate, the BOSS BALL chest event order, the heal pad's
// YES/NO split, the bodyguard duo, and the Giovanni CH6 briefing/hand-in
// chain. Mirrors tests/lav-content.test.ts (CH5) — eventHooks copies its
// ordered-event-log harness, with the choice hook's answer made settable so
// the heal pad can be driven BOTH ways.
import { describe, it, expect, beforeEach } from 'vitest';
import { runScript, type ScriptHooks } from '../src/systems/script';
import { quest, resetQuest } from '../src/systems/quest';
import { MAPS } from '../src/data/maps';
import { WALKABLE } from '../src/data/tiles';
import { syl1Scripts } from '../src/data/dialog/syl1';
import { syl5Scripts } from '../src/data/dialog/syl5';
import { hqScripts } from '../src/data/dialog/hq';
import { RIDE_HOME } from '../src/data/encounters';
import type { ScriptStep } from '../src/types';

function eventHooks(choiceYes = true) {
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
    choice: (_p, done) => { events.push('choice'); done(choiceYes); },
  };
  return { hooks, events, says };
}

beforeEach(() => resetQuest());

describe('CH6.1 map pins (frozen grids, .paul/plan/ch6-sylphco/maps.md §12)', () => {
  const SYL1 = [
    '####################',
    '#K K K    C    I   #',
    '#                  #',
    '#s       ,,,,,,    #',
    '#  W     ,,,,,,    #',
    '#        ,,,,,,    #',
    '#  P              P#',
    '#   ######d#####   #',
    '#   #  s  W    #   #',
    '#   ############   #',
    '#                  #',
    '#########o##########',
  ];
  const SYL2 = [
    '########################',
    '#W s      L L L        #',
    '#                      #',
    '#  X X X     X         #',
    '#                      #',
    '#     X X       X X X  #',
    '#                      #',
    '#  D D D      X        #',
    '#                 ######',
    '#   X   X   X     d  W #',
    '#W s              #W  s#',
    '########################',
  ];
  const SYL3 = [
    '####################',
    '#W s   L L L L L   #',
    '#                  #',
    '#  ~~~~    C  C    #',
    '#  ~~~~            #',
    '#  ~~~~   D D D    #',
    '#                  #',
    '#   L L L     ######',
    '#             #b W #',
    '#  X   X      ## ###',
    '#                  #',
    '####################',
  ];
  const SYL4 = [
    '########################',
    '#W s     X   X         #',
    '#                      #',
    '#  X X    L L L   X    #',
    '#                      #',
    '#     D D    X X       #',
    '#  X               X   #',
    '#        ###d###       #',
    '#        #     #       #',
    '#  X X   # W s #  X    #',
    '#        #######       #',
    '########################',
  ];
  const SYL5 = [
    '####################',
    '#W s      P     P  #',
    '#                  #',
    '#   C C      L L   #',
    '#                  #',
    '#  D D    h   s    #',
    '#                  #',
    '#######d############',
    '#  W    I$I        #',
    '#  s               #',
    '#                  #',
    '####################',
  ];

  it('syl1..syl5 grids match the frozen spec, 20/24/20/24/20 x 12', () => {
    const pins = [
      ['syl1', SYL1, 20],
      ['syl2', SYL2, 24],
      ['syl3', SYL3, 20],
      ['syl4', SYL4, 24],
      ['syl5', SYL5, 20],
    ] as const;
    for (const [id, rows, w] of pins) {
      const map = MAPS[id];
      expect(map.w, `${id} width`).toBe(w);
      expect(map.h, `${id} height`).toBe(12);
      expect(map.grid.map((r) => r.join('')), `${id} grid`).toEqual(rows);
    }
    // The lobby/dock door tile is the shared seam with the CH4 quayside.
    expect(MAPS.dock.grid[6][19], 'dock (19,6) is the SYLPHCO door').toBe('o');
  });

  it('all 14 warps (12 pads + the lobby/dock doors) land on walkable tiles', () => {
    const pairs: [string, [number, number], string, [number, number]][] = [
      ['syl1', [3, 4], 'syl2', [1, 1]],
      ['syl1', [10, 8], 'syl5', [3, 8]],
      ['syl1', [9, 11], 'dock', [18, 6]],
      ['syl2', [1, 1], 'syl1', [3, 4]],
      ['syl2', [1, 10], 'syl3', [1, 1]],
      ['syl2', [19, 10], 'syl3', [17, 8]],
      ['syl2', [21, 9], 'syl4', [1, 1]],
      ['syl3', [1, 1], 'syl2', [1, 10]],
      ['syl3', [17, 8], 'syl2', [19, 10]],
      ['syl4', [1, 1], 'syl2', [21, 9]],
      ['syl4', [11, 9], 'syl5', [1, 1]],
      ['syl5', [1, 1], 'syl4', [11, 9]],
      ['syl5', [3, 8], 'syl1', [10, 8]],
      ['dock', [19, 6], 'syl1', [9, 10]],
    ];
    for (const [fromId, [fx, fy], toId, [tx, ty]] of pairs) {
      const from = MAPS[fromId as keyof typeof MAPS];
      const warp = from.warps[`${fx},${fy}`];
      expect(warp, `${fromId} (${fx},${fy}) warp`).toBeDefined();
      expect(warp[0], `${fromId} (${fx},${fy}) target`).toBe(toId);
      expect(warp[1], `${fromId} (${fx},${fy}) target x`).toBe(tx);
      expect(warp[2], `${fromId} (${fx},${fy}) target y`).toBe(ty);
      const tile = MAPS[toId as keyof typeof MAPS].grid[ty][tx];
      expect(WALKABLE.has(tile), `${toId} (${tx},${ty}) landing tile "${tile}"`).toBe(true);
    }
  });
});

describe('the card-key doors (CH6.0 §2 / sylph.ts cardDoor)', () => {
  it('without the key: the locked page names RECORDS on 3F, no tile change', () => {
    const { hooks, events, says } = eventHooks();
    runScript(syl1Scripts['at:10,7'], hooks);
    expect(events).toEqual(['say']);
    expect(says[0][0].join(' ')).toContain('LOCKED');
    expect(says[0].map((p) => p.join(' ')).join(' ')).toContain('3F');
    expect(events.some((e) => e.startsWith('setTile:'))).toBe(false);
  });

  it('with the key: sfx switch -> setTile to o -> confirmation line', () => {
    quest.items.push('CARD KEY');
    const { hooks, events } = eventHooks();
    runScript(syl1Scripts['at:10,7'], hooks);
    expect(events).toEqual(['sfx:switch', 'setTile:10,7,o', 'say']);
  });
});

describe('the reload repair (CH6.0 §2 / sylph.ts openDoors)', () => {
  it('fresh: enter opens nothing; with the key held, every door is already open', () => {
    const fresh = eventHooks();
    runScript(syl1Scripts.enter, fresh.hooks);
    expect(fresh.events).toEqual([]);

    quest.items.push('CARD KEY');
    const repaired = eventHooks();
    runScript(syl1Scripts.enter, repaired.hooks);
    expect(repaired.events).toEqual(['setTile:10,7,o']);
  });

  it('syl5 enter: the office door opens with the key, the chest repairs on ch6Ball', () => {
    quest.items.push('CARD KEY');
    const opened = eventHooks();
    runScript(syl5Scripts.enter, opened.hooks);
    expect(opened.events).toEqual(['setTile:7,7,o']);

    quest.flags.ch6Ball = true;
    const chestRepaired = eventHooks();
    runScript(syl5Scripts.enter, chestRepaired.hooks);
    expect(chestRepaired.events).toEqual(['setTile:7,7,o', 'setTile:9,8,%']);
  });
});

describe('DJames, the inside man (CH6.0 §7)', () => {
  it('first talk: sets ch6Smoke + ch6Rules, hands over exactly one SMOKE BALL, then teaches the CARD KEY/BOSS BALL', () => {
    const { hooks, events, says } = eventHooks();
    runScript(syl1Scripts['npc:djames'], hooks);

    expect(quest.flags.ch6Smoke).toBe(true);
    expect(quest.flags.ch6Rules).toBe(true);
    expect(quest.items.filter((i) => i === 'SMOKE BALL')).toHaveLength(1);
    expect(events.filter((e) => e === 'say').length).toBe(3); // rules (8 pp) + gift (1 pp) + goals (3 pp)
    expect(says[0][0][0]).toBe('DJAMES: Psst.');
    expect(events).toContain('sysMsg:GOT SMOKE BALL!');
    expect(events).toContain('sysMsg:RULES LEARNED!');
  });

  it('second talk: no second SMOKE BALL, same opener, still RULES LEARNED', () => {
    quest.flags.ch6Smoke = true;
    const { hooks, events, says } = eventHooks();
    runScript(syl1Scripts['npc:djames'], hooks);

    expect(quest.items.filter((i) => i === 'SMOKE BALL')).toHaveLength(0);
    expect(quest.flags.ch6Rules).toBe(true);
    expect(says[0][0][0]).toBe('DJAMES: Psst.');
    expect(events).toContain('sysMsg:RULES LEARNED!');
    expect(events.some((e) => e === 'sysMsg:GOT SMOKE BALL!')).toBe(false);
  });
});

describe('the BOSS BALL chest (syl5 at:9,8)', () => {
  it('fresh: the bodyguards block it', () => {
    const { hooks, events } = eventHooks();
    runScript(syl5Scripts['at:9,8'], hooks);
    expect(events).toEqual(['say']);
  });

  it('ch6Duo won: say -> setTile -> giveItem (quest.items) -> sfx -> sysMsg -> the ride-home choice last', () => {
    quest.flags.ch6Duo = true;
    const { hooks, events } = eventHooks();
    runScript(syl5Scripts['at:9,8'], hooks);

    expect(quest.flags.ch6Ball).toBe(true);
    expect(quest.items).toContain('BOSS BALL');
    // giveItem is not a hook (script.ts pushes straight into quest.items), so
    // it has no event — checked above via quest.items instead. Each `say`
    // step is ONE event regardless of pages; the steal says 2 pages.
    expect(events.slice(0, 4)).toEqual(['say', 'setTile:9,8,%', 'sfx:item', 'sysMsg:BOSS BALL!']);
    expect(events[4]).toBe('choice');

    // "choice last" is structural (the mocked hook auto-answers YES and
    // recurses into RIDE_HOME's own warp) — read the steal's last step.
    const at = syl5Scripts['at:9,8'][0] as Extract<ScriptStep, { if: unknown }>;
    const gate = at.else![0] as Extract<ScriptStep, { if: unknown }>; // the notFlag ch6Duo gate
    const seq = gate.else!;
    expect(seq[seq.length - 1]).toBe(RIDE_HOME);
  });

  it('already emptied: the empty-case line only', () => {
    quest.flags.ch6Ball = true;
    const { hooks, events } = eventHooks();
    runScript(syl5Scripts['at:9,8'], hooks);
    expect(events).toEqual(['say']);
  });
});

describe('the heal pad (syl5 step:10,5, CH6.0 §4 — asks first)', () => {
  it('answering yes: choice -> healParty -> sfx -> PARTY HEALED!', () => {
    const { hooks, events } = eventHooks(true);
    runScript(syl5Scripts['step:10,5'], hooks);
    expect(events).toEqual(['choice', 'healParty', 'sfx:item', 'sysMsg:PARTY HEALED!']);
  });

  it('answering no: only the choice, no heal', () => {
    const { hooks, events } = eventHooks(false);
    runScript(syl5Scripts['step:10,5'], hooks);
    expect(events).toEqual(['choice']);
  });
});

describe('the bodyguard duo (syl5 guard_a/guard_b, CH6.0 §5)', () => {
  it('both guards run the SAME script, no heal between the chained fights', () => {
    expect(syl5Scripts['npc:guard_a']).toBe(syl5Scripts['npc:guard_b']);

    const { hooks, events } = eventHooks();
    runScript(syl5Scripts['npc:guard_a'], hooks);
    // say, then straight into syl_guard1 — no healParty between (the chain
    // syl_guard1 -> syl_guard2 is pinned in ch6-contracts.test.ts).
    expect(events).toEqual(['say', 'battle:syl_guard1']);
    expect(events.some((e) => e === 'healParty')).toBe(false);
  });

  it('ch6Duo already set: no re-trigger (the npc is goneIf ch6Duo anyway)', () => {
    quest.flags.ch6Duo = true;
    const { hooks, events } = eventHooks();
    runScript(syl5Scripts['npc:guard_a'], hooks);
    expect(events).toEqual([]);
  });
});

describe('the Giovanni CH6 chain (hq.ts, CH6.0 §10)', () => {
  it('ch6Ball true: the BOSS BALL hand-in — say -> victory -> rankUp:EXECUTIVE -> endScreen, ch6Done set', () => {
    quest.flags.ch6Ball = true;
    quest.rank = 'LIEUTENANT'; // CH5's rank; promotion is the CH6 reward
    const { hooks, events } = eventHooks();
    runScript(hqScripts['npc:giovanni'], hooks);

    expect(quest.flags.ch6Done).toBe(true);
    expect(quest.rank).toBe('EXECUTIVE');
    expect(events).toEqual(['say', 'music:victory', 'rankUp:EXECUTIVE', 'endScreen']);
  });

  it('ch5Done only: the CH6 briefing fires, sets ch6Briefed (5 pages, no promote)', () => {
    quest.flags.ch5Done = true;
    const { hooks, events, says } = eventHooks();
    runScript(hqScripts['npc:giovanni'], hooks);

    expect(quest.flags.ch6Briefed).toBe(true);
    expect(quest.flags.ch6Done).toBe(false);
    expect(events.filter((e) => e === 'say').length).toBe(1); // one say STEP...
    expect(says[0].length).toBe(5); // ...carrying 5 pages
    expect(events).toContain('sysMsg:NEW JOB!');
    expect(events.some((e) => e.startsWith('rankUp:'))).toBe(false);
  });

  it('ch6Done already: the afterglow line only, no re-payout', () => {
    quest.flags.ch6Ball = true;
    quest.flags.ch6Done = true;
    quest.rank = 'EXECUTIVE';
    const { hooks, events } = eventHooks();
    runScript(hqScripts['npc:giovanni'], hooks);

    expect(events).toEqual(['say']);
    expect(events.some((e) => e === 'endScreen')).toBe(false);
  });
});