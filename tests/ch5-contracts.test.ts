// CH5.0 contracts (.paul/PLAN.md 2026-08-29): the pure pieces the LAVENDAR
// TOWER stands on — the `hasItem` Cond, the per-fight battle-item list, the
// boss-only dex denominator, the ch5 objective derivation — plus the data
// lints that keep the new registry fields honest once content lands.
import { describe, it, expect, beforeEach } from 'vitest';
import { quest, resetQuest, checkCond, currentObjective, CHAPTERS, setPartySize, PARTY_CAP } from '../src/systems/quest';
import { usableInBattle } from '../src/systems/inventory';
import { dexTotal, dexCount } from '../src/systems/mon';
import { dexComplete } from '../src/systems/dex';
import { SPECIES } from '../src/data/mons';
import { ENCOUNTERS } from '../src/data/encounters';
import { MAPS } from '../src/data/maps';
import { TRACKS } from '../src/data/music';
import { ITEMS, SCOPE_ITEM } from '../src/data/items';
import { TILES, WALKABLE } from '../src/data/tiles';
import type { MonSpecies } from '../src/types';

beforeEach(() => resetQuest());

describe('hasItem Cond (CH5.0 §6)', () => {
  it('reads the PACK, duplicates and all', () => {
    expect(checkCond({ hasItem: SCOPE_ITEM })).toBe(false);
    quest.items.push('SODA', SCOPE_ITEM, 'SODA');
    expect(checkCond({ hasItem: SCOPE_ITEM })).toBe(true);
    expect(checkCond({ hasItem: 'BONE CHARM' })).toBe(false);
  });

  it('composes with all/any like every other Cond', () => {
    quest.items.push(SCOPE_ITEM);
    expect(checkCond({ all: [{ hasItem: SCOPE_ITEM }, { notFlag: 'ch5Spirit' }] })).toBe(true);
    expect(checkCond({ any: [{ hasItem: 'BONE CHARM' }, { flag: 'ch5Spirit' }] })).toBe(false);
  });
});

describe('partyFull Cond (CH5.3 playtest fix)', () => {
  it('reads the registered party-size provider against the cap', () => {
    setPartySize(() => 3);
    expect(checkCond({ partyFull: true })).toBe(false);
    setPartySize(() => PARTY_CAP);
    expect(checkCond({ partyFull: true })).toBe(true);
    setPartySize(() => 0);
  });

  /** Runs the altar script with a party of `size`, answering every choice
   *  with `yes`; returns the lines said (choice pages included) and whether
   *  the LOCKER opened. */
  async function altar(size: number, yes: boolean, spirit = true): Promise<{ lines: string[]; locker: boolean }> {
    const { lav3Scripts } = await import('../src/data/dialog/lav3');
    const { runScript } = await import('../src/systems/script');
    resetQuest();
    quest.flags.ch5Spirit = spirit;
    setPartySize(() => size);
    const lines: string[] = [];
    let locker = false;
    const noop = (): void => {};
    runScript(lav3Scripts['at:2,1'], {
      say: (pages, done) => { lines.push(...pages.map((p) => p.join(' '))); done(); },
      battle: (_i, d) => d(null), warp: (_w, d) => d(), sfx: noop, music: noop, setTile: noop, addWarp: noop,
      locker: (d) => { locker = true; d(); }, shop: (_i, d) => d(), endScreen: noop, rankUp: (_r, d) => d(), heat: noop, giveMon: noop,
      npcRun: (_i, d) => d(), healParty: noop, sysMsg: noop, jobs: (d) => d(), cardFlip: (d) => d(),
      tour: (_s, d) => d(), choice: (pages, d) => { lines.push(...pages.map((p) => p.join(' '))); d(yes); },
    });
    setPartySize(() => 0);
    return { lines, locker };
  }

  it('the join scene tells the truth about where Myowth landed', async () => {
    expect((await altar(PARTY_CAP, false)).lines.some((l) => l.includes('LOCKER'))).toBe(true);
    expect((await altar(1, false)).lines.some((l) => l.includes('LOCKER'))).toBe(false);
    expect((await altar(1, false)).lines.some((l) => l.startsWith('MYOWTH joined!'))).toBe(true);
  });

  // CH5-FB (Lyall): with a full crew the scene offers the MON LOCKER on the
  // spot, so the player can bench someone and fight with Myowth straight away.
  it('a full crew is offered the LOCKER right there — YES opens it, NO does not; a free slot never asks', async () => {
    expect((await altar(PARTY_CAP, true)).locker).toBe(true);
    expect((await altar(PARTY_CAP, false)).locker).toBe(false);
    expect((await altar(1, true)).locker).toBe(false);
  });

  // CH5-FB (Lyall): a clean loss let you walk on and take the mask with the
  // spirit never calmed — and her step trigger still armed on the way back.
  it('the altar refuses until the spirit is calmed', async () => {
    const r = await altar(1, true, false);
    expect(r.lines[0]).toContain("She's still here.");
    expect(quest.flags.ch5Mask).toBe(false);
    expect(quest.flags.ch5Myowth).toBe(false);
    expect(quest.items).not.toContain('BONE MASK');
  });
});

