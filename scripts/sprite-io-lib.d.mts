// Hand-written declaration so the vitest suite can import the .mjs under
// `tsc --noEmit` (scripts/ stays plain JS — node runs it without a build step).
import type { PNG } from 'pngjs';
export declare function validateRows(rows: readonly string[]): string[];
export declare function rowsToPng(rows: readonly string[], pal: readonly string[], scale?: number): Buffer;
export declare function pngToRows(png: PNG, pal: readonly string[], scale?: number): string[];
export declare function parseSprite(src: string, name: string): string[];
export declare function formatSprite(name: string, rows: readonly string[]): string;
export declare function replaceSprite(src: string, name: string, rows: readonly string[]): string;
export declare function paletteFor(monsSrc: string, constName: string): string;
export declare function parsePalette(src: string, name: string): string[];
