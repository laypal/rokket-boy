// Input: keyboard + shell buttons (multi-touch safe). Call initInput() once.
import type { Dir } from '../types';

const down = new Set<string>();
const pressed = new Set<string>();

const KEYMAP: Record<string, string> = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  w: 'up', s: 'down', a: 'left', d: 'right',
  W: 'up', S: 'down', A: 'left', D: 'right',
  z: 'a', Z: 'a', ' ': 'a', x: 'b', X: 'b',
  Enter: 'start', Shift: 'select',
};

export interface InputHooks {
  onFirstInput: () => void;   // power LED + audio unlock
  onMuteToggle: () => void;   // M key
}

let hooks: InputHooks | null = null;

function press(k: string): void {
  if (!down.has(k)) pressed.add(k);
  down.add(k);
  hooks?.onFirstInput();
}
function release(k: string): void {
  down.delete(k);
}

export function initInput(h: InputHooks): void {
  hooks = h;
  addEventListener('keydown', (e) => {
    if (e.key === 'm' || e.key === 'M') {
      hooks?.onMuteToggle();
      return;
    }
    const k = KEYMAP[e.key];
    if (k) {
      e.preventDefault();
      press(k);
    }
  });
  addEventListener('keyup', (e) => {
    const k = KEYMAP[e.key];
    if (k) release(k);
  });
  document.querySelectorAll<HTMLElement>('[data-k]').forEach((el) => {
    const k = el.dataset.k!;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      el.classList.add('held');
      press(k);
    });
    const up = (): void => {
      el.classList.remove('held');
      release(k);
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  });
}

export const Input = {
  held: (k: string): boolean => down.has(k),
  hit: (k: string): boolean => pressed.has(k), // pressed this frame
  endFrame: (): void => pressed.clear(),
  dirHeld: (): Dir | null =>
    down.has('up') ? 'up' : down.has('down') ? 'down' : down.has('left') ? 'left' : down.has('right') ? 'right' : null,
};
