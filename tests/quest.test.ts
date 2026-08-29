import { describe, it, expect, beforeEach } from 'vitest';
import {
  quest,
  resetQuest,
  RANKS,
  rankUp,
  CHAPTERS,
  currentObjective,
  formatPlayTime,
  checkCond,
} from '../src/systems/quest';

beforeEach(() => resetQuest());

describe('checkCond compound forms (ONB.3: all / any)', () => {
  it('all: every child must hold; the empty list is vacuously true', () => {
    expect(checkCond({ all: [] })).toBe(true);
    expect(checkCond({ all: [{ notFlag: 'briefed' }] })).toBe(true);
    expect(checkCond({ all: [{ notFlag: 'briefed' }, { flag: 'lootTaken' }] })).toBe(false);
    quest.flags.lootTaken = true;
    expect(checkCond({ all: [{ notFlag: 'briefed' }, { flag: 'lootTaken' }] })).toBe(true);
  });

  it('any: at least one child must hold; the empty list is false', () => {
    expect(checkCond({ any: [] })).toBe(false);
    expect(checkCond({ any: [{ flag: 'briefed' }, { flag: 'lootTaken' }] })).toBe(false);
    quest.flags.lootTaken = true;
    expect(checkCond({ any: [{ flag: 'briefed' }, { flag: 'lootTaken' }] })).toBe(true);
  });

  it('nests: any-of-alls is the hand-in-or-briefing shape', () => {
    const c = {
      any: [
        { notFlag: 'briefed' as const },
        { all: [{ flag: 'lootTaken' as const }, { notFlag: 'missionDone' as const }] },
      ],
    };
    expect(checkCond(c)).toBe(true); // fresh: briefing waiting
    quest.flags.briefed = true;
    expect(checkCond(c)).toBe(false); // mid-heist: nothing waiting
    quest.flags.lootTaken = true;
    expect(checkCond(c)).toBe(true); // hand-in waiting
    quest.flags.missionDone = true;
    expect(checkCond(c)).toBe(false); // handed in
  });

  it('the leaf forms still answer the same way (no regression)', () => {
    quest.eggs.add('motto');
    quest.vars.slotSpins = 2;
    expect(checkCond({ egg: 'motto' })).toBe(true);
    expect(checkCond({ notEgg: 'motto' })).toBe(false);
    expect(checkCond({ varEq: ['slotSpins', 2] })).toBe(true);
    expect(checkCond({ varEq: ['slotSpins', 3] })).toBe(false);
  });

  it('ch2Briefed / ch3Briefed are real flags, false on a fresh quest', () => {
    expect(quest.flags.ch2Briefed).toBe(false);
    expect(quest.flags.ch3Briefed).toBe(false);
  });
});

describe('rank ladder (§4.7)', () => {
  it('advances one stage per rankUp through the whole ladder', () => {
    expect(quest.rank).toBe('GRUNT');
    const seen: string[] = [];
    for (let i = 1; i < RANKS.length; i++) seen.push(rankUp());
    expect(seen).toEqual(['AGENT', 'OPERATIVE', 'LIEUTENANT', 'EXECUTIVE', "BOSS'S RIVAL"]);
  });

  it('clamps at the top of the ladder', () => {
    quest.rank = "BOSS'S RIVAL";
    expect(rankUp()).toBe("BOSS'S RIVAL");
    expect(quest.rank).toBe("BOSS'S RIVAL");
  });

  it('recovers an unknown rank (corrupt save) to the bottom of the ladder', () => {
    quest.rank = 'SUPREME LEADER';
    expect(rankUp()).toBe('GRUNT');
  });
});

describe('rankUp rewards (RNK.1 — the frozen table)', () => {
  it('grants each rung exactly its table row: coins every rung, gear on odd rungs', () => {
    rankUp(); // AGENT
    expect(quest.coins).toBe(300);
    expect(quest.items).toContain('ROKKET SHADES');
    rankUp(); // OPERATIVE — coins only (rank perk, not an item)
    expect(quest.coins).toBe(900);
    expect(quest.items).toHaveLength(1);
    rankUp(); // LIEUTENANT
    expect(quest.coins).toBe(1900);
    expect(quest.items).toContain('ROKKET GLOVES');
    rankUp(); // EXECUTIVE — coins only
    expect(quest.coins).toBe(3400);
    expect(quest.items).toHaveLength(2);
    rankUp(); // BOSS'S RIVAL
    expect(quest.coins).toBe(5900);
    expect(quest.items).toContain('ROKKET COAT');
  });

  it('the top-rung clamp grants nothing', () => {
    quest.rank = "BOSS'S RIVAL";
    rankUp();
    expect(quest.coins).toBe(0);
    expect(quest.items).toHaveLength(0);
  });

  it('a corrupt-save restart to GRUNT grants nothing', () => {
    quest.rank = 'SUPREME LEADER';
    rankUp();
    expect(quest.coins).toBe(0);
    expect(quest.items).toHaveLength(0);
  });

  it('every table gear id resolves to an unbuyable, unsellable gear item', async () => {
    const { RANK_REWARDS } = await import('../src/data/rankRewards');
    const { ITEMS } = await import('../src/data/items');
    const { canSell } = await import('../src/systems/inventory');
    for (const [rank, r] of Object.entries(RANK_REWARDS)) {
      expect(RANKS as readonly string[], `${rank} is a real rank`).toContain(rank);
      expect(r.coins, `${rank} coins`).toBeGreaterThan(0);
      if (!r.gear) continue;
      const item = ITEMS[r.gear];
      expect(item, `${rank} gear resolves`).toBeDefined();
      expect(item.kind).toBe('gear');
      expect(item.price, `${r.gear} is a trophy, never buyable`).toBe(0);
      expect(canSell(r.gear), `${r.gear} is never sellable`).toBe(false);
      expect(item.perk, `${r.gear} carries its perk`).toBeDefined();
      expect(item.wear, `${r.gear} is worn (visibility rule)`).toBeDefined();
    }
  });

  it('the three trophies occupy three different wear slots (nothing hides a trophy)', async () => {
    const { RANK_REWARDS } = await import('../src/data/rankRewards');
    const { ITEMS } = await import('../src/data/items');
    const slots = Object.values(RANK_REWARDS)
      .filter((r) => r.gear)
      .map((r) => ITEMS[r.gear!].wear!.slot);
    expect(new Set(slots).size).toBe(slots.length);
  });
});

