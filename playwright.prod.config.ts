import { defineConfig } from '@playwright/test';

// Opt-in smoke against the live deployment: `npm run test:e2e:prod`.
// Deliberately separate from playwright.config.ts — the normal gate must
// never depend on the network or on production being up.
export default defineConfig({
  testDir: 'e2e-prod',
  timeout: 30_000,
  use: {
    baseURL: process.env.PROD_URL ?? 'https://rokket-boy.uk',
    viewport: { width: 480, height: 800 },
  },
});
