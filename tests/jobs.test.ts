// SIDE.1 job board — pure contract logic (.paul/PLAN.md "SIDE.1" frozen
// design + the SIDE.1-FB playtest rework). Generation is seeded (mulberry32,
// never Math.random) and PER SLOT: each of the board's three slots derives
// its offer from (rank, slot, that slot's completion counter), so a hand-in
// re-rolls only the slot it completed — Lyall's playtest call. Offers are
// derived, never saved; progress is derived (pack counts / monotonic
// counters minus a base), never stored. jobs.ts is engine-free so
// everything here runs in plain Node.
import { describe, it, expect, beforeEach } from 'vitest';
import { quest, resetQuest, RANKS } from '../src/systems/quest';
import { ITEMS } from '../src/data/items';
import {
  type JobContract,
  FETCH_POOL,
  jobPayout,
  jobOffer,
  boardRows,
  takeJob,
  jobProgress,
  canHandIn,
  handInJob,
  abandonJob,
  jobBattleWon,
  jobLabel,
  jobFooter,
  jobProgressLine,
} from '../src/systems/jobs';
import { JOB_ROW_CAP } from '../src/systems/jobsScreen';
import { perkPct } from '../src/systems/perks';

beforeEach(() => resetQuest());

// Hand-built offers for mutation tests — takeJob accepts any contract, it
// does not require one minted by jobOffer.
const fetchSoda2: JobContract = { kind: 'fetch', slot: 0, item: 'SODA', need: 2, payout: 170, base: 0 };
const hunt3: JobContract = { kind: 'hunt', slot: 1, need: 3, payout: 155, base: 0 };
const spin4: JobContract = { kind: 'spin', slot: 2, need: 4, payout: 90, base: 0 };

describe('jobPayout (spec-derived, hand-computed from the PLAN formulas)', () => {
  it('fetch: price*need + 50*(rankIdx+1)', () => {
    // SODA is 60c: 60*2 + 50*1 = 170 at GRUNT (idx 0)
    expect(jobPayout('fetch', 2, 0, 'SODA')).toBe(170);
    // ROKKET BALL is 200c: 200*4 + 50*5 = 1050 at EXECUTIVE (idx 4)
    expect(jobPayout('fetch', 4, 4, 'ROKKET BALL')).toBe(1050);
  });
  it('hunt: 35*need + 50*rankIdx', () => {
    expect(jobPayout('hunt', 3, 1)).toBe(155); // 105 + 50 at AGENT
    expect(jobPayout('hunt', 6, 4)).toBe(410); // 210 + 200
  });
  it('spin: 10*need + 50*rankIdx', () => {
    expect(jobPayout('spin', 5, 2)).toBe(150); // 50 + 100 at OPERATIVE
    expect(jobPayout('spin', 10, 5)).toBe(350); // 100 + 250
  });
  it('fetch always pays at least 50 over shop cost (the buy-loop profits)', () => {
    for (const id of FETCH_POOL)
      for (let need = 2; need <= 4; need++)
        for (let idx = 0; idx < RANKS.length; idx++)
          expect(jobPayout('fetch', need, idx, id)).toBeGreaterThanOrEqual(ITEMS[id].price * need + 50);
  });
});

