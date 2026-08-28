// PKG.3: the service worker's three branches, driven with stubbed worker
// globals — the e2e-dist spec proves the happy path in a real browser, this
// pins the failure paths a browser test can't stage cheaply: install must
// survive a failed pre-cache, a 5xx must never replace the cached shell,
// and the cache write must be registered with waitUntil synchronously.
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (e: Record<string, unknown>) => void;
const handlers: Record<string, Handler> = {};
const cache = {
  add: vi.fn(() => Promise.resolve()),
  put: vi.fn<(key: string, val: Response) => Promise<void>>(() => Promise.resolve()),
  match: vi.fn(),
};
const self = {
  addEventListener: (type: string, h: Handler) => {
    handlers[type] = h;
  },
  skipWaiting: vi.fn(() => Promise.resolve()),
  clients: { claim: vi.fn(() => Promise.resolve()) },
};
const fetchMock = vi.fn();

vi.stubGlobal('self', self);
vi.stubGlobal('caches', { open: vi.fn(() => Promise.resolve(cache)), match: (k: string) => cache.match(k) });
vi.stubGlobal('fetch', fetchMock);

await import('../public/sw.js');

function fetchEvent(mode = 'navigate') {
  const e = { request: { mode }, waited: [] as Promise<unknown>[], response: undefined as Promise<Response> | undefined };
  return Object.assign(e, {
    waitUntil: (p: Promise<unknown>) => e.waited.push(p),
    respondWith: (p: Promise<Response>) => {
      e.response = p;
    },
  });
}

beforeEach(() => {
  cache.add.mockClear();
  cache.put.mockClear();
  cache.match.mockReset();
  self.skipWaiting.mockClear();
  fetchMock.mockReset();
});

describe('sw.js install', () => {
  it('pre-caches / then skipWaiting', async () => {
    const waited: Promise<unknown>[] = [];
    handlers.install({ waitUntil: (p: Promise<unknown>) => waited.push(p) });
    await Promise.all(waited);
    expect(cache.add).toHaveBeenCalledWith('/');
    expect(self.skipWaiting).toHaveBeenCalledTimes(1);
  });

  it('still activates when the pre-cache fails', async () => {
    cache.add.mockImplementationOnce(() => Promise.reject(new Error('offline')));
    const waited: Promise<unknown>[] = [];
    handlers.install({ waitUntil: (p: Promise<unknown>) => waited.push(p) });
    await Promise.all(waited);
    expect(self.skipWaiting).toHaveBeenCalledTimes(1);
  });
});

describe('sw.js fetch', () => {
  it('ignores non-navigation requests', () => {
    const e = fetchEvent('cors');
    handlers.fetch(e);
    expect(e.response).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('serves the network response and caches it when ok', async () => {
    const res = new Response('shell', { status: 200 });
    fetchMock.mockResolvedValue(res);
    const e = fetchEvent();
    handlers.fetch(e);
    expect(e.waited.length).toBe(1); // registered synchronously, not in a .then
    expect(await e.response).toBe(res);
    await Promise.all(e.waited);
    expect(cache.put).toHaveBeenCalledTimes(1);
    expect(cache.put.mock.calls[0][0]).toBe('/');
  });

  it('serves a 5xx but never caches it', async () => {
    const res = new Response('boom', { status: 503 });
    fetchMock.mockResolvedValue(res);
    const e = fetchEvent();
    handlers.fetch(e);
    expect(await e.response).toBe(res);
    await Promise.all(e.waited);
    expect(cache.put).not.toHaveBeenCalled();
  });

  it('falls back to the cached shell when the network fails', async () => {
    fetchMock.mockRejectedValue(new TypeError('offline'));
    const shell = new Response('cached');
    cache.match.mockResolvedValue(shell);
    const e = fetchEvent();
    handlers.fetch(e);
    expect(await e.response).toBe(shell);
    await Promise.all(e.waited);
  });

  it('returns an error response when offline with an empty cache', async () => {
    fetchMock.mockRejectedValue(new TypeError('offline'));
    cache.match.mockResolvedValue(undefined);
    const e = fetchEvent();
    handlers.fetch(e);
    const r = await e.response!;
    expect(r.type).toBe('error');
  });
});
