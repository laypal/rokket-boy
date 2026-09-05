// TOOL.2 — offline renderer for the chiptune engine (docs/tasks/39-art-audio-pipeline.md).
// Mirrors engine/audio.ts's playNote / playDrum / scheduleStep maths in plain
// JS so a recipe from data/sfx.ts or a track from data/music.ts can be
// bounced to a 16-bit mono WAV without an AudioContext. Pure: no fs, no
// globals; the CLI (sfx-preview.mjs) does the writing.
//
// Kept honest by tests/sfx-preview.test.ts, which cross-checks freq()/parse()
// against the engine's own exports. If audio.ts's envelope or drum numbers
// change, change them here in the same commit — there is deliberately no
// shared constants module (audio.ts can't be imported by node: extensionless
// imports + window at init).

export const SR = 44100;
const MASTER = 0.55 * 0.5; // audio.ts: master.gain = volume * 0.5 at the default volume

// ── Sequencer helpers (duplicated from audio.ts — see header) ────────────
const NN = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
export function freq(tok) {
  const m = /^([A-G]#?)(\d)$/.exec(tok);
  if (!m) return 0;
  return 440 * Math.pow(2, (NN[m[1]] - 9 + (+m[2] - 4) * 12) / 12);
}
export function parse(str) {
  return str.trim().split(/\s+/);
}
// audio.ts CHANNELS: [channel, duty (0 = triangle), default volume]
const CHANNELS = [['p1', 0.5, 0.3], ['p2', 0.25, 0.2], ['tri', 0, 0.42]];

// ── Oscillators ──────────────────────────────────────────────────────────
// audio.ts pulseWave(): 32-harmonic sine series, and Web Audio normalises a
// PeriodicWave to peak 1 — so does this (per duty, cached).
const pulseCache = {};
function pulseTable(duty) {
  if (pulseCache[duty]) return pulseCache[duty];
  const N = 32, L = 1024;
  const tbl = new Float32Array(L);
  let peak = 0;
  for (let i = 0; i < L; i++) {
    const ph = (2 * Math.PI * i) / L;
    let v = 0;
    for (let n = 1; n < N; n++) v += (2 / (n * Math.PI)) * Math.sin(n * Math.PI * duty) * Math.sin(n * ph);
    tbl[i] = v;
    peak = Math.max(peak, Math.abs(v));
  }
  for (let i = 0; i < L; i++) tbl[i] /= peak;
  return (pulseCache[duty] = tbl);
}
function osc(phase, duty) {
  const p = phase - Math.floor(phase); // 0..1
  if (!duty) return 1 - 4 * Math.abs(((p + 0.75) % 1) - 0.5); // triangle, starts at 0 rising
  const tbl = pulseTable(duty);
  return tbl[Math.floor(p * tbl.length) % tbl.length];
}

// ── playNote: vol → exp ramp to max(vol/4, 0.001) at 0.9·dur → linear to 0 at dur
function note(buf, at, hz, dur, vol, duty) {
  const floor = Math.max(vol * 0.25, 0.001);
  const start = Math.round(at * SR);
  const n = Math.round(dur * SR);
  const knee = 0.9 * dur;
  let ph = 0;
  for (let i = 0; i < n && start + i < buf.length; i++) {
    const tau = i / SR;
    const g = tau < knee ? vol * Math.pow(floor / vol, tau / knee) : floor * (1 - (tau - knee) / (dur - knee));
    buf[start + i] += g * osc(ph, duty);
    ph += hz / SR;
  }
}

// ── playDrum: kick = triangle 120→40 Hz over 0.1 s, gain 0.9→0 over 0.12 s;
//    snare/hat = white noise through a highpass (1800 / 6500 Hz), gain v→0 over dur.
// Noise is seeded (mulberry32) so a render is byte-stable for tests.
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// RBJ highpass; Web Audio reads Q in dB for highpass — default Q = 1 dB.
function highpass(fc) {
  const w0 = (2 * Math.PI * fc) / SR, q = Math.pow(10, 1 / 20), alpha = Math.sin(w0) / (2 * q), c = Math.cos(w0);
  const a0 = 1 + alpha;
  const b0 = (1 + c) / 2 / a0, b1 = -(1 + c) / a0, b2 = (1 + c) / 2 / a0, a1 = (-2 * c) / a0, a2 = (1 - alpha) / a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return (x) => {
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    return y;
  };
}
export const DRUM_LEN = { k: 0.14, s: 0.11, h: 0.05 }; // audio.ts stop() offsets
function drum(buf, at, kind) {
  const start = Math.round(at * SR);
  if (kind === 'k') {
    const n = Math.round(0.14 * SR);
    let ph = 0;
    for (let i = 0; i < n && start + i < buf.length; i++) {
      const tau = i / SR;
      const hz = tau < 0.1 ? 120 * Math.pow(40 / 120, tau / 0.1) : 40;
      const g = tau < 0.12 ? 0.9 * (1 - tau / 0.12) : 0;
      buf[start + i] += g * osc(ph, 0);
      ph += hz / SR;
    }
    return;
  }
  const dur = kind === 'h' ? 0.03 : 0.09, v = kind === 'h' ? 0.25 : 0.5;
  const hp = highpass(kind === 'h' ? 6500 : 1800), rnd = mulberry32(start + 7);
  const n = Math.round(dur * SR);
  for (let i = 0; i < n && start + i < buf.length; i++) {
    const g = v * (1 - i / n);
    buf[start + i] += g * hp(rnd() * 2 - 1);
  }
}

function finish(buf) {
  const out = new Float32Array(buf.length);
  for (let i = 0; i < buf.length; i++) out[i] = Math.max(-1, Math.min(1, buf[i] * MASTER));
  return out;
}

/** Render one data/sfx.ts recipe. Returns mastered mono samples at SR. */
export function renderSfx(steps) {
  let end = 0;
  for (const s of steps) end = Math.max(end, s.length === 2 ? s[0] + DRUM_LEN[s[1]] : s[0] + s[2] + 0.02);
  const buf = new Float64Array(Math.round((end + 0.05) * SR));
  for (const s of steps) {
    if (s.length === 2) drum(buf, s[0], s[1]);
    else note(buf, s[0], s[1], s[2], s[3], s[4]);
  }
  return finish(buf);
}

/** Render one loop of a data/music.ts track (audio.ts scheduleStep, step by step). */
export function renderTrack(tr) {
  const sd = 30 / tr.bpm; // eighth-note duration
  const seqs = {};
  let len = 0;
  for (const [ch] of CHANNELS) {
    if (!tr[ch]) continue;
    seqs[ch] = parse(tr[ch]);
    len = Math.max(len, seqs[ch].length);
  }
  const dr = tr.dr ? tr.dr.replace(/\s+/g, '') : '';
  len = Math.max(len, dr.length);
  const buf = new Float64Array(Math.round((len * sd + 0.5) * SR));
  for (let i = 0; i < len; i++) {
    const t = i * sd;
    for (const [ch, duty, vol] of CHANNELS) {
      const seq = seqs[ch];
      if (!seq) continue;
      const tok = seq[i % seq.length];
      if (tok === '-' || tok === '=') continue;
      let n = 1;
      while (seq[(i + n) % seq.length] === '=' && n < 16) n++;
      const f = freq(tok);
      if (f) note(buf, t, f, sd * n * 0.95, (tr.v && tr.v[ch]) || vol, duty);
    }
    if (dr) {
      const c = dr[i % dr.length];
      if (c !== '.') drum(buf, t, c);
    }
  }
  return finish(buf);
}

/** 16-bit mono PCM WAV (RIFF) from samples in [-1, 1]. */
export function wav(samples, sr = SR) {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) data.writeInt16LE(Math.round(samples[i] * 32767), i * 2);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(sr, 24); h.writeUInt32LE(sr * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}
