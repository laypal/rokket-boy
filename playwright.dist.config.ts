import { defineConfig } from '@playwright/test';

// PKG.3 — the offline/PWA proof against the BUILT single file (run
// `npm run build` first; `npm run test:e2e:dist`). Separate from
// playwright.config.ts on purpose: that gate drives the dev server, whose
// module graph a one-entry service-worker cache can't cover.
export default defineConfig({
  testDir: 'e2e-dist',
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:5198',
    viewport: { width: 480, height: 800 },
  },
  webServer: {
    command: 'node scripts/serve-dist.mjs 5198',
    port: 5198,
    reuseExistingServer: false,
    timeout: 15_000,
  },
});
