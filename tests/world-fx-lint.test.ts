// F38 world-fx lints (JCE.4 chests, JCE.6 exits). Both rules read the
// content as data and walk every script PATH: a branch sees the steps above
// it and its ancestors', never a sibling branch's (a glint in a `then` does
// not satisfy a chest in the `else` — the JCE.4 review note).
//
//  - every chest that opens (`setTile … '%'` outside an `enter` script)
//    glints first: `{ fx: { id: 'spark', at: [x, y] } }` at the same tile;
//  - every NPC with a plain `goneIf: { flag }` leaves in a puff: every
//    script path that sets that flag (map scripts and encounter
//    onWin/onLose/onFlee) has `{ fx: { id: 'poof', at: [npc.x, npc.y] } }`
//    earlier on the path.
// Reload-repair `enter` scripts re-apply tiles silently and are exempt.
import { describe, it, expect, beforeEach } from 'vitest';
import { MAPS } from '../src/data/maps';
import { ENCOUNTERS } from '../src/data/encounters';
import { runScript, type ScriptHooks } from '../src/systems/script';
import { quest, resetQuest, setPartySize, PARTY_CAP } from '../src/systems/quest';
import { cornerScripts } from '../src/data/dialog/corner';
import { lav3Scripts } from '../src/data/dialog/lav3';
import type { ScriptStep } from '../src/types';

/** Visit every step with the steps that precede it on ITS path. */
function walk(steps: ScriptStep[], visit: (step: ScriptStep, before: ScriptStep[]) => void, before: ScriptStep[] = []): void {
  const path = [...before];
  for (const s of steps) {
    visit(s, path);
    if ('if' in s) {
      walk(s.then, visit, path);
      walk(s.else ?? [], visit, path);
    }
    if ('choice' in s) {
      walk(s.choice.yes, visit, path);
      walk(s.choice.no ?? [], visit, path);
    }
    path.push(s);
  }
}

function hasFx(before: ScriptStep[], id: string, x: number, y: number): boolean {
  return before.some((p) => 'fx' in p && p.fx.id === id && p.fx.at?.[0] === x && p.fx.at?.[1] === y);
}

/** Every script in the game, labelled — map scripts (minus `enter`) and every encounter's three exits. */
function allScripts(): [string, ScriptStep[]][] {
  const out: [string, ScriptStep[]][] = [];
  for (const map of Object.values(MAPS)) {
    for (const [key, steps] of Object.entries(map.scripts)) if (key !== 'enter') out.push([`${map.id} ${key}`, steps]);
  }
  for (const [id, enc] of Object.entries(ENCOUNTERS)) {
    out.push([`${id}.onWin`, enc.onWin], [`${id}.onLose`, enc.onLose], [`${id}.onFlee`, enc.onFlee]);
  }
  return out;
}

describe('JCE.4: chests glint before they open', () => {
  it("every setTile to '%' outside an enter script is preceded by fx spark at the same tile ON ITS PATH", () => {
    let chests = 0;
    for (const [label, steps] of allScripts()) {
      walk(steps, (s, before) => {
        if (!('setTile' in s) || s.setTile[2] !== '%') return;
        chests++;
        const [x, y] = s.setTile;
        expect(hasFx(before, 'spark', x, y), `${label}: chest at (${x},${y}) opens without a spark`).toBe(true);
      });
    }
    expect(chests).toBeGreaterThanOrEqual(4); // vault, moonDig, lav3, syl5
  });

  it('the walker is path-scoped: a spark in a sibling branch does not count', () => {
    const steps: ScriptStep[] = [
      { if: { flag: 'briefed' }, then: [{ fx: { id: 'spark', at: [1, 1] } }], else: [{ setTile: [1, 1, '%'] }] },
    ];
    let seen = 0;
    walk(steps, (s, before) => {
      if ('setTile' in s) {
        seen++;
        expect(hasFx(before, 'spark', 1, 1)).toBe(false);
      }
    });
    expect(seen).toBe(1);
  });
});