describe('HQ Myowth fourth-wall gag (Lyall, 2026-08-29)', () => {
  it('plays once after the join, then never again; nothing before the join', async () => {
    const { hqScripts } = await import('../src/data/dialog/hq');
    const { runScript } = await import('../src/systems/script');
    const talk = (): string[] => {
      const lines: string[] = [];
      const noop = (): void => {};
      runScript(hqScripts['npc:myowth'], {
        say: (pages, done) => { lines.push(...pages.map((p) => p.join(' '))); done(); },
        battle: (_i, d) => d(null), warp: (_w, d) => d(), sfx: noop, music: noop, setTile: noop, addWarp: noop,
        locker: (d) => d(), shop: (_i, d) => d(), endScreen: noop, rankUp: (_r, d) => d(), heat: noop, giveMon: noop,
        npcRun: (_i, d) => d(), healParty: noop, sysMsg: noop, jobs: (d) => d(), cardFlip: (d) => d(),
        tour: (_s, d) => d(), choice: (_p, d) => d(false),
      });
      return lines;
    };
    quest.flags.missionDone = true;
    expect(talk().some((l) => l.includes('Two of me'))).toBe(false);
    quest.flags.ch5Myowth = true;
    const first = talk();
    expect(first[0]).toContain('Two of me');
    expect(first.some((l) => l.startsWith('MYOWTH: Sneak'))).toBe(true); // falls through to the drill offer
    expect(quest.flags.myowthGagSeen).toBe(true);
    expect(talk().some((l) => l.includes('Two of me'))).toBe(false);
  });
});

describe('the CH5 items', () => {
  it('SCOPE and CHARM are key items, the MASK a quest item, none buyable', () => {
    expect(ITEMS[SCOPE_ITEM]).toMatchObject({ kind: 'key', price: 0 });
    expect(ITEMS['BONE CHARM']).toMatchObject({ kind: 'key', price: 0 });
    expect(ITEMS['BONE MASK']).toMatchObject({ kind: 'quest', price: 0 });
  });
});

describe('usableInBattle with a per-fight key list (CH5.0 §2)', () => {
  it('defaults to the SMOKE BALL, so the SCOPE never clutters an ordinary fight', () => {
    expect(usableInBattle('SODA')).toBe(true);
    expect(usableInBattle('SMOKE BALL')).toBe(true);
    expect(usableInBattle(SCOPE_ITEM)).toBe(false);
    expect(usableInBattle('BONE CHARM')).toBe(false);
  });

  it('an unwinnable fight swaps the SMOKE BALL out for its charm', () => {
    const keys = ['BONE CHARM'];
    expect(usableInBattle('BONE CHARM', keys)).toBe(true);
    expect(usableInBattle('SMOKE BALL', keys)).toBe(false);
    expect(usableInBattle('SODA', keys)).toBe(true);
  });
});

describe('dexTotal (CH5.0 §5)', () => {
  const boss: MonSpecies = { ...SPECIES.koffink, id: 'boss', name: 'BOSS', bossOnly: true };
  const registry = { koffink: SPECIES.koffink, voltorbb: SPECIES.voltorbb, boss };

  it('leaves boss-only species out of the denominator', () => {
    expect(dexTotal(registry)).toBe(2);
    expect(dexTotal(SPECIES)).toBe(Object.values(SPECIES).filter((s) => !s.bossOnly).length);
  });

  it('dexComplete reads n/n against that denominator, so a boss can never block 100%', () => {
    const owned = [{ species: 'koffink' }, { species: 'voltorbb' }];
    expect(dexCount(owned, registry)).toBe(2);
    expect(dexComplete(owned, registry)).toBe(true);
  });
});

