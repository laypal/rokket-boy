// PKG.4: install.ts holds Chrome's deferred beforeinstallprompt so the title
// screen can offer the install itself. Node has EventTarget/Event, so a bare
// target plus a matchMedia stub is a good-enough window.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { canInstall, initInstall, promptInstall, resetInstall } from '../src/engine/install';

function host(standalone = false): EventTarget & { matchMedia: (q: string) => { matches: boolean } } {
  return Object.assign(new EventTarget(), { matchMedia: () => ({ matches: standalone }) });
}

function fireBip(win: EventTarget): { prompt: ReturnType<typeof vi.fn>; preventDefault: ReturnType<typeof vi.fn> } {
  const ev = new Event('beforeinstallprompt', { cancelable: true });
  const prompt = vi.fn(() => Promise.resolve());
  const preventDefault = vi.fn();
  Object.assign(ev, { prompt, preventDefault });
  win.dispatchEvent(ev);
  return { prompt, preventDefault };
}

describe('install.ts', () => {
  beforeEach(() => resetInstall());

  it('cannot install before the browser offers', () => {
    initInstall(host());
    expect(canInstall()).toBe(false);
  });

  it('holds beforeinstallprompt (default prevented) and reports installable', () => {
    initInstall(host());
    const { preventDefault } = fireBip(host()); // wrong target — must NOT count
    expect(canInstall()).toBe(false);
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it('holds the event fired on the initialised window', () => {
    const w = host();
    initInstall(w);
    const { preventDefault } = fireBip(w);
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(canInstall()).toBe(true);
  });

  it('never offers when already running standalone', () => {
    const w = host(true);
    initInstall(w);
    fireBip(w);
    expect(canInstall()).toBe(false);
  });

  it('promptInstall calls prompt() once and drops the event', () => {
    const w = host();
    initInstall(w);
    const { prompt } = fireBip(w);
    promptInstall();
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(canInstall()).toBe(false);
    promptInstall(); // nothing held — no throw, no second call
    expect(prompt).toHaveBeenCalledTimes(1);
  });

  it('appinstalled clears a held event', () => {
    const w = host();
    initInstall(w);
    fireBip(w);
    w.dispatchEvent(new Event('appinstalled'));
    expect(canInstall()).toBe(false);
  });

  it('never offers again after appinstalled, even if a new offer fires', () => {
    const w = host();
    initInstall(w);
    fireBip(w);
    w.dispatchEvent(new Event('appinstalled'));
    fireBip(w);
    expect(canInstall()).toBe(false);
  });

  it('promptInstall swallows a rejected prompt', async () => {
    const w = host();
    initInstall(w);
    const ev = new Event('beforeinstallprompt', { cancelable: true });
    Object.assign(ev, { preventDefault: () => {}, prompt: () => Promise.reject(new Error('stale')) });
    w.dispatchEvent(ev);
    promptInstall();
    await new Promise((r) => setTimeout(r, 0)); // an unhandled rejection would fail the run
    expect(canInstall()).toBe(false);
  });
});
