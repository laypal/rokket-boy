// TRACKS — 4-channel sequencer data. Eighth-note steps; '-' rest, '=' sustain.
export interface Track { bpm: number; p1?: string; p2?: string; tri?: string; dr?: string;
  v?: Partial<Record<'p1' | 'p2' | 'tri', number>>;
  _p1?: string[]; _p2?: string[]; _tri?: string[]; _dr?: string }

export const TRACKS: Record<string, Track> = {
  // Title — dark, marching, minor fanfare
  title: {
    bpm: 138,
    p1: `E4 =  =  -  G4 =  F#4 =  E4 =  =  =  -  -  B3 =
         C4 =  =  -  E4 =  D4 =  C4 =  =  =  -  -  G3 =
         A3 =  C4 =  E4 =  A4 =  G4 =  F#4 =  E4 =  D4 =
         E4 =  =  =  =  =  -  -  B4 =  =  =  =  =  -  -`,
    p2: `-  -  B3 =  -  -  B3 =  -  -  G3 =  -  -  -  -
         -  -  A3 =  -  -  A3 =  -  -  E3 =  -  -  -  -
         -  -  A3 =  -  -  C4 =  -  -  B3 =  -  -  B3 =
         G3 =  =  =  =  =  -  -  G4 =  =  =  =  =  -  -`,
    tri: `E2 -  E2 -  E2 -  E2 -  E2 -  E2 -  D2 -  D2 -
          A1 -  A1 -  A1 -  A1 -  C2 -  C2 -  B1 -  B1 -
          A1 -  A1 -  A1 -  A1 -  B1 -  B1 -  B1 -  B1 -
          E2 -  E2 -  E2 -  B1 -  E2 -  E2 -  E2 -  B1 -`,
    dr: `k.h.s.h.k.h.s.h. k.h.s.h.k.h.s.h. k.h.s.h.k.h.s.h. k.h.s.h.k.s.s.s.`,
  },
  // Rökket HQ — brooding chromatic descent (hideout energy)
  hq: {
    bpm: 112,
    p1: `-  -  -  -  G4 =  F#4 =  F4 =  =  =  -  -  -  -
         -  -  -  -  D#4 =  D4 =  C4 =  =  =  -  -  -  -
         -  -  C4 =  D#4 =  G4 =  F4 =  D4 =  B3 =  =  =
         C4 =  =  =  =  =  =  =  -  -  -  -  -  -  -  -`,
    p2: `C3 =  -  -  C3 =  -  -  B2 =  -  -  B2 =  -  -
         A#2 =  -  -  A#2 =  -  -  A2 =  -  -  A2 =  -  -
         G#2 =  -  -  G#2 =  -  -  G2 =  -  -  G2 =  -  -
         C3 =  -  -  G2 =  -  -  C3 =  =  =  -  -  -  -`,
    tri: `C2 -  -  C2 -  -  C2 -  B1 -  -  B1 -  -  B1 -
          A#1 -  -  A#1 -  -  A#1 -  A1 -  -  A1 -  -  A1 -
          G#1 -  -  G#1 -  -  G#1 -  G1 -  G1 -  G1 -  G1 -
          C2 -  -  C2 -  -  G1 -  C2 -  -  -  -  -  -  -`,
    dr: `k...h...s...h... k...h...s...h... k...h...s...h... k...h...s..hs.h.`,
  },
  // Gamez Corner — bouncy, sly, chromatic runs
  casino: {
    bpm: 132,
    p1: `A4 -  A4 -  C5 =  A4 -  G4 -  E4 =  =  =  -  -
         F4 -  F4 -  A4 =  F4 -  E4 -  C4 =  =  =  -  -
         D4 -  D#4 -  E4 -  F4 -  F#4 -  G4 =  E4 =  C4 =
         A3 -  B3 -  C4 -  D4 -  E4 =  =  =  -  -  -  -`,
    p2: `-  E3 -  E3 -  E3 -  E3 -  C3 -  C3 -  C3 -  C3
         -  D3 -  D3 -  D3 -  D3 -  C3 -  C3 -  C3 -  C3
         -  F3 -  F3 -  F3 -  F3 -  E3 -  E3 -  E3 -  E3
         -  F3 -  F3 -  G3 -  G3 -  C3 -  C3 -  G3 -  G3`,
    tri: `A1 -  A2 -  A1 -  A2 -  C2 -  C3 -  C2 -  C3 -
          F1 -  F2 -  F1 -  F2 -  C2 -  C3 -  C2 -  C3 -
          D2 -  D3 -  D#2 -  D#3 -  E2 -  E3 -  C2 -  C3 -
          F1 -  F2 -  G1 -  G2 -  A1 -  A2 -  G1 -  G2 -`,
    dr: `k.h.h.k.h.k.h.h. k.h.h.k.h.k.h.h. k.h.h.k.h.k.h.h. k.h.s.h.k.h.s.h.`,
  },
  // Battle — driving
  battle: {
    bpm: 164,
    p1: `E4 E4 -  E4 G4 =  E4 -  D4 D4 -  D4 F4 =  D4 -
         C4 C4 -  C4 E4 =  G4 =  A4 =  G4 =  F4 =  D4 =
         E4 -  G4 -  B4 =  =  =  A4 -  F4 -  D4 =  =  =
         E4 =  B3 =  E4 =  G4 =  F#4 =  D#4 =  B3 =  =  =`,
    p2: `-  -  B3 -  -  B3 -  -  -  -  A3 -  -  A3 -  -
         -  -  G3 -  -  G3 -  -  C4 =  B3 =  A3 =  F3 =
         G3 -  -  G3 -  -  G3 -  F3 -  -  F3 -  -  F3 -
         G3 =  F#3 =  G3 =  B3 =  A3 =  F#3 =  D#3 =  -  -`,
    tri: `E2 E2 E2 E2 E2 E2 E2 E2 D2 D2 D2 D2 D2 D2 D2 D2
          C2 C2 C2 C2 C2 C2 C2 C2 D2 D2 D2 D2 D2 D2 D2 D2
          E2 E2 E2 E2 E2 E2 E2 E2 F2 F2 F2 F2 F2 F2 F2 F2
          E2 E2 B1 B1 E2 E2 G2 G2 B1 B1 B1 B1 E2 E2 E2 E2`,
    dr: `k.h.s.h.k.h.s.h. k.h.s.h.k.h.s.h. k.h.s.h.k.h.s.h. k.h.s.h.k.s.k.s.`,
  },
  // Victory — bright loop
  victory: {
    bpm: 140,
    p1: `C5 =  =  G4 =  =  E4 =  C4 -  E4 -  G4 =  =  =
         A4 =  =  F4 =  =  C4 =  F4 -  A4 -  C5 =  =  =`,
    p2: `E4 =  =  C4 =  =  G3 =  -  -  -  -  E4 =  =  =
         C4 =  =  A3 =  =  F3 =  -  -  -  -  E4 =  =  =`,
    tri: `C2 -  G1 -  C2 -  G1 -  C2 -  C2 -  G1 -  G1 -
          F1 -  C2 -  F1 -  C2 -  F1 -  G1 -  C2 -  C2 -`,
    dr: `k.h.s.h.k.h.s.h. k.h.s.h.k.s.s.s.`,
  },
  // Mt. Möön caves — sparse minor drone, moody and slow (CH2.5)
  cave: {
    bpm: 88,
    p1: `-  -  A3 =  =  =  -  -  -  -  -  -  C4 =  =  =
         -  -  -  -  B3 =  =  =  -  -  -  -  -  -  -  -
         -  -  G3 =  =  =  -  -  -  -  A3 =  =  =  -  -
         -  -  -  -  -  -  E3 =  =  =  =  =  -  -  -  -`,
    p2: `-  -  -  -  -  -  -  -  E3 =  =  =  -  -  -  -
         -  -  -  -  -  -  -  -  -  -  -  -  D3 =  =  =
         -  -  -  -  -  -  -  -  C3 =  =  =  -  -  -  -
         -  -  -  -  -  -  -  -  -  -  -  -  -  -  -  -`,
    tri: `A2 =  =  =  =  =  =  =  E2 =  =  =  =  =  =  =
          F2 =  =  =  =  =  =  =  G2 =  =  =  =  =  =  =
          A2 =  =  =  =  =  =  =  D2 =  =  =  =  =  =  =
          E2 =  =  =  =  =  =  =  =  =  =  =  =  =  =  =`,
    dr: `k...h........... ................ k............... ....k...h.......`,
  },
  // NUGGET SPAN — bright, marching con-job energy (CH3.2)
  bridge: {
    bpm: 126,
    p1: `C4 -  E4 -  G4 -  C5 -  G4 -  E4 -  D4 -  C4 -
         D4 -  F4 -  A4 -  D5 -  A4 -  F4 -  E4 -  D4 -
         E4 -  G4 -  C5 -  E5 -  C5 -  G4 -  F4 -  E4 -
         C4 =  =  =  =  =  -  -  G4 =  =  =  =  =  -  -`,
    p2: `-  -  C3 =  -  -  C3 =  -  -  G3 =  -  -  -  -
         -  -  D3 =  -  -  D3 =  -  -  A3 =  -  -  -  -
         -  -  E3 =  -  -  E3 =  -  -  G3 =  -  -  -  -
         C3 =  =  =  =  =  -  -  G3 =  =  =  =  =  -  -`,
    tri: `C2 -  C2 -  C2 -  C2 -  C2 -  C2 -  G1 -  G1 -
          D2 -  D2 -  D2 -  D2 -  D2 -  D2 -  A1 -  A1 -
          E2 -  E2 -  E2 -  E2 -  E2 -  E2 -  G1 -  G1 -
          C2 -  C2 -  C2 -  G1 -  C2 -  C2 -  C2 -  G1 -`,
    dr: `k.s.k.s.k.s.k.s. k.s.k.s.k.s.k.s. k.s.k.s.k.s.k.s. k.s.k.s.k.h.h.h.`,
  },
  // CH4 — S.S. ANN: a shanty lilt in G, the gala band heard from the pier
  // (plan §7). Same 4-bar shape as `bridge`; the dock and all three decks
  // play it, so the ship sounds like one place.
  ship: {
    bpm: 118,
    p1: `G4 -  B4 -  D5 -  B4 -  G4 -  A4 -  B4 -  D4 -
         E4 -  G4 -  B4 -  G4 -  E4 -  F#4 - G4 -  D4 -
         C4 -  E4 -  G4 -  E4 -  C4 -  D4 -  E4 -  G4 -
         D4 =  =  =  -  -  F#4 - G4 =  =  =  =  =  -  -`,
    p2: `-  -  G3 =  -  -  G3 =  -  -  D3 =  -  -  D3 =
         -  -  E3 =  -  -  E3 =  -  -  B2 =  -  -  B2 =
         -  -  C3 =  -  -  C3 =  -  -  G2 =  -  -  G2 =
         D3 =  =  =  -  -  D3 =  G3 =  =  =  =  =  -  -`,
    tri: `G2 -  G2 -  D2 -  D2 -  G2 -  G2 -  D2 -  D2 -
          E2 -  E2 -  B1 -  B1 -  E2 -  E2 -  B1 -  B1 -
          C2 -  C2 -  G1 -  G1 -  C2 -  C2 -  G1 -  G1 -
          D2 -  D2 -  D2 -  D2 -  G2 -  G2 -  G2 -  G2 -`,
    dr: `k.h.s.h.k.h.s.h. k.h.s.h.k.h.s.h. k.h.s.h.k.h.s.h. k.h.s.h.k.s.s.s.`,
  },
  // Cold open — upbeat GB-fanfare energy, G major (ONB.9-FB: was too slow/minor)
  intro: {
    bpm: 150,
    p1: `D4 E4 F#4 G4 =  =  =  -  G4 A4 B4  C5 =  =  =  -
         D4 E4 F#4 G4 =  =  =  -  G4 A4 B4  C5 =  =  =  -
         D4 E4 F#4 G4 =  =  =  -  G4 A4 B4  C5 =  =  =  -
         D4 E4 F#4 G4 =  =  =  -  G4 F#4 E4 D4 =  =  =  -`,
    p2: `G3 G3 G3 G3 G3 G3 G3 G3  D3 D3 D3 D3 D3 D3 D3 D3
         E3 E3 E3 E3 E3 E3 E3 E3  C3 C3 C3 C3 C3 C3 C3 C3
         G3 G3 G3 G3 G3 G3 G3 G3  D3 D3 D3 D3 D3 D3 D3 D3
         E3 E3 E3 E3 E3 E3 E3 E3  D3 D3 D3 D3 D3 D3 D3 D3`,
    tri: `G2 G2 G2 G2 G2 G2 G2 G2  D2 D2 D2 D2 D2 D2 D2 D2
          E2 E2 E2 E2 E2 E2 E2 E2  C2 C2 C2 C2 C2 C2 C2 C2
          G2 G2 G2 G2 G2 G2 G2 G2  D2 D2 D2 D2 D2 D2 D2 D2
          E2 E2 E2 E2 E2 E2 E2 E2  D2 D2 D2 D2 D2 D2 D2 D2`,
    dr: `k.h.k.h.k.h.k.h. k.h.k.h.k.h.k.h. k.h.k.h.k.h.k.h. k.h.k.h.k.h.k.h.`,
  },
  // Dig site — same drone family as cave, a little more movement (CH2 AUD.3)
  cave2: {
    bpm: 92,
    p1: `-  -  A3 =  =  -  C4 =  -  B3 =  -  -  -  A3 =
         -  -  B3 =  -  -  A3 =  -  -  G3 =  -  -  -  -
         -  -  G3 =  =  -  A3 =  -  C4 =  -  -  -  B3 =
         -  -  -  E3 =  =  =  -  A3 =  -  -  -  -  -  -`,
    p2: `-  -  -  -  -  -  -  -  E3 =  =  -  -  -  D3 =
         -  -  -  -  C3 =  =  -  -  -  -  -  B2 =  =  -
         -  -  -  -  -  -  -  -  D3 =  =  -  -  -  C3 =
         -  -  E3 =  -  -  -  -  -  -  -  -  -  -  -  -`,
    tri: `A2 =  =  =  E2 =  =  =  A2 =  =  =  E2 =  =  =
          F2 =  =  =  C2 =  =  =  G2 =  =  =  D2 =  =  =
          A2 =  =  =  E2 =  =  =  D2 =  =  =  A2 =  =  =
          E2 =  =  =  B1 =  =  =  E2 =  =  =  E2 =  =  =`,
    dr: `k...h...k...h... ....h.......h... k...h...k...h... ....k...h...h...`,
  },
};