describe('jobOffer — seeded per-slot generation (SIDE.1-FB)', () => {
  it('is deterministic for the same (rank, slot, completions)', () => {
    expect(jobOffer('AGENT', 1, 3)).toEqual(jobOffer('AGENT', 1, 3));
  });

  it('re-rolls when the slot completion counter advances', () => {
    expect(jobOffer('AGENT', 0, 0)).not.toEqual(jobOffer('AGENT', 0, 1));
  });

  it('stamps the slot it was generated for', () => {
    for (let s = 0; s < 3; s++) expect(jobOffer('GRUNT', s, 0).slot).toBe(s);
  });

  it('rank-gates contract kinds: GRUNT fetch-only, AGENT adds hunt, OPERATIVE adds spin', () => {
    // BDD: Given rank AGENT / Then only AGENT-unlocked types are offered.
    for (let s = 0; s < 3; s++)
      for (let n = 0; n < 20; n++) {
        expect(jobOffer('GRUNT', s, n).kind).toBe('fetch');
        expect(['fetch', 'hunt']).toContain(jobOffer('AGENT', s, n).kind);
        expect(['fetch', 'hunt', 'spin']).toContain(jobOffer('OPERATIVE', s, n).kind);
      }
  });

  it('REGRESSION PIN: first verified boards for fresh GRUNT and AGENT', () => {
    // Pinned from the first verified run (2026-08-09, stride 127), payouts
    // hand-checked against the formulas — NOT spec-derived (03 rule 3): a
    // seed/roll-order change re-rolls every board in the wild, so it must
    // be deliberate.
    expect([0, 1, 2].map((s) => jobOffer('GRUNT', s, 0))).toEqual([
      { kind: 'fetch', slot: 0, item: 'ROKKET BALL', need: 3, payout: 650, base: 0 },
      { kind: 'fetch', slot: 1, item: 'SODA', need: 4, payout: 290, base: 0 },
      { kind: 'fetch', slot: 2, item: 'ROKKET BALL', need: 2, payout: 450, base: 0 },
    ]);
    expect([0, 1, 2].map((s) => jobOffer('AGENT', s, 0))).toEqual([
      { kind: 'fetch', slot: 0, item: 'ROKKET BALL', need: 3, payout: 700, base: 0 },
      { kind: 'hunt', slot: 1, need: 5, payout: 225, base: 0 },
      { kind: 'hunt', slot: 2, need: 4, payout: 190, base: 0 },
    ]);
  });

  it('an unrecognised rank offers as GRUNT (corrupt-save stance, matches rankUp)', () => {
    expect(jobOffer('MYSTERY RANK', 0, 0)).toEqual(jobOffer('GRUNT', 0, 0));
  });

  it('every offer is structurally valid with an in-range need and formula payout', () => {
    for (const rank of RANKS)
      for (let s = 0; s < 3; s++)
        for (let n = 0; n < 20; n++) {
          const o = jobOffer(rank, s, n);
          expect(o.base).toBe(0);
          expect(Number.isInteger(o.payout)).toBe(true);
          const idx = RANKS.indexOf(rank);
          if (o.kind === 'fetch') {
            expect(FETCH_POOL).toContain(o.item!);
            expect(o.need).toBeGreaterThanOrEqual(2);
            expect(o.need).toBeLessThanOrEqual(4);
            expect(o.payout).toBe(jobPayout('fetch', o.need, idx, o.item));
          } else if (o.kind === 'hunt') {
            expect(o.need).toBeGreaterThanOrEqual(3);
            expect(o.need).toBeLessThanOrEqual(6);
            expect(o.payout).toBe(jobPayout('hunt', o.need, idx));
          } else {
            expect(o.need).toBeGreaterThanOrEqual(5);
            expect(o.need).toBeLessThanOrEqual(10);
            expect(o.payout).toBe(jobPayout('spin', o.need, idx));
          }
        }
  });
});

describe('boardRows — the list view is always three slots', () => {
  it('with no active job, each slot shows its derived offer', () => {
    const rows = boardRows();
    expect(rows).toHaveLength(3);
    rows.forEach((r, i) => expect(r).toEqual(jobOffer('GRUNT', i, 0)));
  });

  it('the active contract occupies its slot; the other slots keep their offers', () => {
    quest.rank = 'AGENT';
    const before = boardRows();
    takeJob(before[1]);
    const rows = boardRows();
    expect(rows[1]).toEqual(quest.job);
    expect(rows[0]).toEqual(before[0]);
    expect(rows[2]).toEqual(before[2]);
  });

  it('per-slot counters drive each slot independently', () => {
    quest.vars.jobSlot1 = 4;
    const rows = boardRows();
    expect(rows[0]).toEqual(jobOffer('GRUNT', 0, 0));
    expect(rows[1]).toEqual(jobOffer('GRUNT', 1, 4));
    expect(rows[2]).toEqual(jobOffer('GRUNT', 2, 0));
  });
});

