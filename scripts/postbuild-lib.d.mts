// Hand-written declaration so the vitest suite can import the .mjs under
// `tsc --noEmit` (scripts/ stays plain JS — node runs it without a build step).
export declare const SIZE_LIMIT_BYTES: number;
export declare function checkArtifactSize(bytes: number, limitBytes: number): string | null;
