// CH7.0 leaf content (worker B, .paul/plan/ch7-power-plant/content.md): the
// interpreter-level pins the map lints in ch7-contracts.test.ts can't reach —
// a mine's step script, the CELL chest sequence, the VOLTRAWK dive gate, and
// the Giovanni briefing/hand-in chain. Mirrors tests/syl-content.test.ts.
import { describe, it, expect, beforeEach } from 'vitest';
import { runScript, type ScriptHooks } from '../src/systems/script';
import { quest, resetQuest } from '../src/systems/quest';
import { plant2Scripts } from '../src/data/dialog/plant2';
import { plant3Scripts } from '../src/data/dialog/plant3';
import { hqScripts } from '../src/data/dialog/hq';

function eventHooks() {
  const events: string[] = [];
  const says: string[][][] = [];
  const hooks: ScriptHooks = {
    say: (pages, done) => { events.push('say'); says.push(pages); done(); },
    battle: (id, done) => { events.push('battle:' + id); done(null); },
    warp: (w, done) => { events.push('warp:' + w.join(',')); done(); },
    sfx: (id) => events.push('sfx:' + id),
    fx: (id, at) => events.push('fx:' + id + (at ? '@' + at.join(',') : '')),
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

describe('the four mines (plant2, CH7.0 §3)', () => {
  it('unspent: stepping on it starts the battle', () => {
    const { hooks, events } = eventHooks();
    runScript(plant2Scripts['step:9,4'], hooks);
    expect(events).toEqual(['battle:plant_mine1']);
  });

  it('spent (mine1 === 1): nothing fires', () => {
    quest.vars.mine1 = 1;
    const { hooks, events } = eventHooks();
    runScript(plant2Scripts['step:9,4'], hooks);
    expect(events).toEqual([]);
  });
});

describe('the ENERGY CELL chest (plant3 at:18,2, CH7.0 §5)', () => {
  it('fresh: the full sequence, in order', () => {
    const { hooks, events } = eventHooks();
    runScript(plant3Scripts['at:18,2'], hooks);
    expect(events).toEqual([
      'say',
      'fx:flash', // the full-screen white-out (Lyall, 2026-09-09)
      'fx:spark@18,2',
      'fx:spark@15,2',
      'fx:spark@12,2',
      'sfx:alarm',
      'setTile:18,2,%',
      'sysMsg:THE LIGHTS DIE.',
    ]);
    expect(quest.items).toContain('ENERGY CELL');
    expect(quest.flags.ch7Cell).toBe(true);
  });

  it('already emptied: the empty-housing line only', () => {
    quest.flags.ch7Cell = true;
    const { hooks, events } = eventHooks();
    runScript(plant3Scripts['at:18,2'], hooks);
    expect(events).toEqual(['say']);
  });
});

describe('the VOLTRAWK dive (plant3 step:7,8, CH7.0 §5)', () => {
  it('no CELL yet: nothing fires', () => {
    const { hooks, events } = eventHooks();
    runScript(plant3Scripts['step:7,8'], hooks);
    expect(events).toEqual([]);
  });

  it('CELL out, no outcome flag: the dive fires', () => {
    quest.flags.ch7Cell = true;
    const { hooks, events } = eventHooks();
    runScript(plant3Scripts['step:7,8'], hooks);
    expect(events).toEqual(['say', 'battle:plant_voltrawk']);
  });

  it('CELL out but already resolved (ch7Fled): nothing fires', () => {
    quest.flags.ch7Cell = true;
    quest.flags.ch7Fled = true;
    const { hooks, events } = eventHooks();
    runScript(plant3Scripts['step:7,8'], hooks);
    expect(events).toEqual([]);
  });
});

describe('the Giovanni CH7 chain (hq.ts, CH7.0 §8/§11)', () => {
  it('ch6Done only: the briefing fires, gives exactly three PRO BALLs, sets ch7Briefed', () => {
    quest.flags.ch6Done = true;
    const { hooks, events } = eventHooks();
    runScript(hqScripts['npc:giovanni'], hooks);

    expect(quest.flags.ch7Briefed).toBe(true);
    expect(quest.flags.ch7Done).toBe(false);
    expect(quest.items.filter((i) => i === 'PRO BALL')).toHaveLength(3);
    expect(events).toContain('sysMsg:GOT 3 PRO BALLS!');
    expect(events).toContain('sysMsg:NEW JOB!');
  });

  it('a second talk repeats the briefing but hands over NO more balls (the faucet the review caught)', () => {
    quest.flags.ch6Done = true;
    runScript(hqScripts['npc:giovanni'], eventHooks().hooks);
    const { hooks, events, says } = eventHooks();
    runScript(hqScripts['npc:giovanni'], hooks);
    expect(quest.items.filter((i) => i === 'PRO BALL')).toHaveLength(3);
    expect(events).not.toContain('sysMsg:GOT 3 PRO BALLS!');
    expect(events).toContain('sysMsg:NEW JOB!');
    expect(says.flat().flat().join(' ')).toContain('ANN DOCK'); // the directions still repeat
  });

  it('holding the CELL with NO outcome flag (a whiteout): no hand-in, the briefing slot answers instead', () => {
    quest.flags.ch6Done = true;
    quest.flags.ch7Briefed = true;
    quest.items.push('ENERGY CELL');
    const { hooks, events } = eventHooks();
    runScript(hqScripts['npc:giovanni'], hooks);
    expect(quest.flags.ch7Done).toBe(false);
    expect(quest.coins).toBe(0);
    expect(events).not.toContain('endScreen');
  });

  it('holding the CELL, caught: hand-in pays 1200, no rankUp, sets ch7Done', () => {
    quest.flags.ch6Done = true;
    quest.flags.ch7Caught = true;
    quest.items.push('ENERGY CELL');
    const { hooks, events, says } = eventHooks();
    runScript(hqScripts['npc:giovanni'], hooks);

    expect(quest.flags.ch7Done).toBe(true);
    expect(quest.coins).toBe(1200);
    expect(events).toContain('endScreen');
    expect(events.some((e) => e.startsWith('rankUp'))).toBe(false);
    const text = says.flat().flat().join(' ');
    expect(text).toContain('BIRD');
    expect(text).not.toContain('DOWN');
    expect(text).not.toContain('ran');
  });

  it('holding the CELL, beaten: the DOWN branch text', () => {
    quest.flags.ch6Done = true;
    quest.flags.ch7Beaten = true;
    quest.items.push('ENERGY CELL');
    const { hooks, says } = eventHooks();
    runScript(hqScripts['npc:giovanni'], hooks);
    const text = says.flat().flat().join(' ');
    expect(text).toContain('DOWN');
    expect(text).not.toContain('BIRD');
    expect(text).not.toContain('ran');
  });

  it('holding the CELL, fled: the ran-from-it branch text', () => {
    quest.flags.ch6Done = true;
    quest.flags.ch7Fled = true;
    quest.items.push('ENERGY CELL');
    const { hooks, says } = eventHooks();
    runScript(hqScripts['npc:giovanni'], hooks);
    const text = says.flat().flat().join(' ');
    expect(text).toContain('ran');
    expect(text).not.toContain('BIRD');
    expect(text).not.toContain('DOWN');
  });

  it('ch7Done already: the afterglow line only, no re-payout', () => {
    quest.flags.ch6Done = true;
    quest.flags.ch7Done = true;
    const { hooks, events } = eventHooks();
    runScript(hqScripts['npc:giovanni'], hooks);
    expect(events).toEqual(['say']);
    expect(events.some((e) => e === 'endScreen')).toBe(false);
  });
});