describe('take / progress / hand-in / abandon', () => {
  it('takeJob stores the contract; fetch progress derives from the pack', () => {
    takeJob(fetchSoda2);
    expect(quest.job).toEqual(fetchSoda2);
    expect(jobProgress()).toEqual({ have: 0, need: 2 });
    quest.items.push('SODA');
    expect(jobProgress()).toEqual({ have: 1, need: 2 });
    expect(canHandIn()).toBe(false);
  });

  it('hand-in refuses while short and touches nothing', () => {
    takeJob(fetchSoda2);
    quest.items.push('SODA');
    expect(handInJob()).toBeNull();
    expect(quest.items).toEqual(['SODA']);
    expect(quest.coins).toBe(0);
    expect(quest.job).not.toBeNull();
  });

  it('fetch hand-in consumes exactly `need` items, pays out, bumps both counters, clears the job', () => {
    takeJob(fetchSoda2);
    quest.items.push('SODA', 'ROKKET BALL', 'SODA', 'SODA'); // one spare SODA
    expect(canHandIn()).toBe(true);
    expect(handInJob()).toBe(170);
    expect(quest.coins).toBe(170);
    expect(quest.items).toEqual(['ROKKET BALL', 'SODA']); // spare survives
    expect(quest.job).toBeNull();
    expect(quest.vars.jobsDone).toBe(1); // running total
    expect(quest.vars.jobSlot0).toBe(1); // the slot that re-rolls
  });

  it("SIDE.1-FB: completing a slot re-rolls ONLY that slot — the others keep their offers", () => {
    const before = boardRows();
    takeJob(before[0]); // GRUNT slot 0 is always a fetch offer
    for (let k = 0; k < quest.job!.need; k++) quest.items.push(quest.job!.item!);
    expect(handInJob()).toBe(before[0].payout);
    const after = boardRows();
    expect(after[1]).toEqual(before[1]);
    expect(after[2]).toEqual(before[2]);
    expect(after[0]).toEqual(jobOffer('GRUNT', 0, 1)); // advanced, not board-wide
    expect(after[0]).not.toEqual(before[0]);
  });

  it('hunt progress = jobKos minus the base stamped at take; jobBattleWon feeds it', () => {
    quest.vars.jobKos = 5; // KOs from before the contract must not count
    takeJob(hunt3);
    expect(quest.job!.base).toBe(5);
    expect(jobProgress()).toEqual({ have: 0, need: 3 });
    jobBattleWon();
    jobBattleWon();
    expect(jobProgress()).toEqual({ have: 2, need: 3 });
    expect(canHandIn()).toBe(false);
    jobBattleWon();
    expect(canHandIn()).toBe(true);
    expect(handInJob()).toBe(155);
    expect(quest.coins).toBe(155);
    expect(quest.vars.jobSlot1).toBe(1);
  });

  it('spin progress rides the existing slotSpins counter the same way', () => {
    quest.vars.slotSpins = 7;
    takeJob(spin4);
    expect(quest.job!.base).toBe(7);
    quest.vars.slotSpins = 10;
    expect(jobProgress()).toEqual({ have: 3, need: 4 });
    quest.vars.slotSpins = 11;
    expect(canHandIn()).toBe(true);
  });

  it('jobBattleWon is monotonic and safe with no active job', () => {
    jobBattleWon();
    expect(quest.vars.jobKos).toBe(1);
  });

  it('abandon clears the job with no penalty and no counter bumps — the same offer reappears', () => {
    const before = boardRows();
    takeJob(before[0]);
    abandonJob();
    expect(quest.job).toBeNull();
    expect(quest.coins).toBe(0);
    expect(quest.vars.jobsDone).toBeUndefined();
    expect(boardRows()).toEqual(before); // no re-roll lever
  });
});

