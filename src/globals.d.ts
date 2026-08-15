// Build-time constants injected by vite.config.ts `define` (HRD.3).
// __BUILD__: short git SHA + build date, rendered on the title screen.
// __STAGING__: true only in the staging build (D4, 2026-08-11) — gates the
// read-only window.__rokket.report() surface; prod ships clean of it.
declare const __BUILD__: string;
declare const __STAGING__: boolean;
