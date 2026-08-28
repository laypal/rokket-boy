// Hand-written declaration so the vitest suite can import the .mjs under
// `tsc --noEmit` (scripts/ stays plain JS).
export declare function encodePng(width: number, height: number, rgb: Buffer): Buffer;
export declare function renderIcon(rows: readonly string[], palette: readonly string[], size: number, scale: number): Buffer;
