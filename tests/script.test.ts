import { describe, it, expect, beforeEach } from 'vitest';
import { runScript, type ScriptHooks } from '../src/systems/script';
import type { ScriptStep } from '../src/types';
import { quest, resetQuest } from '../src/systems/quest';

interface FakeLog {
  says: string[][][];
  sfx: string[];
  music: string[];
  tiles: [number, number, string][];
  warpsAdded: [string, unknown][];
  warps: unknown[];
  battles: string[];
  lockers: number;
  shops: string[];
  endScreens: number;
  rankUps: string[];
  heats: number[];
  monsGiven: [string, number][];
  npcRuns: string[];
  healPartys: number;
  sysMsgs: string[][];
  jobsOpened: number;
}

function makeHooks(opts?: { battleFollowUp?: ScriptStep[] | null }) {
  const log: FakeLog = { says: [], sfx: [], music: [], tiles: [], warpsAdded: [], warps: [], battles: [], lockers: 0, shops: [], endScreens: 0, rankUps: [], heats: [], monsGiven: [], npcRuns: [], healPartys: 0, sysMsgs: [], jobsOpened: 0 };
  const hooks: ScriptHooks = {
    say: (pages, done) => { log.says.push(pages); done(); },
    battle: (id, done) => { log.battles.push(id); done(opts?.battleFollowUp ?? null); },
    warp: (w, done) => { log.warps.push(w); done(); },
    sfx: (n) => log.sfx.push(n),
    music: (n) => log.music.push(n),
    setTile: (x, y, ch) => log.tiles.push([x, y, ch]),
    addWarp: (key, w) => log.warpsAdded.push([key, w]),
    locker: (done) => { log.lockers++; done(); },
    shop: (id, done) => { log.shops.push(id); done(); },
    endScreen: () => log.endScreens++,
    rankUp: (newRank, done) => { log.rankUps.push(newRank); done(); },
    heat: (n) => log.heats.push(n),
    giveMon: (species, lv) => log.monsGiven.push([species, lv]),
    npcRun: (id, done) => { log.npcRuns.push(id); done(); },
    healParty: () => log.healPartys++,
    sysMsg: (lines) => log.sysMsgs.push(lines),
    jobs: (done) => { log.jobsOpened++; done(); },
    cardFlip: (done) => done(),
    choice: (_p, done) => done(true),
  };
  return { hooks, log };
}

beforeEach(() => resetQuest());

describe('{ sysMsg } step (CH2.10)', () => {
  it('dispatches synchronously, in order, only after the preceding say completes', () => {
    const { hooks, log } = makeHooks();
    let done = false;
    runScript(
      [{ healParty: true }, { say: [['...ZZZ...']] }, { sysMsg: ['ALL MONS RESTED', 'AND HEALED!'] }, { sfx: 'after' }],
      hooks,
      () => (done = true),
    );
    expect(log.sysMsgs).toEqual([['ALL MONS RESTED', 'AND HEALED!']]);
    expect(log.healPartys).toBe(1);
    expect(log.sfx).toEqual(['after']); // synchronous — never suspended
    expect(done).toBe(true);
  });
});

describe('{ healParty: true } step (QOL.9)', () => {
  it('dispatches synchronously — following steps run in the same pass', () => {
    const { hooks, log } = makeHooks();
    let done = false;
    runScript([{ sfx: 'before' }, { healParty: true }, { sfx: 'after' }], hooks, () => (done = true));
    expect(log.healPartys).toBe(1);
    expect(log.sfx).toEqual(['before', 'after']); // never suspended
    expect(done).toBe(true);
  });
});