describe('board strings (pure formatters — the length lint lives here)', () => {
  it('labels', () => {
    expect(jobLabel(fetchSoda2)).toBe('2x SODA');
    expect(jobLabel(hunt3)).toBe('KO 3 MONS');
    expect(jobLabel(spin4)).toBe('SPIN SLOTS 4');
  });
  it('progress lines', () => {
    takeJob(fetchSoda2);
    quest.items.push('SODA');
    expect(jobProgressLine()).toBe('SODA: 1/2');
    takeJob(hunt3);
    jobBattleWon();
    expect(jobProgressLine()).toBe('KOS: 1/3');
    quest.vars.slotSpins = 2;
    takeJob(spin4);
    quest.vars.slotSpins = 4;
    expect(jobProgressLine()).toBe('SPINS: 2/4');
  });
  it('footer', () => {
    expect(jobFooter(fetchSoda2)).toBe('PAYS 170 COINS.');
  });

  it('lint: every generated string fits its box; pool items exist and are priced', () => {
    for (const id of FETCH_POOL) {
      expect(ITEMS[id]).toBeDefined();
      expect(ITEMS[id].price).toBeGreaterThan(0);
      expect(('*4x ' + id).length).toBeLessThanOrEqual(JOB_ROW_CAP); // widest active fetch row
    }
    for (const rank of RANKS)
      for (let s = 0; s < 3; s++)
        for (let n = 0; n < 20; n++) {
          const o = jobOffer(rank, s, n);
          // list rows carry the `*` active marker in the worst case
          expect(('*' + jobLabel(o)).length).toBeLessThanOrEqual(JOB_ROW_CAP);
          expect(jobFooter(o).length).toBeLessThanOrEqual(17);
          takeJob(o);
          expect(jobProgressLine().length).toBeLessThanOrEqual(17);
          abandonJob();
        }
  });
});

// RNK.4 — SIDE.1 payout re-tune. Checked the two FROZEN bounds (PLAN order
// item 6 / 17-rank-rewards.md RNK.4) against today's constants and found
// both already hold — a documented NO-CHANGE, so jobPayout is untouched.
// "Max jobs perk" below is derived from perks.ts + items.ts, not assumed:
// today that's rank-inherent jobs +25% (EXECUTIVE, RANKS idx>=4) plus every
// gear item currently carrying perk.kind 'jobs' (only ROKKET GLOVES +25% —
// RNK.3's UTILITY VEST hasn't landed on this branch), summed and capped at
// PERK_CAPS.jobs = 1.0. Collecting the gear ids from ITEMS (rather than
// hardcoding 'ROKKET GLOVES') keeps this sweep valid once RNK.3 adds more
// jobs gear, without needing to touch this test again.
describe('RNK.4 — SIDE.1 payout re-tune: frozen acceptance bounds', () => {
  const jobsGearIds = Object.values(ITEMS)
    .filter((d) => d.perk?.kind === 'jobs')
    .map((d) => d.id);
  const fetchNeeds = [2, 4]; // jobOffer's fetch roll range is [2,4]
  const huntNeeds = [3, 6]; // jobOffer's hunt roll range is [3,6]
  const spinNeeds = [5, 10]; // jobOffer's spin roll range is [5,10]

  it('bound (a): max-perk hand-in <= 2x the same rank\'s no-perk payout, every rank x kind x need extreme', () => {
    for (let idx = 0; idx < RANKS.length; idx++) {
      quest.rank = RANKS[idx];
      quest.items = [...jobsGearIds]; // own every jobs-perk piece at once
      const maxPct = perkPct('jobs');
      const cells: number[] = [
        ...fetchNeeds.flatMap((need) => FETCH_POOL.map((item) => jobPayout('fetch', need, idx, item))),
        ...huntNeeds.map((need) => jobPayout('hunt', need, idx)),
        ...spinNeeds.map((need) => jobPayout('spin', need, idx)),
      ];
      for (const base of cells) {
        const maxPaid = Math.floor(base * (1 + maxPct));
        expect(maxPaid).toBeLessThanOrEqual(base * 2);
      }
    }
  });

  it('bound (b): no-perk payouts rise monotonically with rank index, per kind at fixed need', () => {
    for (const need of fetchNeeds)
      for (const item of FETCH_POOL) {
        const series = RANKS.map((_, idx) => jobPayout('fetch', need, idx, item));
        for (let i = 1; i < series.length; i++) expect(series[i]).toBeGreaterThan(series[i - 1]);
      }
    for (const need of huntNeeds) {
      const series = RANKS.map((_, idx) => jobPayout('hunt', need, idx));
      for (let i = 1; i < series.length; i++) expect(series[i]).toBeGreaterThan(series[i - 1]);
    }
    for (const need of spinNeeds) {
      const series = RANKS.map((_, idx) => jobPayout('spin', need, idx));
      for (let i = 1; i < series.length; i++) expect(series[i]).toBeGreaterThan(series[i - 1]);
    }
  });
});
