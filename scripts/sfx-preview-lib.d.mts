// Hand-written declaration so the vitest suite can import the .mjs under
// `tsc --noEmit` (scripts/ stays plain JS — node runs it without a build step).
import type { SfxStep } from '../src/data/sfx';
import type { Track } from '../src/data/music';
export declare const SR: number;
export declare const DRUM_LEN: Record<'k' | 's' | 'h', number>;
export declare function freq(tok: string): number;
export declare function parse(str: string): string[];
export declare function renderSfx(steps: readonly SfxStep[]): Float32Array;
export declare function renderTrack(track: Track): Float32Array;
export declare function wav(samples: ArrayLike<number>, sr?: number): Buffer;
