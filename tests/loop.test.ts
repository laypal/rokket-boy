// Frame-loop crash guard (HRD.1): one throwing handler must not kill the
// loop forever. runFrame() is the extracted, DOM-light frame body so this
// tests without a real rAF/canvas. loop.ts imports the renderer (canvas-bound)
// so it's mocked here per 02-dos-and-donts "engine-free where possible" note.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { G } from '../src/state';

vi.mock('../src/engine/renderer', () => ({
  drawFade: vi.fn(),
  rect: vi.fn(),
  text: vi.fn(),
  W: 160,
}));
vi.mock('../src/engine/input', () => ({
  Input: { endFrame: vi.fn() },
}));

import { drawFade, rect, text } from '../src/engine/renderer';
import { Input } from '../src/engine/input';
import { registerState, runFrame, setErrorSink } from '../src/engine/loop';
import { clearErrors, report } from '../src/engine/diagnostics';

describe('frame-loop crash guard (HRD.1)', () => {
  beforeEach(() => {
    G.frame = 0;
    G.playSeconds = 0;
    G.state = 'boot';
    vi.clearAllMocks();
    setErrorSink(null); // reset to default (console.error) between tests
  });

  it('a throwing handler does not stop the next frame from running', () => {
    let calls = 0;
    registerState('boot', () => {
      calls++;
      if (calls === 1) throw new Error('boom');
    });
    const sink = vi.fn();
    setErrorSink(sink);

    expect(() => runFrame()).not.toThrow();
    expect(calls).toBe(1);
    expect(sink).toHaveBeenCalledTimes(1);

    expect(() => runFrame()).not.toThrow();
    expect(calls).toBe(2); // second frame's handler ran — loop kept going
  });

  it('never swallows silently — the sink always records the thrown error', () => {
    registerState('boot', () => {
      throw new Error('kaboom');
    });
    const sink = vi.fn();
    setErrorSink(sink);
    runFrame();
    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink.mock.calls[0][0]).toBeInstanceOf(Error);
    expect((sink.mock.calls[0][0] as Error).message).toBe('kaboom');
  });

  it('drawFade throwing is also caught and still records', () => {
    registerState('boot', () => {});
    vi.mocked(drawFade).mockImplementationOnce(() => {
      throw new Error('fade-fail');
    });
    const sink = vi.fn();
    setErrorSink(sink);
    expect(() => runFrame()).not.toThrow();
    expect(sink).toHaveBeenCalledTimes(1);
  });

  it('Input.endFrame runs every frame, including after a throw (finally)', () => {
    registerState('boot', () => {
      throw new Error('boom');
    });
    setErrorSink(vi.fn());
    runFrame();
    expect(Input.endFrame).toHaveBeenCalledTimes(1);
  });

  it('a caught throw draws the GLITCH toast that same frame (HRD.1-FB)', () => {
    clearErrors();
    registerState('boot', () => {
      throw new Error('toast-me');
    });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    runFrame(); // default sink → ring → toast armed; finally draws it
    spy.mockRestore();
    expect(vi.mocked(text)).toHaveBeenCalledWith(expect.stringMatching(/^GLITCH! /), expect.any(Number), expect.any(Number), expect.any(String));
    expect(vi.mocked(text)).toHaveBeenCalledWith('TOAST-ME', expect.any(Number), expect.any(Number), expect.any(String));
    expect(vi.mocked(rect)).toHaveBeenCalled(); // the backing band
  });

  it('a throwing toast draw records exactly once — never floods the ring (HRD.1-FB)', () => {
    clearErrors();
    registerState('boot', () => {
      throw new Error('primary');
    });
    vi.mocked(rect).mockImplementation(() => {
      throw new Error('renderer-dead');
    });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    runFrame();
    runFrame();
    runFrame();
    spy.mockRestore();
    vi.mocked(rect).mockReset();
    const msgs = report().errors.map((e) => e.message);
    // three primaries + ONE latched renderer-dead — not one per frame
    expect(msgs.filter((m) => m === 'renderer-dead')).toHaveLength(1);
    expect(msgs.filter((m) => m === 'primary')).toHaveLength(3);
  });

  it('default sink records into the diagnostics ring (HRD.3) and still consoles in dev', () => {
    clearErrors();
    registerState('boot', () => {
      throw new Error('default-sink');
    });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    runFrame();
    expect(spy).toHaveBeenCalledTimes(1); // dev console — never silent
    spy.mockRestore();
    const errors = report().errors;
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe('default-sink');
    expect(errors[0].state).toBe('boot'); // context captured at throw time
  });
});
