// Hand-written declaration so the vitest suite can import the .mjs under
// `tsc --noEmit` (scripts/ stays plain JS).
export declare function composeEmblem(tl: readonly string[], tr: readonly string[], bl: readonly string[], br: readonly string[]): string[];
export declare function emblemSvg(rows: readonly string[], palette: readonly string[]): string;
export declare function svgDataUri(svg: string): string;
