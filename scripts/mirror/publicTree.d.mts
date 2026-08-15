// Hand-written declaration so the vitest suite can import the .mjs under
// `tsc --noEmit` (scripts/ stays plain JS — node runs it without a build step).
export interface ScrubPattern {
  regex: RegExp;
  /** files (repo-relative) where this pattern is permitted */
  allow: Set<string>;
}
export declare function listPublicFiles(root: string): string[];
export declare function readScrubPatterns(root: string): ScrubPattern[] | null;
export declare function findScrubHits(root: string, files: string[], patterns: ScrubPattern[]): string[];
