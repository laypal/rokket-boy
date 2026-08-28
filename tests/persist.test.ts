// PKG.2: requestPersist asks the browser to mark the origin's storage
// persistent (saves live in localStorage — evictable under disk pressure
// unless granted). The grant is the browser's call; this pins only that the
// ask happens when the API exists and nothing breaks when it doesn't.
import { describe, expect, it, vi } from 'vitest';
import { requestPersist } from '../src/engine/storage';

describe('requestPersist', () => {
  it('calls storage.persist() once, bound to the storage object', async () => {
    const persist = vi.fn(function (this: unknown) {
      return Promise.resolve(this === storage);
    });
    const storage = { persist };
    requestPersist({ storage });
    expect(persist).toHaveBeenCalledTimes(1);
    await expect(persist.mock.results[0].value).resolves.toBe(true);
  });

  it('is a no-op without navigator.storage or without persist()', () => {
    expect(() => requestPersist({})).not.toThrow();
    expect(() => requestPersist({ storage: {} })).not.toThrow();
  });

  it('swallows a rejected persist()', async () => {
    const storage = { persist: () => Promise.reject(new Error('denied')) };
    requestPersist({ storage });
    await new Promise((r) => setTimeout(r, 0)); // an unhandled rejection would fail the run
  });
});
