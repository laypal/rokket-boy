// AUDIO — 4-channel chiptune (pulse×2, triangle, noise), lookahead scheduler.
// Straight port of Audio2 from the monolith; sequencer parse() exported for tests.
import { TRACKS, type Track } from '../data/music';
import { SFX } from '../data/sfx';

let ac: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let muted = false;
let volume = 0.55;
let song: Track | null = null;
let step = 0;
let nextT = 0;
let timer: ReturnType<typeof setInterval> | null = null;
let curName: string | null = null;

function init(): boolean {
  if (ac) return true;
  try {
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return false;
    ac = new AC();
    master = ac.createGain();
    master.gain.value = muted ? 0 : volume * 0.5;
    master.connect(ac.destination);
    const len = ac.sampleRate * 1;
    noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  } catch {
    return false;
  }
  return true;
}
function resume(): void {
  if (ac && ac.state === 'suspended') void ac.resume();
}

// duty-cycle square via PeriodicWave (approx GB pulse)
const waves: Record<number, PeriodicWave> = {};
function pulseWave(duty: number): PeriodicWave {
  if (waves[duty]) return waves[duty];
  const N = 32;
  const real = new Float32Array(N);
  const imag = new Float32Array(N);
  for (let n = 1; n < N; n++) imag[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * duty);
  return (waves[duty] = ac!.createPeriodicWave(real, imag));
}

const NN: Record<string, number> = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
export function freq(tok: string): number {
  const m = /^([A-G]#?)(\d)$/.exec(tok);
  if (!m) return 0;
  return 440 * Math.pow(2, (NN[m[1]] - 9 + (+m[2] - 4) * 12) / 12);
}

function playNote(t: number, f: number, dur: number, type: string, vol: number, duty?: number): void {
  const o = ac!.createOscillator();
  const g = ac!.createGain();
  if (type === 'pulse') o.setPeriodicWave(pulseWave(duty || 0.5));
  else o.type = type as OscillatorType; // 'triangle'
  o.frequency.value = f;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(Math.max(vol * 0.25, 0.001), t + dur * 0.9);
  g.gain.linearRampToValueAtTime(0, t + dur);
  o.connect(g);
  g.connect(master!);
  o.start(t);
  o.stop(t + dur + 0.02);
}
function playDrum(t: number, kind: string): void {
  if (kind === 'k') {
    // kick: pitch-dropping triangle
    const o = ac!.createOscillator();
    const g = ac!.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.1);
    g.gain.setValueAtTime(0.9, t);
    g.gain.linearRampToValueAtTime(0, t + 0.12);
    o.connect(g);
    g.connect(master!);
    o.start(t);
    o.stop(t + 0.14);
  } else {
    // s snare / h hat: filtered noise
    const s = ac!.createBufferSource();
    s.buffer = noiseBuf;
    const f = ac!.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = kind === 'h' ? 6500 : 1800;
    const g = ac!.createGain();
    const dur = kind === 'h' ? 0.03 : 0.09;
    const v = kind === 'h' ? 0.25 : 0.5;
    g.gain.setValueAtTime(v, t);
    g.gain.linearRampToValueAtTime(0, t + dur);
    s.connect(f);
    f.connect(g);
    g.connect(master!);
    s.start(t);
    s.stop(t + dur + 0.02);
  }
}

// ── Sequencer ──────────────────────────────────────────────────────────
// Track: { bpm, p1/p2/tri: 'tok tok ...', dr: 'k.h.s.h.' }
// token = eighth note: note name, '-' rest, '=' sustain previous
export function parse(str: string): string[] {
  return str.trim().split(/\s+/);
}

const CHANNELS: [('p1' | 'p2' | 'tri'), string, number, number][] = [
  ['p1', 'pulse', 0.5, 0.3],
  ['p2', 'pulse', 0.25, 0.2],
  ['tri', 'triangle', 0, 0.42],
];

function scheduleStep(tr: Track, i: number, t: number, sd: number): void {
  for (const [ch, type, duty, vol] of CHANNELS) {
    const seq = tr[('_' + ch) as '_p1' | '_p2' | '_tri'];
    if (!seq) continue;
    const tok = seq[i % seq.length];
    if (tok === '-' || tok === '=') continue;
    // sustain: count following '='
    let n = 1;
    while (seq[(i + n) % seq.length] === '=' && n < 16) n++;
    const f = freq(tok);
    if (f) playNote(t, f, sd * n * 0.95, type, (tr.v && tr.v[ch]) || vol, duty);
  }
  if (tr._dr) {
    const c = tr._dr[i % tr._dr.length];
    if (c !== '.') playDrum(t, c);
  }
}
function tick(): void {
  if (!song) return;
  const sd = 30 / song.bpm; // eighth-note duration
  while (nextT < ac!.currentTime + 0.12) {
    scheduleStep(song, step, Math.max(nextT, ac!.currentTime), sd);
    nextT += sd;
    step++;
  }
}
function play(name: string): void {
  if (curName === name) return;
  if (!init()) return;
  resume();
  curName = name;
  song = TRACKS[name] || null;
  step = 0;
  nextT = ac!.currentTime + 0.06;
  if (song && !song._p1) {
    for (const ch of ['p1', 'p2', 'tri'] as const) {
      if (song[ch]) song[('_' + ch) as '_p1' | '_p2' | '_tri'] = parse(song[ch]!);
    }
    if (song.dr) song._dr = song.dr.replace(/\s+/g, '');
  }
  if (!timer) timer = setInterval(tick, 25);
}
function stop(): void {
  song = null;
  curName = null;
}

// ── SFX ────────────────────────────────────────────────────────────────
// Recipes live in data/sfx.ts (TOOL.2) — the same table the preview script
// renders to WAV. Unknown names no-op, as the switch always did.
function sfx(name: string): void {
  const steps = SFX[name];
  if (!steps || !init()) return;
  resume();
  const t = ac!.currentTime;
  for (const s of steps) {
    if (s.length === 2) playDrum(t + s[0], s[1]);
    else playNote(t + s[0], s[1], s[2], s[4] ? 'pulse' : 'triangle', s[3], s[4]);
  }
}

function setMuted(m: boolean): void {
  muted = m;
  if (master) master.gain.value = m ? 0 : volume * 0.5;
}
function setVolume(v: number): void {
  volume = v;
  if (master && !muted) master.gain.value = v * 0.5;
}

export const Audio2 = {
  play,
  stop,
  sfx,
  setMuted,
  setVolume,
  init,
  resume,
  get muted() { return muted; },
  get volume() { return volume; },
  get current() { return curName; },
};
