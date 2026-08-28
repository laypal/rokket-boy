// PKG.2 — ask the browser to keep this origin's storage through disk
// pressure. Saves are localStorage (save.ts); without the grant Chrome may
// evict them for a rarely-opened site. An installed PWA is granted this
// automatically, a tab usually on request. Fire-and-forget: the answer
// changes nothing the game does.
export interface PersistHost {
  storage?: { persist?: () => Promise<boolean> };
}

export function requestPersist(nav: PersistHost): void {
  const persist = nav.storage?.persist;
  if (!persist) return;
  persist.call(nav.storage).catch(() => {});
}
