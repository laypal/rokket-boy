// Field diagnostics (HRD.3): error ring buffer, build stamp, report() shape.
// diagnostics.ts is engine-free on purpose (state + save only — no renderer)
// so the whole module unit-tests in Node. install() is exercised against a
// stubbed window.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { G } from '../src/state';
import { MAPS } from '../src/data/maps';
import { setSaveStorage, type SaveStorage } from '../src/systems/save';
import { RING_CAP, TOAST_FRAMES, recordError, clearErrors, report, install, rokketApi, toastLines } from '../src/engine/diagnostics';

function fakeStorage(): SaveStorage {
  let data: string | null = null;
  return {
    read: () => data,
    write: (d) => {
      data = d;
    },
    persistent: true,
  };
}

beforeEach(() => {
  clearErrors();
  setSaveStorage(fakeStorage());
  G.frame = 777;
  G.state = 'world';
  G.map = MAPS.hq;
  G.party = [{ species: 'koffink', lv: 5, hp: 19, xp: 0, moves: ['tackle'] }];
  G.box = [];
  G.heatState = {};
  G.playSeconds = 0;
  G.player.x = 9;
  G.player.y = 7;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('error ring buffer', () => {
  it('caps at RING_CAP and evicts the oldest first', () => {
    for (let i = 0; i < RING_CAP + 5; i++) recordError(new Error(`e${i}`));
    const errors = report().errors;
    expect(errors).toHaveLength(RING_CAP);
    expect(errors[0].message).toBe('e5'); // 0–4 evicted
    expect(errors[RING_CAP - 1].message).toBe(`e${RING_CAP + 4}`);
  });

  it('captures message, stack and game-state context per entry', () => {
    recordError(new Error('boom'));
    const [e] = report().errors;
    expect(e.message).toBe('boom');
    expect(typeof e.stack).toBe('string');
    expect(e.frame).toBe(777);
    expect(e.state).toBe('world');
    expect(e.mapId).toBe('hq');
  });

  it('stringifies non-Error throws instead of dropping them', () => {
    recordError('plain string throw');
    expect(report().errors[0].message).toBe('plain string throw');
  });
});

describe('report()', () => {
  it('has the stable shape and is JSON-serialisable', () => {
    recordError(new Error('x'));
    const r = report();
    expect(Object.keys(r).sort()).toEqual(['build', 'errors', 'frame', 'save', 'state']);
    expect(typeof r.build).toBe('string');
    expect(r.state).toBe('world');
    expect(r.frame).toBe(777);
    expect(r.save.version).toBe(3); // snapshot() — exactly the save blob shape
    const roundTrip = JSON.parse(JSON.stringify(r)) as ReturnType<typeof report>;
    expect(roundTrip.errors[0].message).toBe('x');
  });

  it('returns copies — mutating a report cannot touch the ring', () => {
    recordError(new Error('x'));
    report().errors.pop();
    expect(report().errors).toHaveLength(1);
  });
});

describe('install()', () => {
  it('registers window error + unhandledrejection handlers that record with context', () => {
    const handlers = new Map<string, (e: unknown) => void>();
    vi.stubGlobal('window', {
      addEventListener: (type: string, fn: (e: unknown) => void) => handlers.set(type, fn),
    });
    install();
    expect([...handlers.keys()].sort()).toEqual(['error', 'unhandledrejection']);
    handlers.get('error')!({ error: new Error('sync-boom') });
    handlers.get('unhandledrejection')!({ reason: new Error('async-boom') });
    const msgs = report().errors.map((e) => e.message);
    expect(msgs).toEqual(['sync-boom', 'async-boom']);
    expect(report().errors[0].state).toBe('world');
  });

  it('falls back to the event message when an ErrorEvent carries no error object', () => {
    const handlers = new Map<string, (e: unknown) => void>();
    vi.stubGlobal('window', {
      addEventListener: (type: string, fn: (e: unknown) => void) => handlers.set(type, fn),
    });
    install();
    handlers.get('error')!({ error: undefined, message: 'Script error.' });
    expect(report().errors[0].message).toBe('Script error.');
  });
});

describe('staging surface', () => {
  it('rokketApi is frozen and read-only — report() is its only member', () => {
    expect(Object.isFrozen(rokketApi)).toBe(true);
    expect(Object.keys(rokketApi)).toEqual(['report']);
    expect(rokketApi.report).toBe(report);
  });
});

describe('GLITCH toast (HRD.1-FB)', () => {
  it('is hidden before any error is recorded', () => {
    expect(toastLines()).toBeNull();
  });

  it('shows the build sha and the truncated uppercased message after an error', () => {
    recordError(new Error('cannot read properties of undefined'));
    const lines = toastLines();
    expect(lines).not.toBeNull();
    expect(lines![0]).toMatch(/^GLITCH! \S+$/); // "GLITCH! <sha-or-dev>"
    expect(lines![1]).toBe('CANNOT READ PROPERTI'); // 20-char glyph budget
  });

  it('expires after TOAST_FRAMES and re-arms on a fresh error', () => {
    recordError(new Error('first'));
    G.frame += TOAST_FRAMES; // still on the last visible frame
    expect(toastLines()).not.toBeNull();
    G.frame += 1; // past it
    expect(toastLines()).toBeNull();
    recordError(new Error('second')); // re-arms at the new frame
    expect(toastLines()![1]).toBe('SECOND');
    G.frame += TOAST_FRAMES + 1;
    expect(toastLines()).toBeNull();
  });

  it('clearErrors hides the toast too', () => {
    recordError(new Error('x'));
    clearErrors();
    expect(toastLines()).toBeNull();
  });
});