describe('chapter state machine (§4.7)', () => {
  it('ch1 walks its five steps as flags flip, in order', () => {
    expect(currentObjective()).toBe('SEE THE BOSS');
    quest.flags.briefed = true;
    expect(currentObjective()).toBe('BEAT THE GUARD');
    quest.flags.guardBeaten = true;
    expect(currentObjective()).toBe('FIND THE SWITCH');
    quest.flags.switchFound = true;
    expect(currentObjective()).toBe('GRAB THE CASE');
    quest.flags.lootTaken = true;
    expect(currentObjective()).toBe('REPORT TO BOSS');
    quest.flags.missionDone = true;
    // ch2 exists now (CH2.6) — the first-unmet step rolls into its opener
    // instead of the between-chapters tease; that tease is covered below
    // once ch2's own steps are also walked to completion.
    expect(currentObjective()).toBe('RAID MT. MOON');
  });

  it('ch2 walks its three steps as flags flip, in order, once ch1 is done', () => {
    quest.flags.briefed = true;
    quest.flags.guardBeaten = true;
    quest.flags.switchFound = true;
    quest.flags.lootTaken = true;
    quest.flags.missionDone = true;
    expect(currentObjective()).toBe('RAID MT. MOON');
    quest.flags.fossilsTaken = true;
    expect(currentObjective()).toBe('BEAT BRAD');
    quest.flags.bradBeaten = true;
    expect(currentObjective()).toBe('REPORT TO BOSS');
    quest.flags.ch2Done = true;
    // CH3 is authored now: the tease only shows once every chapter is met
    expect(currentObjective()).toBe('WORK THE SPAN');
  });

  it('ch3 walks its two steps (spanLass gates the gauntlet, ch3Done ends it), then rolls into ch4', () => {
    for (const f of ['briefed', 'guardBeaten', 'switchFound', 'lootTaken', 'missionDone', 'fossilsTaken', 'bradBeaten', 'ch2Done'] as const)
      quest.flags[f] = true;
    expect(currentObjective()).toBe('WORK THE SPAN');
    // marks 1–4 alone do not advance the objective — only the last one does
    quest.flags.spanCamper = quest.flags.spanPicnicker = quest.flags.spanHiker = quest.flags.spanYoungster = true;
    expect(currentObjective()).toBe('WORK THE SPAN');
    quest.flags.spanLass = true;
    expect(currentObjective()).toBe('BEAT KIRA');
    quest.flags.ch3Done = true;
    // CH4 is authored now: the tease only shows once every chapter is met
    expect(currentObjective()).toBe('SUIT UP');
  });

  it('ch4 walks its three steps (suit, safe, chief), then the tease', () => {
    for (const f of ['briefed', 'guardBeaten', 'switchFound', 'lootTaken', 'missionDone', 'fossilsTaken', 'bradBeaten', 'ch2Done', 'spanCamper', 'spanPicnicker', 'spanHiker', 'spanYoungster', 'spanLass', 'ch3Done'] as const)
      quest.flags[f] = true;
    expect(currentObjective()).toBe('SUIT UP');
    quest.flags.ch4Suit = true;
    expect(currentObjective()).toBe('CRACK THE SAFE');
    quest.flags.ch4Safe = true;
    expect(currentObjective()).toBe('BEAT THE CHIEF');
    quest.flags.ch4Done = true;
    expect(currentObjective()).toBe('AWAIT ORDERS.');
  });

  it('first-unmet semantics: an out-of-order flag does not skip earlier steps', () => {
    quest.flags.lootTaken = true; // e.g. seeded by a debug hook
    expect(currentObjective()).toBe('SEE THE BOSS');
  });

  it('every authored chapter has ordered, flag-derivable steps', () => {
    for (const ch of CHAPTERS) expect(ch.steps.length).toBeGreaterThan(0);
  });
});

describe('formatPlayTime (§4.7 STATUS)', () => {
  it.each([
    [0, '0:00'],
    [59, '0:00'],
    [60, '0:01'],
    [3599, '0:59'],
    [3600, '1:00'],
    [45296, '12:34'],
  ])('%d seconds → %s', (seconds, expected) => {
    expect(formatPlayTime(seconds)).toBe(expected);
  });

  it('never goes negative', () => {
    expect(formatPlayTime(-5)).toBe('0:00');
  });
});
