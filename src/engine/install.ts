// PKG.4 — the game invites its own install. Chrome fires beforeinstallprompt
// once it judges the page installable (manifest + HTTPS); we hold the event
// and the title screen calls prompt() on SELECT. Never fires on iOS Safari
// (no such event) or when already standalone — canInstall() is false there
// and the title line simply never draws. One prompt() per event, by spec.
export interface InstallPromptEvent extends Event {
  prompt(): Promise<unknown>;
}

export type InstallHost = EventTarget & { matchMedia?: (query: string) => { matches: boolean } };

let held: InstallPromptEvent | null = null;
let standalone = false;
let installed = false;

export function initInstall(win: InstallHost): void {
  standalone = win.matchMedia?.('(display-mode: standalone)').matches ?? false;
  win.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    held = e as InstallPromptEvent;
  });
  // latched: an installed page never offers again, whatever fires later
  win.addEventListener('appinstalled', () => {
    installed = true;
    held = null;
  });
}

export function canInstall(): boolean {
  return held !== null && !standalone && !installed;
}

export function promptInstall(): void {
  const e = held;
  held = null;
  // a rejected prompt (expired activation, stale event) is not the game's problem
  if (e) void e.prompt().catch(() => {});
}

/** tests + the dev-only __debug.install.reset() hook — module state is
 *  otherwise write-once per page */
export function resetInstall(): void {
  held = null;
  standalone = false;
  installed = false;
}