describe('JCE.6: people leave in a puff', () => {
  it('every plain goneIf-flag NPC has fx poof at its tile before every setFlag of that flag, on every path', () => {
    const exits: { map: string; id: string; x: number; y: number; flag: string }[] = [];
    for (const map of Object.values(MAPS)) {
      for (const n of map.npcs) {
        if (n.goneIf && 'flag' in n.goneIf) exits.push({ map: map.id, id: n.id, x: n.x, y: n.y, flag: n.goneIf.flag });
      }
    }
    // corner guard, moonDig BRAD, five span marks, syl1 DJames, syl3 clerk_b, syl5 duo
    expect(exits.length).toBeGreaterThanOrEqual(11);
    let setters = 0;
    for (const [label, steps] of allScripts()) {
      walk(steps, (s, before) => {
        if (!('setFlag' in s)) return;
        for (const e of exits) {
          if (e.flag !== s.setFlag) continue;
          setters++;
          expect(hasFx(before, 'poof', e.x, e.y), `${label}: sets ${e.flag} but ${e.map}/${e.id} at (${e.x},${e.y}) leaves without a poof`).toBe(true);
        }
      });
    }
    expect(setters).toBeGreaterThanOrEqual(exits.length);
  });
});

// ── interpreter pins for what the lint can't see ──────────────────────────
function eventHooks() {
  const events: string[] = [];
  const hooks: ScriptHooks = {
    say: (_p, done) => {
      events.push('say');
      done();
    },
    battle: (id, done) => {
      events.push('battle:' + id);
      done(null);
    },
    warp: (w, done) => {
      events.push('warp:' + w.join(','));
      done();
    },
    sfx: (id) => events.push('sfx:' + id),
    fx: (id, at, npc) => events.push('fx:' + id + (at ? '@' + at.join(',') : '') + (npc ? '#' + npc : '')),
    music: () => {},
    setTile: (x, y, ch) => events.push(`setTile:${x},${y},${ch}`),
    addWarp: () => {},
    locker: (done) => done(),
    shop: (_id, done) => done(),
    endScreen: () => events.push('endScreen'),
    rankUp: (r, done) => {
      events.push('rankUp:' + r);
      done();
    },
    heat: () => {},
    giveMon: (species) => events.push('giveMon:' + species),
    npcRun: (_id, done) => done(),
    healParty: () => {},
    sysMsg: () => {},
    jobs: (done) => done(),
    cardFlip: (done) => done(),
    tour: (_s, done) => done(),
    choice: (_p, done) => {
      events.push('choice');
      done(false);
    },
  };
  return { hooks, events };
}

/** `a` appears before `b` in `events`, both present. */
function before(events: string[], a: string, b: string): boolean {
  const ia = events.indexOf(a);
  const ib = events.indexOf(b);
  return ia >= 0 && ib >= 0 && ia < ib;
}

beforeEach(() => {
  resetQuest();
  setPartySize(() => 0);
});

describe('JCE.6 pins: the any[] exits and the CH1 switch', () => {
  it('the S.S. ANN chief puffs at (17,4), then the sound, before ch4Done is set', () => {
    const { hooks, events } = eventHooks();
    hooks.sfx = (id) => events.push('sfx:' + id + (quest.flags.ch4Done ? '/gone' : ''));
    runScript(ENCOUNTERS.ss_chief2.onWin, hooks);
    expect(quest.flags.ch4Done).toBe(true);
    expect(before(events, 'fx:poof@17,4', 'sfx:poof')).toBe(true); // the sound fires with the flag still false
  });

  it.each([true, false])('Myowth (partyFull=%s) puffs off his LIVE tile before ch5Myowth is set', (full) => {
    quest.flags.ch5Spirit = true;
    setPartySize(() => (full ? PARTY_CAP : 0));
    const { hooks, events } = eventHooks();
    hooks.giveMon = (s) => events.push('giveMon:' + s + (quest.flags.ch5Myowth ? '/gone' : ''));
    runScript(lav3Scripts['at:2,1'], hooks);
    expect(quest.flags.ch5Myowth).toBe(true);
    expect(before(events, 'fx:poof#myowth', 'sfx:poof')).toBe(true);
    expect(before(events, 'sfx:poof', 'giveMon:myowth')).toBe(true); // puff → join → flag
  });

  it('the CH1 poster switch glints at (2,2) before the stairs appear', () => {
    quest.flags.guardBeaten = true;
    const { hooks, events } = eventHooks();
    runScript(cornerScripts['tile:p'], hooks);
    expect(quest.flags.switchFound).toBe(true);
    expect(before(events, 'fx:spark@2,2', 'setTile:2,2,>')).toBe(true);
  });
});