describe('ch5 objectives (CH5.0 §9)', () => {
  function afterCh4(): void {
    for (const f of [
      'briefed', 'guardBeaten', 'switchFound', 'lootTaken', 'missionDone',
      'fossilsTaken', 'bradBeaten', 'ch2Done', 'spanLass', 'ch3Done',
      'ch4Suit', 'ch4Safe', 'ch4Done',
    ] as const) quest.flags[f] = true;
  }

  it('is registered with four ≤17-char steps in order', () => {
    const ch5 = CHAPTERS.find((c) => c.id === 'ch5')!;
    expect(ch5.steps.map((s) => s.objective)).toEqual(['FIND THE SCOPE', 'CALM THE SPIRIT', 'TAKE THE MASK', 'REPORT TO BOSS']);
    for (const s of ch5.steps) expect(s.objective.length).toBeLessThanOrEqual(17);
  });

  it('derives in order from the SCOPE pickup through the hand-in', () => {
    afterCh4();
    expect(currentObjective()).toBe('FIND THE SCOPE');
    quest.items.push(SCOPE_ITEM);
    expect(currentObjective()).toBe('CALM THE SPIRIT');
    quest.flags.ch5Spirit = true;
    expect(currentObjective()).toBe('TAKE THE MASK');
    quest.flags.ch5Mask = true;
    expect(currentObjective()).toBe('REPORT TO BOSS');
    quest.flags.ch5Done = true;
    expect(currentObjective()).toBe('AWAIT ORDERS.');
  });
});

describe('GRAVE tile (CH5.0 §11)', () => {
  it('`t` is registered, 16×16, and blocks', () => {
    expect(TILES.t).toHaveLength(1);
    expect(TILES.t[0]).toHaveLength(16);
    for (const row of TILES.t[0]) expect(row).toHaveLength(16);
    expect(WALKABLE.has('t')).toBe(false);
  });
});

// ── Data lints over the live registries. Zero instances today; they bite
//    the moment the SPR.C batch and the CH5 content land. ──────────────────
describe('CH5 registry lints', () => {
  it('every unwinnable encounter is uncatchable, and its item is a real key item', () => {
    for (const [id, enc] of Object.entries(ENCOUNTERS)) {
      if (!enc.unwinnable) continue;
      expect(enc.uncatchable, `${id} is unwinnable but catchable`).toBe(true);
      expect(ITEMS[enc.unwinnable.item]?.kind, `${id} unwinnable.item "${enc.unwinnable.item}"`).toBe('key');
      // CH5-FB: the hint is one battle-box page and names the item
      expect(enc.unwinnable.hint.length).toBeGreaterThan(0);
      expect(enc.unwinnable.hint.length).toBeLessThanOrEqual(3);
      for (const line of enc.unwinnable.hint) expect(line.length, `${id} hint line too long: "${line}"`).toBeLessThanOrEqual(17);
      expect(enc.unwinnable.hint.join(' '), `${id} hint names its item`).toContain(enc.unwinnable.item);
    }
  });

  it('every encounter music override resolves in TRACKS', () => {
    for (const [id, enc] of Object.entries(ENCOUNTERS)) {
      if (enc.music) expect(TRACKS[enc.music], `${id} music "${enc.music}"`).toBeDefined();
    }
  });

  it('a boss-only species is never in a wild table and only ever an uncatchable foe', () => {
    const bosses = new Set(Object.values(SPECIES).filter((s) => s.bossOnly).map((s) => s.id));
    for (const map of Object.values(MAPS)) {
      for (const e of map.encounters?.entries ?? []) {
        expect(bosses.has(e.species), `${map.id} wild table holds boss-only ${e.species}`).toBe(false);
      }
    }
    for (const [id, enc] of Object.entries(ENCOUNTERS)) {
      if (bosses.has(enc.foe.species)) expect(enc.uncatchable, `${id} fields boss-only ${enc.foe.species} catchable`).toBe(true);
    }
  });

  it('every species talk page fits the battle box (≤3 lines × 17)', () => {
    for (const sp of Object.values(SPECIES)) {
      for (const page of sp.talk ?? []) {
        expect(page.length, `${sp.id} talk page has too many lines`).toBeLessThanOrEqual(3);
        expect(page.length, `${sp.id} talk page is empty`).toBeGreaterThan(0);
        for (const line of page) expect(line.length, `${sp.id} talk line too long: "${line}"`).toBeLessThanOrEqual(17);
      }
    }
  });
});