describe('script interpreter — each step type', () => {
  it('say suspends and resumes in order', () => {
    const { hooks, log } = makeHooks();
    let done = false;
    runScript([{ say: [['ONE']] }, { say: [['TWO']] }], hooks, () => (done = true));
    expect(log.says).toEqual([[['ONE']], [['TWO']]]);
    expect(done).toBe(true);
  });

  it('setFlag / giveItem / addCoins / addEgg / incVar mutate quest state', () => {
    const { hooks } = makeHooks();
    runScript(
      [
        { setFlag: 'briefed' },
        { giveItem: 'SMOKE BALL' },
        { addCoins: 42 },
        { addEgg: 'motto' },
        { incVar: 'spins' },
        { incVar: 'spins' },
      ],
      hooks,
    );
    expect(quest.flags.briefed).toBe(true);
    expect(quest.items).toEqual(['SMOKE BALL']);
    expect(quest.coins).toBe(42);
    expect(quest.eggs.has('motto')).toBe(true);
    expect(quest.vars.spins).toBe(2);
  });

  it('if takes then/else branches on all condition kinds', () => {
    const { hooks, log } = makeHooks();
    quest.flags.briefed = true;
    quest.eggs.add('e1');
    quest.vars.n = 3;
    const steps: ScriptStep[] = [
      { if: { flag: 'briefed' }, then: [{ sfx: 'a' }], else: [{ sfx: 'X' }] },
      { if: { notFlag: 'lootTaken' }, then: [{ sfx: 'b' }], else: [{ sfx: 'X' }] },
      { if: { egg: 'e1' }, then: [{ sfx: 'c' }], else: [{ sfx: 'X' }] },
      { if: { notEgg: 'e2' }, then: [{ sfx: 'd' }], else: [{ sfx: 'X' }] },
      { if: { varEq: ['n', 3] }, then: [{ sfx: 'e' }], else: [{ sfx: 'X' }] },
      { if: { varEq: ['n', 9] }, then: [{ sfx: 'X' }], else: [{ sfx: 'f' }] },
      { if: { flag: 'missionDone' }, then: [{ sfx: 'X' }] }, // no else → skipped
    ];
    runScript(steps, hooks);
    expect(log.sfx).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });

  it('nested ifs continue the outer sequence afterwards', () => {
    const { hooks, log } = makeHooks();
    runScript(
      [
        {
          if: { notFlag: 'briefed' },
          then: [{ if: { notFlag: 'lootTaken' }, then: [{ sfx: 'inner' }] }],
        },
        { sfx: 'after' },
      ],
      hooks,
    );
    expect(log.sfx).toEqual(['inner', 'after']);
  });

  it('setTile / addWarp / sfx / music / endScreen call their hooks', () => {
    const { hooks, log } = makeHooks();
    runScript(
      [
        { setTile: [2, 2, '>'] },
        { addWarp: ['2,2', ['vault', 5, 5, 'up']] },
        { sfx: 'switch' },
        { music: 'victory' },
        { endScreen: true },
      ],
      hooks,
    );
    expect(log.tiles).toEqual([[2, 2, '>']]);
    expect(log.warpsAdded).toEqual([['2,2', ['vault', 5, 5, 'up']]]);
    expect(log.sfx).toEqual(['switch']);
    expect(log.music).toEqual(['victory']);
    expect(log.endScreens).toBe(1);
  });

  it('battle runs its follow-up steps before continuing', () => {
    const { hooks, log } = makeHooks({ battleFollowUp: [{ sfx: 'won' }] });
    runScript([{ battle: 'guard_voltorbb' }, { sfx: 'after' }], hooks);
    expect(log.battles).toEqual(['guard_voltorbb']);
    expect(log.sfx).toEqual(['won', 'after']);
  });

  it('locker suspends until the player backs out, then resumes', () => {
    const { log } = makeHooks();
    let release: (() => void) | null = null;
    const hooks: ScriptHooks = {
      ...makeHooks().hooks,
      locker: (done) => { log.lockers++; release = done; },
      sfx: (n) => log.sfx.push(n),
    };
    runScript([{ locker: true }, { sfx: 'closed' }], hooks);
    expect(log.lockers).toBe(1);
    expect(log.sfx).toEqual([]); // suspended while the terminal is open
    release!();
    expect(log.sfx).toEqual(['closed']);
  });

  it('shop passes the id and suspends until the player leaves', () => {
    const { log } = makeHooks();
    let release: (() => void) | null = null;
    const hooks: ScriptHooks = {
      ...makeHooks().hooks,
      shop: (id, done) => { log.shops.push(id); release = done; },
      sfx: (n) => log.sfx.push(n),
    };
    runScript([{ shop: 'hqStall' }, { sfx: 'left' }], hooks);
    expect(log.shops).toEqual(['hqStall']);
    expect(log.sfx).toEqual([]); // suspended while the shop is open
    release!();
    expect(log.sfx).toEqual(['left']);
  });

  it('warp suspends until the transition completes', () => {
    const { hooks, log } = makeHooks();
    runScript([{ warp: ['hq', 9, 7, 'down'] }, { sfx: 'arrived' }], hooks);
    expect(log.warps).toEqual([['hq', 9, 7, 'down']]);
    expect(log.sfx).toEqual(['arrived']);
  });

  it('sayCycle picks dialogs[counter % length]', () => {
    const { hooks, log } = makeHooks();
    quest.vars.spins = 4; // 4 % 3 = 1
    runScript(
      [{ sayCycle: { counter: 'spins', dialogs: [[['zero']], [['one']], [['two']]] } }],
      hooks,
    );
    expect(log.says).toEqual([[['one']]]);
  });

  it('rankUp advances the ladder, passes the NEW rank, and suspends until dismissed', () => {
    const { log } = makeHooks();
    let release: (() => void) | null = null;
    const hooks: ScriptHooks = {
      ...makeHooks().hooks,
      rankUp: (newRank, done) => { log.rankUps.push(newRank); release = done; },
      sfx: (n) => log.sfx.push(n),
    };
    runScript([{ rankUp: true }, { sfx: 'after' }], hooks);
    expect(quest.rank).toBe('AGENT');       // mutated before the hook fires
    expect(log.rankUps).toEqual(['AGENT']); // hook sees the new rank
    expect(log.sfx).toEqual([]);            // suspended while the card is up
    release!();
    expect(log.sfx).toEqual(['after']);
  });

  it('heat calls the sync hook and does not suspend (following steps run in the same pass)', () => {
    const { hooks, log } = makeHooks();
    runScript([{ heat: 3 }, { sfx: 'after' }, { setFlag: 'briefed' }], hooks);
    expect(log.heats).toEqual([3]);
    expect(log.sfx).toEqual(['after']);       // ran in the same runScript pass — no suspend
    expect(quest.flags.briefed).toBe(true);   // BDD: flag set in the same pass as the heat step
  });

  it('async say defers the rest of the script until dismissed', () => {
    const { log } = makeHooks();
    let release: (() => void) | null = null;
    const hooks: ScriptHooks = {
      ...makeHooks().hooks,
      say: (pages, done) => { log.says.push(pages); release = done; },
      sfx: (n) => log.sfx.push(n),
    };
    runScript([{ say: [['WAIT']] }, { sfx: 'later' }], hooks);
    expect(log.sfx).toEqual([]); // not yet
    release!();
    expect(log.sfx).toEqual(['later']);
  });
});

describe('giveMon step (CH2.3)', () => {
  it('dispatches synchronously and never suspends the script', () => {
    const { hooks, log } = makeHooks();
    let done = false;
    runScript(
      [{ giveMon: { species: 'ekanzz', lv: 5 } }, { sfx: 'item' }],
      hooks,
      () => (done = true),
    );
    expect(log.monsGiven).toEqual([['ekanzz', 5]]);
    expect(log.sfx).toEqual(['item']); // the following step ran in the same pass
    expect(done).toBe(true);
  });
});

describe('npcRun step (CH2.7)', () => {
  it('suspends until the runtime reports arrival, then resumes', () => {
    const { log } = makeHooks();
    let release: (() => void) | null = null;
    const hooks: ScriptHooks = {
      ...makeHooks().hooks,
      npcRun: (id, done) => { log.npcRuns.push(id); release = done; },
      sfx: (n) => log.sfx.push(n),
    };
    runScript([{ npcRun: { id: 'brad' } }, { sfx: 'after' }], hooks);
    expect(log.npcRuns).toEqual(['brad']);
    expect(log.sfx).toEqual([]); // suspended while the NPC runs
    release!();
    expect(log.sfx).toEqual(['after']);
  });
});

describe('{ jobs } step (SIDE.1)', () => {
  it('suspends until the board closes, then resumes', () => {
    const { log } = makeHooks();
    let release: (() => void) | null = null;
    const hooks: ScriptHooks = {
      ...makeHooks().hooks,
      jobs: (done) => { log.jobsOpened++; release = done; },
      sfx: (n) => log.sfx.push(n),
    };
    runScript([{ jobs: true }, { sfx: 'after' }], hooks);
    expect(log.jobsOpened).toBe(1);
    expect(log.sfx).toEqual([]); // suspended while the board is open
    release!();
    expect(log.sfx).toEqual(['after']);
  });
});

describe('{ choice } step (2026-08-15 — the yes/no primitive)', () => {
  function choiceHooks(answer: boolean) {
    const { hooks, log } = makeHooks();
    const asked: string[][][] = [];
    hooks.choice = (pages, done) => { asked.push(pages); done(answer); };
    return { hooks, log, asked };
  }

  it('YES pushes the yes branch as a nested frame and resumes the outer script after it', () => {
    const { hooks, log, asked } = choiceHooks(true);
    runScript(
      [
        { choice: { say: [['Rest?']], yes: [{ sfx: 'yes' }, { healParty: true }], no: [{ sfx: 'no' }] } },
        { sfx: 'after' },
      ],
      hooks,
    );
    expect(asked).toEqual([[['Rest?']]]);
    expect(log.sfx).toEqual(['yes', 'after']);
    expect(log.healPartys).toBe(1);
  });

  it('NO runs the no branch and never touches the yes branch', () => {
    const { hooks, log } = choiceHooks(false);
    runScript(
      [
        { choice: { say: [['Rest?']], yes: [{ healParty: true }], no: [{ sfx: 'no' }] } },
        { sfx: 'after' },
      ],
      hooks,
    );
    expect(log.sfx).toEqual(['no', 'after']);
    expect(log.healPartys).toBe(0);
  });

  it('NO with no `no` branch simply continues', () => {
    const { hooks, log } = choiceHooks(false);
    runScript([{ choice: { say: [['Rest?']], yes: [{ healParty: true }] } }, { sfx: 'after' }], hooks);
    expect(log.sfx).toEqual(['after']);
    expect(log.healPartys).toBe(0);
  });

  it('suspends the script until the player answers', () => {
    const { hooks, log } = makeHooks();
    let release: ((yes: boolean) => void) | null = null;
    hooks.choice = (_pages, done) => { release = done; };
    runScript([{ choice: { say: [['Rest?']], yes: [{ sfx: 'yes' }] } }, { sfx: 'after' }], hooks);
    expect(log.sfx).toEqual([]);
    release!(true);
    expect(log.sfx).toEqual(['yes', 'after']);
  });
});
